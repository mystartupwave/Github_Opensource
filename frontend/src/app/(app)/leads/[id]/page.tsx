"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  Hand,
  Mail,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Phone,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, followupState, isoToLocalInput, localInputToIso, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Activity, Followup, Lead, Note } from "@/lib/types";
import { Avatar, Badge, ConfirmModal, Dot, Dropdown, Empty, Field, MenuDivider, MenuItem, Modal, PageLoader, Spinner, Tabs, useToast } from "@/components/ui";
import { LeadFormModal, TagPicker } from "@/components/LeadForm";
import { Timeline } from "@/components/Timeline";
import { ContactMenu, QuickContact } from "@/components/ContactMenu";

type Detail = { lead: Lead; notes: Note[]; followups: Followup[]; activities: Activity[] };

const FU_TYPES = [
  ["call", "📞 Call"],
  ["meeting", "🤝 Meeting"],
  ["whatsapp", "💬 WhatsApp"],
  ["email", "📧 Email"],
  ["other", "📝 Other"],
] as const;
const fuLabel = (t: string) => FU_TYPES.find(([k]) => k === t)?.[1] ?? t;

function FollowupForm({ leadId, onDone }: { leadId: number; onDone: () => void }) {
  const toast = useToast();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  const [due, setDue] = useState(isoToLocalInput(tomorrow.toISOString()));
  const [type, setType] = useState("call");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const quick = (days: number, hour = 11) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    setDue(isoToLocalInput(d.toISOString()));
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/leads/${leadId}/followups`, { method: "POST", json: { due_at: localInputToIso(due), type, note: note || null } });
      toast("Follow-up scheduled");
      setNote("");
      onDone();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-2.5">
      <div className="flex flex-wrap gap-1">
        {[
          ["Today 5pm", 0, 17],
          ["Tomorrow", 1, 11],
          ["In 3 days", 3, 11],
          ["Next week", 7, 11],
        ].map(([l, d, h]) => (
          <button key={l as string} type="button" onClick={() => quick(d as number, h as number)} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] xl:grid-cols-1 2xl:grid-cols-[1fr_auto]">
        <input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} required />
        <select className="input sm:w-auto xl:w-full 2xl:w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          {FU_TYPES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <input className="input" placeholder="What's it about? e.g. Call regarding quotation" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Spinner />} Schedule follow-up
      </button>
    </form>
  );
}

function ContactModal({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState("call");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Log contact with ${lead.name}`}
      width="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/leads/${lead.id}/contact`, { method: "POST", json: { channel, summary } });
                toast("Contact logged");
                setSummary("");
                onDone();
                onClose();
              } catch (e: any) {
                toast(e.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />} Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            ["call", "Phone call"],
            ["whatsapp", "WhatsApp"],
            ["email", "Email"],
            ["meeting", "Meeting"],
            ["sms", "SMS"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setChannel(k)} className={`rounded-full border px-3 py-1 text-sm ${channel === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        <Field label="Summary (optional)">
          <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was discussed?" />
        </Field>
      </div>
    </Modal>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { meta, me, can } = useSession();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"activity" | "notes">("activity");
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/leads/${id}`));
    } catch (e: any) {
      if (e.status === 404) setNotFound(true);
      else toast(e.message, "error");
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound)
    return (
      <Empty
        title="Lead not found"
        hint="It may have been deleted, or it isn't assigned to you."
        action={
          <Link href="/leads" className="btn-secondary">
            Back to leads
          </Link>
        }
      />
    );
  if (!d || !meta || !me) return <PageLoader />;
  const { lead } = d;
  const canEdit = can("leads.edit");
  const canAssign = can("leads.assign");

  async function patch(body: Record<string, unknown>, msg?: string) {
    try {
      await api(`/api/leads/${lead.id}`, { method: "PATCH", json: body });
      if (msg) toast(msg);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await api(`/api/leads/${lead.id}/notes`, { method: "POST", json: { content: note } });
      setNote("");
      load();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSavingNote(false);
    }
  }

  async function updateFollowup(f: Followup, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/followups/${f.id}`, { method: "PATCH", json: body });
      toast(msg);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  const pending = d.followups.filter((f) => f.status === "pending");
  const done = d.followups.filter((f) => f.status !== "pending");
  const next = pending[0];
  const fields = meta.custom_fields.filter((f) => f.is_active || lead.custom[f.key] !== undefined);
  const showClaim = !lead.assigned_to && meta.shared_mode && !me.is_admin;

  async function claimLead() {
    try {
      await api(`/api/leads/${lead.id}/claim`, { method: "POST" });
      toast("Lead claimed");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  const moreMenu = (
    <Dropdown
      align="right"
      width={220}
      title="Lead actions"
      trigger={({ toggle }) => (
        <button className="btn-secondary px-2.5" onClick={toggle} aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <MenuItem
            icon={<NotebookPen className="h-4 w-4 text-slate-400" />}
            onClick={() => {
              close();
              setContactOpen(true);
            }}
          >
            Log a contact
          </MenuItem>
          {canEdit && (
            <MenuItem
              icon={<Pencil className="h-4 w-4 text-slate-400" />}
              onClick={() => {
                close();
                setEditOpen(true);
              }}
            >
              Edit lead
            </MenuItem>
          )}
          {can("leads.delete") && (
            <>
              <MenuDivider />
              <MenuItem
                danger
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  close();
                  setConfirmDel(true);
                }}
              >
                Delete lead
              </MenuItem>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );

  return (
    <div className="mx-auto max-w-6xl pb-16 md:pb-0">
      <button onClick={() => router.back()} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="card mb-4 p-4 sm:mb-6 sm:p-5">
        <div className="flex flex-wrap items-start gap-3 sm:gap-4">
          <Avatar name={lead.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{lead.name}</h1>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">{lead.code}</span>
              {lead.enquiry_count > 1 && (
                <Badge color="#0284c7">
                  <Repeat className="h-3 w-3" /> {lead.enquiry_count} enquiries
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-700">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> {lead.phone}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-700">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> {lead.email}
                </a>
              )}
              {lead.company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" /> {lead.company}
                </span>
              )}
            </div>
          </div>
          <div className="hidden flex-wrap gap-2 md:flex">
            <QuickContact lead={lead} onContacted={load} />
            {showClaim && (
              <button className="btn-primary" onClick={claimLead}>
                <Hand className="h-4 w-4" /> Claim lead
              </button>
            )}
            <ContactMenu lead={lead} variant="button" onContacted={load} />
            {moreMenu}
          </div>
        </div>

        {/* Status stepper */}
        {showClaim && (
          <button className="btn-primary mt-4 w-full md:hidden" onClick={claimLead}>
            <Hand className="h-4 w-4" /> Claim lead
          </button>
        )}
        <div className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:mt-5 sm:flex-wrap sm:px-0">
          {meta.statuses.map((s) => {
            const active = lead.status?.id === s.id;
            return (
              <button
                key={s.id}
                disabled={!canEdit || active}
                onClick={() => patch({ status_id: s.id }, `Status → ${s.name}`)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition disabled:cursor-default sm:py-1 ${
                  active ? "border-transparent font-medium text-white" : "border-slate-200 text-slate-600 enabled:hover:border-slate-300 enabled:hover:bg-slate-50"
                }`}
                style={active ? { backgroundColor: s.color } : undefined}
              >
                {!active && <Dot color={s.color} />}
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        {/* Left: details + timeline. "contents" below xl lets the cards re-order in one column. */}
        <div className="contents xl:col-span-2 xl:block xl:space-y-6">
          <div className="card order-2 p-4 sm:p-5 xl:order-none">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Priority">
                <select className="input" disabled={!canEdit} value={lead.priority?.id ?? ""} onChange={(e) => patch({ priority_id: e.target.value ? Number(e.target.value) : null }, "Priority updated")}>
                  <option value="">—</option>
                  {meta.priorities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assigned to">
                <select
                  className="input"
                  disabled={!canAssign}
                  value={lead.assigned_to?.id ?? ""}
                  onChange={(e) => patch({ assigned_to_id: e.target.value ? Number(e.target.value) : null }, "Lead reassigned")}
                >
                  <option value="">Unassigned</option>
                  {meta.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select className="input" disabled={!canEdit} value={lead.source?.id ?? ""} onChange={(e) => patch({ source_id: e.target.value ? Number(e.target.value) : null }, "Source updated")}>
                  <option value="">—</option>
                  {meta.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tags">
                {canEdit ? (
                  <TagPicker value={lead.tags.map((t) => t.id)} onChange={(ids) => patch({ tag_ids: ids })} />
                ) : (
                  <div className="flex flex-wrap gap-1 py-2">
                    {lead.tags.map((t) => (
                      <Badge key={t.id} color={t.color}>
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
              {fields.map((f) => {
                const v = lead.custom[f.key];
                return (
                  <div key={f.id}>
                    <span className="label">{f.name}</span>
                    <p className="py-1 text-sm text-slate-800">
                      {v === undefined || v === null || v === "" ? (
                        <span className="text-slate-400">—</span>
                      ) : Array.isArray(v) ? (
                        v.join(", ")
                      ) : typeof v === "boolean" ? (
                        v ? "Yes" : "No"
                      ) : f.field_type === "currency" ? (
                        `${meta.company.currency_symbol}${Number(v).toLocaleString("en-IN")}`
                      ) : f.field_type === "date" ? (
                        fmtDate(String(v))
                      ) : (
                        String(v)
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            {(lead.message || lead.notes) && (
              <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {lead.message && (
                  <div>
                    <span className="label">Enquiry message</span>
                    <p className="text-sm whitespace-pre-wrap text-slate-700">{lead.message}</p>
                  </div>
                )}
                {lead.notes && (
                  <div>
                    <span className="label">Notes</span>
                    <p className="text-sm whitespace-pre-wrap text-slate-700">{lead.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card order-3 p-4 sm:p-5 xl:order-none">
            <Tabs
              tabs={[
                { key: "activity", label: `Activity (${d.activities.length})` },
                { key: "notes", label: `Notes (${d.notes.length})` },
              ]}
              value={tab}
              onChange={setTab}
            />
            <form onSubmit={addNote} className="mb-6">
              <textarea
                className="input"
                rows={2}
                placeholder="Add a note… (Ctrl+Enter to save)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote(e);
                }}
              />
              {note.trim() && (
                <div className="mt-2 flex justify-end">
                  <button className="btn-primary btn-sm" disabled={savingNote}>
                    {savingNote && <Spinner />} Add note
                  </button>
                </div>
              )}
            </form>
            {tab === "activity" ? (
              <Timeline items={d.activities} />
            ) : d.notes.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No notes yet</p>
            ) : (
              <ul className="space-y-3">
                {d.notes.map((n) => (
                  <li key={n.id} className="group rounded-lg border border-slate-100 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                      <Avatar name={n.user?.name ?? "System"} size={20} />
                      <span className="font-medium text-slate-700">{n.user?.name ?? "System"}</span>
                      <span title={fmtDateTime(n.created_at)}>{relative(n.created_at)}</span>
                      {(n.user?.id === me.id || me.is_admin) && (
                        <button
                          className="ml-auto text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
                          onClick={async () => {
                            await api(`/api/leads/${lead.id}/notes/${n.id}`, { method: "DELETE" });
                            load();
                          }}
                          aria-label="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-slate-800">{n.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: follow-ups + facts */}
        <div className="contents xl:block xl:space-y-6">
          <div className="card order-1 p-4 sm:p-5 xl:order-none">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <CalendarClock className="h-4 w-4 text-slate-400" /> Next follow-up
            </h2>
            {next ? (
              <div
                className={`mb-4 rounded-lg p-3 ${
                  followupState(next.due_at) === "overdue" ? "bg-red-50" : followupState(next.due_at) === "today" ? "bg-amber-50" : "bg-slate-50"
                }`}
              >
                <p className="text-sm font-medium">📅 {fmtDate(next.due_at)}</p>
                <p className="text-sm text-slate-600">
                  ⏰ {new Date(next.due_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · {fuLabel(next.type)}
                </p>
                {next.note && <p className="mt-1 text-sm text-slate-700">📝 {next.note}</p>}
                {followupState(next.due_at) === "overdue" && <p className="mt-1 text-xs font-medium text-red-600">Overdue by {relative(next.due_at).replace(" ago", "")}</p>}
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => updateFollowup(next, { status: "done" }, "Follow-up completed")}>
                    <Check className="h-3.5 w-3.5" /> Done
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => updateFollowup(next, { status: "cancelled" }, "Follow-up cancelled")}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-slate-500">No follow-up scheduled.</p>
            )}
            {pending.length > 1 && (
              <ul className="mb-4 space-y-2">
                {pending.slice(1).map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">
                      {fmtDateTime(f.due_at)} · {f.note || fuLabel(f.type)}
                    </span>
                    <button className="text-slate-400 hover:text-emerald-600" onClick={() => updateFollowup(f, { status: "done" }, "Follow-up completed")} aria-label="Mark done">
                      <Check className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FollowupForm leadId={lead.id} onDone={load} />
            {done.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setShowDone((s) => !s)}>
                  {showDone ? "Hide" : "Show"} {done.length} past follow-up{done.length === 1 ? "" : "s"}
                </button>
                {showDone && (
                  <ul className="mt-2 space-y-1.5">
                    {done.map((f) => (
                      <li key={f.id} className="text-xs text-slate-500">
                        <span className={f.status === "done" ? "text-emerald-600" : "text-slate-400"}>{f.status === "done" ? "✓" : "✕"}</span> {fmtDateTime(f.due_at)} · {f.note || fuLabel(f.type)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="card order-4 p-4 text-sm sm:p-5 xl:order-none">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="space-y-2.5">
              {[
                ["Created", fmtDateTime(lead.created_at)],
                ["Created by", lead.created_by?.name ?? "Website / API"],
                ["Last contact", lead.last_contact_at ? `${fmtDateTime(lead.last_contact_at)}` : "Never"],
                ["Converted", lead.converted_at ? fmtDateTime(lead.converted_at) : "—"],
                ["Last updated", relative(lead.updated_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className="min-w-0 text-right text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:bottom-0 sm:pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden">
        <QuickContact lead={lead} onContacted={load} compact />
        <ContactMenu lead={lead} onContacted={load} />
        {moreMenu}
      </div>

      <LeadFormModal open={editOpen} onClose={() => setEditOpen(false)} lead={lead} onSaved={() => load()} />
      <ContactModal lead={lead} open={contactOpen} onClose={() => setContactOpen(false)} onDone={load} />
      <ConfirmModal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title={`Delete ${lead.name}?`}
        message="The lead will be removed from lists and reports. Its history stays in the activity log."
        onConfirm={async () => {
          await api(`/api/leads/${lead.id}`, { method: "DELETE" });
          toast("Lead deleted");
          router.replace("/leads");
        }}
      />
    </div>
  );
}
