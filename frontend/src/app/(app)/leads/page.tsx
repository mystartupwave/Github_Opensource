"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Download, Flame, Hand, Inbox, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { api, download, qs, tzOffset } from "@/lib/api";
import { fmtDate, fmtDateTime, followupState, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Lead, Page } from "@/lib/types";
import { Avatar, Badge, ConfirmModal, Empty, Modal, MultiSelect, PageHeader, PageLoader, Pagination, Spinner, StatusBadge, useToast } from "@/components/ui";
import { LeadFormModal } from "@/components/LeadForm";
import { ContactMenu } from "@/components/ContactMenu";

const FILTER_KEYS = ["q", "status", "category", "assigned_to", "source", "priority", "tag", "followup", "created_from", "created_to", "sort"] as const;
const PAGE_SIZE = 25;

function FollowupCell({ at }: { at: string | null }) {
  const st = followupState(at);
  if (!at) return <span className="text-slate-300">—</span>;
  const cls = st === "overdue" ? "text-red-600" : st === "today" ? "text-amber-600" : "text-slate-600";
  return (
    <span className={`text-xs md:text-sm ${cls}`} title={fmtDateTime(at)}>
      {st === "overdue" ? "Overdue · " : ""}
      {st === "today" ? "Today" : fmtDate(at)}
    </span>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setError("");
    }
  }, [open]);
  async function go() {
    if (!file) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api<{ created: number; errors: string[] }>("/api/leads/import", { method: "POST", body: fd });
      setResult(r);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import leads from CSV"
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!file || busy} onClick={go}>
              {busy && <Spinner />} Import
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            Imported <b>{result.created}</b> lead{result.created === 1 ? "" : "s"}.
          </p>
          {result.errors.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-slate-700">{result.errors.length} row(s) skipped:</p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-slate-500">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            The first row must be headers. Recognised columns: <code className="text-xs">Name</code> (required), Phone, Email, Company, Source, Status, Priority,
            Assigned To (email or name), Tags (comma-separated), Message, Notes, plus any custom field by name.
          </p>
          <p>Leads without an owner follow your assignment rules.</p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700" />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function MobileList({
  items,
  canBulk,
  selected,
  setSelected,
  sharedClaim,
  onClaim,
  onOpen,
  loading,
}: {
  items: Lead[];
  canBulk: boolean;
  selected: number[];
  setSelected: React.Dispatch<React.SetStateAction<number[]>>;
  sharedClaim: boolean;
  onClaim: (id: number) => void;
  onOpen: (id: number) => void;
  loading: boolean;
}) {
  const all = items.length > 0 && items.every((l) => selected.includes(l.id));
  return (
    <>
    {canBulk && (
      <label className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-xs font-medium text-slate-500 md:px-4 xl:hidden">
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand-600"
          checked={all}
          onChange={() => setSelected(all ? [] : items.map((l) => l.id))}
        />
        {selected.length ? `${selected.length} selected` : "Select all on this page"}
      </label>
    )}
    <ul className={`divide-y divide-slate-100 transition-opacity md:grid md:grid-cols-2 md:divide-y-0 xl:hidden ${loading ? "opacity-60" : ""}`}>
      {items.map((l) => {
        const on = selected.includes(l.id);
        return (
          <li key={l.id} className={`flex cursor-pointer gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-50 md:border-b md:border-slate-100 md:px-4 md:odd:border-r ${on ? "bg-brand-50/60" : ""}`} onClick={() => onOpen(l.id)}>
            {canBulk && (
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-brand-600"
                checked={on}
                onClick={(e) => e.stopPropagation()}
                onChange={() => setSelected((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))}
                aria-label={`Select ${l.name}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-medium text-slate-900">
                  {l.name}
                  {l.enquiry_count > 1 && <span className="ml-1.5 rounded bg-sky-50 px-1 text-[11px] font-medium text-sky-700">×{l.enquiry_count}</span>}
                </p>
                <StatusBadge status={l.status} />
              </div>
              <p className="truncate text-xs text-slate-500">
                {l.code}
                {l.company && ` · ${l.company}`}
                {l.source && ` · ${l.source.name}`}
              </p>
              <p className="mt-0.5 truncate text-sm text-slate-600">{l.phone ?? l.email ?? "No contact details"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {l.assigned_to ? (
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Avatar name={l.assigned_to.name} size={18} />
                    {l.assigned_to.name.split(" ")[0]}
                  </span>
                ) : sharedClaim ? (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClaim(l.id);
                    }}
                  >
                    <Hand className="h-3.5 w-3.5" /> Claim
                  </button>
                ) : (
                  <span className="text-slate-400">Unassigned</span>
                )}
                {l.priority && (
                  <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: l.priority.color }}>
                    {l.priority.order === 0 && <Flame className="h-3 w-3" />}
                    {l.priority.name}
                  </span>
                )}
                {l.next_followup_at && <FollowupCell at={l.next_followup_at} />}
                {l.tags.slice(0, 2).map((t) => (
                  <Badge key={t.id} color={t.color} className="px-1.5 py-0 text-[11px]">
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="shrink-0 self-center">
              <ContactMenu lead={l} />
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

export default function LeadsPage() {
  const { meta, me, can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState<Page<Lead> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [q, setQ] = useState(sp.get("q") ?? "");

  // "New Leads" nav item → filter on the default status.
  const defaultStatusId = meta?.statuses.find((s) => s.is_default)?.id ?? meta?.statuses[0]?.id;
  useEffect(() => {
    if (sp.get("view") === "new" && defaultStatusId) {
      const next = new URLSearchParams(sp);
      next.delete("view");
      next.set("status", String(defaultStatusId));
      router.replace(`${pathname}?${next}`);
    }
  }, [sp, defaultStatusId, pathname, router]);

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    FILTER_KEYS.forEach((k) => {
      const v = sp.get(k);
      if (v) p[k] = v;
    });
    sp.forEach((v, k) => k.startsWith("cf.") && v && (p[k] = v));
    return p;
  }, [sp]);
  const page = Number(sp.get("page") || 1);

  const load = useCallback(async () => {
    if (sp.get("view")) return;
    setLoading(true);
    try {
      setData(await api<Page<Lead>>(`/api/leads${qs({ ...params, page, page_size: PAGE_SIZE, tz_offset: tzOffset() })}`));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [params, page, sp, toast]);

  useEffect(() => {
    load();
    setSelected([]);
  }, [load]);

  const setParam = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(sp);
    const v = Array.isArray(value) ? value.join(",") : value;
    if (v) next.set(key, v);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };
  const list = (key: string) => (sp.get(key) ? sp.get(key)!.split(",") : []);
  const activeFilters = Object.keys(params).filter((k) => k !== "sort").length;

  if (!meta || !me) return <PageLoader />;
  const listFields = meta.custom_fields.filter((f) => f.is_active && f.show_in_list);
  const filterFields = meta.custom_fields.filter((f) => f.is_active && (f.field_type === "dropdown" || f.field_type === "multiselect"));
  const canBulk = can("leads.edit") || can("leads.assign") || can("leads.delete");
  const showManager = can("leads.view_all") || meta.shared_mode;

  async function bulk(action: string, extra: Record<string, unknown>) {
    try {
      const r = await api<{ affected: number }>("/api/leads/bulk", { method: "POST", json: { lead_ids: selected, action, ...extra } });
      toast(`Updated ${r.affected} lead${r.affected === 1 ? "" : "s"}`);
      setSelected([]);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  async function claim(id: number) {
    try {
      await api(`/api/leads/${id}/claim`, { method: "POST" });
      toast("Lead claimed — it's yours now");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  const title = params.category === "won" ? "Converted leads" : params.category === "lost" ? "Lost leads" : params.category === "open" ? "Open leads" : "Leads";
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((l) => selected.includes(l.id));

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={data ? `${data.total.toLocaleString("en-IN")} lead${data.total === 1 ? "" : "s"}${activeFilters ? " matching filters" : ""}` : " "}
        actions={
          <>
            <Link href={`/leads/pipeline${qs(params)}`} className="btn-secondary">
              <Columns3 className="h-4 w-4" /> <span className="hidden sm:inline">Pipeline</span>
            </Link>
            {can("leads.import") && (
              <button className="btn-secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Import</span>
              </button>
            )}
            {can("leads.export") && (
              <button
                className="btn-secondary"
                onClick={() => download(`/api/leads/export${qs({ ...params, tz_offset: tzOffset() })}`, "leads.csv").catch((e) => toast(e.message, "error"))}
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </button>
            )}
            {can("leads.create") && (
              <button className="btn-primary hidden sm:inline-flex md:hidden" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> New lead
              </button>
            )}
          </>
        }
      />

      <div className="card mb-4 space-y-3 p-3">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", q.trim() || null);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, phone, email, company or lead ID (LD-10042)…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== (sp.get("q") ?? "") && setParam("q", q.trim() || null)} />
        </form>
        <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <MultiSelect label="Status" options={meta.statuses.map((s) => ({ value: String(s.id), label: s.name, color: s.color }))} value={list("status")} onChange={(v) => setParam("status", v)} />
          {showManager && (
            <MultiSelect
              label="Manager"
              options={[
                { value: "me", label: "Assigned to me" },
                { value: "unassigned", label: "Unassigned" },
                ...meta.users.map((u) => ({ value: String(u.id), label: u.name })),
              ]}
              value={list("assigned_to")}
              onChange={(v) => setParam("assigned_to", v)}
            />
          )}
          <MultiSelect label="Source" options={meta.sources.map((s) => ({ value: String(s.id), label: s.name, color: s.color }))} value={list("source")} onChange={(v) => setParam("source", v)} />
          <MultiSelect label="Priority" options={meta.priorities.map((p) => ({ value: String(p.id), label: p.name, color: p.color }))} value={list("priority")} onChange={(v) => setParam("priority", v)} />
          <MultiSelect label="Tags" options={meta.tags.map((t) => ({ value: String(t.id), label: t.name, color: t.color }))} value={list("tag")} onChange={(v) => setParam("tag", v)} />
          <MultiSelect
            single
            label="Follow-up"
            options={[
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Due today" },
              { value: "tomorrow", label: "Due tomorrow" },
              { value: "upcoming", label: "Upcoming" },
              { value: "none", label: "No follow-up set" },
            ]}
            value={list("followup")}
            onChange={(v) => setParam("followup", v[0] ?? null)}
          />
          <MultiSelect
            single
            label="Stage"
            options={[
              { value: "open", label: "Open" },
              { value: "won", label: "Converted" },
              { value: "lost", label: "Lost" },
            ]}
            value={list("category")}
            onChange={(v) => setParam("category", v[0] ?? null)}
          />
          {filterFields.map((f) => (
            <MultiSelect key={f.id} single label={f.name} options={f.options.map((o) => ({ value: o, label: o }))} value={sp.get(`cf.${f.key}`) ? [sp.get(`cf.${f.key}`)!] : []} onChange={(v) => setParam(`cf.${f.key}`, v[0] ?? null)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex min-w-0 items-center gap-1 rounded-lg border px-2 py-1 text-sm ${params.created_from || params.created_to ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
            <span className="hidden text-slate-500 sm:inline">Created</span>
            <input type="date" aria-label="Created from" className="w-[8.5rem] min-w-0 bg-transparent text-sm outline-none" value={sp.get("created_from") ?? ""} onChange={(e) => setParam("created_from", e.target.value || null)} />
            <span className="text-slate-400">–</span>
            <input type="date" aria-label="Created to" className="w-[8.5rem] min-w-0 bg-transparent text-sm outline-none" value={sp.get("created_to") ?? ""} onChange={(e) => setParam("created_to", e.target.value || null)} />
          </div>
          <select className="native ml-auto rounded-lg border border-slate-200 bg-white py-1.5 pl-3 text-sm text-slate-600" value={sp.get("sort") ?? "created_desc"} onChange={(e) => setParam("sort", e.target.value === "created_desc" ? null : e.target.value)}>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="updated_desc">Recently updated</option>
            <option value="followup_asc">Next follow-up</option>
            <option value="contact_desc">Last contacted</option>
            <option value="enquiries_desc">Most enquiries</option>
            <option value="name_asc">Name A–Z</option>
          </select>
          {activeFilters > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => router.replace(pathname)}>
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="animate-in no-scrollbar fixed inset-x-3 bottom-20 z-30 flex items-center gap-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg sm:sticky sm:inset-x-auto sm:top-16 sm:bottom-auto sm:mb-3 sm:flex-wrap sm:overflow-visible">
          <span className="shrink-0 font-medium">{selected.length} selected</span>
          <span className="mx-1 h-4 w-px bg-slate-700" />
          {can("leads.assign") && (
            <select className="shrink-0 rounded-md bg-slate-800 px-2 py-1" value="" onChange={(e) => e.target.value && bulk("assign", { assigned_to_id: e.target.value === "none" ? null : Number(e.target.value) })}>
              <option value="">Assign to…</option>
              {meta.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              <option value="none">— Unassign —</option>
            </select>
          )}
          {can("leads.edit") && (
            <>
              <select className="shrink-0 rounded-md bg-slate-800 px-2 py-1" value="" onChange={(e) => e.target.value && bulk("status", { status_id: Number(e.target.value) })}>
                <option value="">Change status…</option>
                {meta.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="shrink-0 rounded-md bg-slate-800 px-2 py-1" value="" onChange={(e) => e.target.value && bulk("priority", { priority_id: Number(e.target.value) })}>
                <option value="">Priority…</option>
                {meta.priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="shrink-0 rounded-md bg-slate-800 px-2 py-1" value="" onChange={(e) => e.target.value && bulk("add_tags", { tag_ids: [Number(e.target.value)] })}>
                <option value="">Add tag…</option>
                {meta.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {can("leads.delete") && (
            <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-300 hover:bg-slate-800" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <button className="ml-auto shrink-0 text-slate-400 hover:text-white" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <Empty
            icon={<Inbox className="h-10 w-10" />}
            title={activeFilters ? "No leads match these filters" : "No leads yet"}
            hint={activeFilters ? "Try removing a filter or searching for something else." : "Create a lead, import a CSV, or connect your website form in Settings → Integrations."}
            action={
              activeFilters ? (
                <button className="btn-secondary" onClick={() => router.replace(pathname)}>
                  Clear filters
                </button>
              ) : can("leads.create") ? (
                <button className="btn-primary" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" /> New lead
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <MobileList
              items={items}
              canBulk={canBulk}
              selected={selected}
              setSelected={setSelected}
              sharedClaim={meta.shared_mode && !me.is_admin}
              onClaim={claim}
              onOpen={(id) => router.push(`/leads/${id}`)}
              loading={loading}
            />
            <div className={`hidden overflow-x-auto transition-opacity xl:block ${loading ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[960px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    {canBulk && (
                      <th className="th w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? [] : items.map((l) => l.id))}
                          aria-label="Select all"
                        />
                      </th>
                    )}
                    <th className="th">Lead</th>
                    <th className="th">Contact</th>
                    <th className="th">Status</th>
                    <th className="th">Priority</th>
                    <th className="th">Source</th>
                    <th className="th">Assigned</th>
                    {listFields.map((f) => (
                      <th key={f.id} className="th">
                        {f.name}
                      </th>
                    ))}
                    <th className="th">Next follow-up</th>
                    <th className="th">Created</th>
                    <th className="th relative w-12">
                      <span className="sr-only">Contact</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((l) => (
                    <tr key={l.id} className={`cursor-pointer hover:bg-slate-50 ${selected.includes(l.id) ? "bg-brand-50/50" : ""}`} onClick={() => router.push(`/leads/${l.id}`)}>
                      {canBulk && (
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-600"
                            checked={selected.includes(l.id)}
                            onChange={() => setSelected((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))}
                            aria-label={`Select ${l.name}`}
                          />
                        </td>
                      )}
                      <td className="td">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          {l.name}
                          {l.enquiry_count > 1 && (
                            <span className="rounded bg-sky-50 px-1.5 text-[11px] font-medium text-sky-700" title={`${l.enquiry_count} enquiries`}>
                              ×{l.enquiry_count}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {l.code}
                          {l.company && ` · ${l.company}`}
                        </div>
                        {l.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {l.tags.slice(0, 3).map((t) => (
                              <Badge key={t.id} color={t.color} className="px-1.5 py-0 text-[11px]">
                                {t.name}
                              </Badge>
                            ))}
                            {l.tags.length > 3 && <span className="text-[11px] text-slate-400">+{l.tags.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="td text-slate-600">
                        <div>{l.phone ?? "—"}</div>
                        <div className="max-w-[180px] truncate text-xs text-slate-400">{l.email}</div>
                      </td>
                      <td className="td">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="td">
                        {l.priority ? (
                          <span className="inline-flex items-center gap-1 text-sm" style={{ color: l.priority.color }}>
                            {l.priority.order === 0 && <Flame className="h-3.5 w-3.5" />}
                            {l.priority.name}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="td text-slate-600">{l.source?.name ?? "—"}</td>
                      <td className="td" onClick={(e) => l.assigned_to === null && meta.shared_mode && e.stopPropagation()}>
                        {l.assigned_to ? (
                          <span className="flex items-center gap-2 text-sm">
                            <Avatar name={l.assigned_to.name} size={22} />
                            {l.assigned_to.name}
                          </span>
                        ) : meta.shared_mode && !me.is_admin ? (
                          <button className="btn-secondary btn-sm" onClick={() => claim(l.id)}>
                            <Hand className="h-3.5 w-3.5" /> Claim
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400">Unassigned</span>
                        )}
                      </td>
                      {listFields.map((f) => {
                        const v = l.custom[f.key];
                        return (
                          <td key={f.id} className="td text-slate-600">
                            {v === undefined || v === null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : f.field_type === "currency" ? `${meta.company.currency_symbol}${Number(v).toLocaleString("en-IN")}` : String(v)}
                          </td>
                        );
                      })}
                      <td className="td">
                        <FollowupCell at={l.next_followup_at} />
                      </td>
                      <td className="td text-sm text-slate-500" title={fmtDateTime(l.created_at)}>
                        {relative(l.created_at)}
                      </td>
                      <td className="td">
                        <ContactMenu lead={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={(p) => {
              const next = new URLSearchParams(sp);
              next.set("page", String(p));
              router.replace(`${pathname}?${next}`);
            }} />
          </>
        )}
      </div>

      <LeadFormModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={() => load()} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selected.length} lead${selected.length === 1 ? "" : "s"}?`}
        message="Deleted leads disappear from lists and reports. Their activity stays in the audit log."
        onConfirm={async () => {
          await bulk("delete", {});
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
