"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, CalendarClock, Check, Flame, List, Phone, Plus, Search } from "lucide-react";
import { api, qs, tzOffset } from "@/lib/api";
import { fmtDate, followupState } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Lead } from "@/lib/types";
import { Avatar, Dot, Dropdown, MultiSelect, PageHeader, PageLoader, useToast } from "@/components/ui";
import { ContactMenu } from "@/components/ContactMenu";
import type { Meta } from "@/lib/types";
import { LeadFormModal } from "@/components/LeadForm";

type Column = { status: { id: number; name: string; color: string; category: string }; count: number; leads: Lead[] };

function Card({
  lead,
  draggable,
  onDragStart,
  statuses,
  onMove,
  onOpen,
}: {
  lead: Lead;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  statuses: Meta["statuses"];
  onMove: ((statusId: number) => void) | null;
  onOpen: () => void;
}) {
  const fu = followupState(lead.next_followup_at);
  return (
    <div
      role="link"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="block cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition select-none hover:border-slate-300 hover:shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
          {lead.company && <p className="truncate text-xs text-slate-500">{lead.company}</p>}
        </div>
        {lead.assigned_to && <Avatar name={lead.assigned_to.name} size={22} />}
      </div>
      {lead.phone && (
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <Phone className="h-3 w-3" /> {lead.phone}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.priority && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: lead.priority.color }}>
            {lead.priority.order === 0 && <Flame className="h-3 w-3" />}
            {lead.priority.name}
          </span>
        )}
        {lead.source && <span className="text-[11px] text-slate-400">· {lead.source.name}</span>}
        {lead.next_followup_at && (
          <span className={`ml-auto inline-flex items-center gap-0.5 text-[11px] ${fu === "overdue" ? "text-red-600" : fu === "today" ? "text-amber-600" : "text-slate-400"}`}>
            <CalendarClock className="h-3 w-3" />
            {fu === "overdue" ? "Overdue" : fu === "today" ? "Today" : fmtDate(lead.next_followup_at).slice(0, 6)}
          </span>
        )}
      </div>
      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((t) => (
            <span key={t.id} className="rounded px-1.5 text-[10px] font-medium text-white" style={{ backgroundColor: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {onMove ? (
          <Dropdown
            title="Move to stage"
            width={220}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Move
              </button>
            )}
          >
            {(close) =>
              statuses.map((st) => {
                const current = lead.status?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={current}
                    onClick={() => {
                      onMove(st.id);
                      close();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 disabled:bg-slate-50 sm:py-2"
                  >
                    <Dot color={st.color} />
                    <span className="flex-1">{st.name}</span>
                    {current && <Check className="h-4 w-4 text-brand-600" />}
                  </button>
                );
              })
            }
          </Dropdown>
        ) : (
          <span />
        )}
        <ContactMenu lead={lead} />
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { meta, can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [cols, setCols] = useState<Column[] | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const p: Record<string, string> = {};
    ["q", "assigned_to", "source", "priority", "tag", "followup"].forEach((k) => sp.get(k) && (p[k] = sp.get(k)!));
    const r = await api<{ columns: Column[] }>(`/api/leads/pipeline${qs({ ...p, tz_offset: tzOffset() })}`);
    setCols(r.columns);
  }, [sp]);

  useEffect(() => {
    load().catch((e) => toast(e.message, "error"));
  }, [load, toast]);

  const setParam = (key: string, v: string[] | string | null) => {
    const next = new URLSearchParams(sp);
    const val = Array.isArray(v) ? v.join(",") : v;
    if (val) next.set(key, val);
    else next.delete(key);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",") : []);

  async function move(leadId: number, fromId: number, toId: number) {
    if (!cols || fromId === toId) return;
    const lead = cols.find((c) => c.status.id === fromId)?.leads.find((l) => l.id === leadId);
    if (!lead) return;
    const target = cols.find((c) => c.status.id === toId)!;
    const snapshot = cols;
    // Optimistic update.
    setCols(
      cols.map((c) =>
        c.status.id === fromId
          ? { ...c, count: c.count - 1, leads: c.leads.filter((l) => l.id !== leadId) }
          : c.status.id === toId
            ? { ...c, count: c.count + 1, leads: [{ ...lead, status: { ...lead.status!, ...target.status } as Lead["status"] }, ...c.leads] }
            : c,
      ),
    );
    try {
      await api(`/api/leads/${leadId}/move`, { method: "POST", json: { status_id: toId } });
      toast(`${lead.name} → ${target.status.name}`);
    } catch (e: any) {
      setCols(snapshot);
      toast(e.message, "error");
    }
  }

  if (!meta || !cols) return <PageLoader />;
  const canMove = can("leads.edit");

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col sm:h-[calc(100dvh-7rem)]">
      <PageHeader
        title="Pipeline"
        subtitle={canMove ? "Drag a card to another stage, or tap Move on the card." : "Read-only view of your pipeline."}
        actions={
          <>
            <Link href={`/leads${qs(Object.fromEntries(sp.entries()))}`} className="btn-secondary">
              <List className="h-4 w-4" /> <span className="hidden sm:inline">List view</span>
            </Link>
            {can("leads.create") && (
              <button className="btn-primary hidden sm:inline-flex md:hidden" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> New lead
              </button>
            )}
          </>
        }
      />
      <div className="no-scrollbar -mx-3 mb-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:mb-4 sm:flex-wrap sm:overflow-visible sm:px-0">
        <form
          className="relative w-44 shrink-0 sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", q.trim() || null);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-9" placeholder="Filter cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {(can("leads.view_all") || meta.shared_mode) && (
          <MultiSelect
            label="Manager"
            options={[{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }, ...meta.users.map((u) => ({ value: String(u.id), label: u.name }))]}
            value={list("assigned_to")}
            onChange={(v) => setParam("assigned_to", v)}
          />
        )}
        <MultiSelect label="Source" options={meta.sources.map((s) => ({ value: String(s.id), label: s.name, color: s.color }))} value={list("source")} onChange={(v) => setParam("source", v)} />
        <MultiSelect label="Priority" options={meta.priorities.map((p) => ({ value: String(p.id), label: p.name, color: p.color }))} value={list("priority")} onChange={(v) => setParam("priority", v)} />
        <MultiSelect label="Tags" options={meta.tags.map((t) => ({ value: String(t.id), label: t.name, color: t.color }))} value={list("tag")} onChange={(v) => setParam("tag", v)} />
      </div>

      <div className="-mx-3 flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:snap-none sm:px-6 lg:-mx-8 lg:px-8">
        {cols.map((col) => (
          <div
            key={col.status.id}
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              setDragOver(col.status.id);
            }}
            onDragLeave={() => setDragOver((d) => (d === col.status.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const [leadId, fromId] = e.dataTransfer.getData("text/plain").split(":").map(Number);
              move(leadId, fromId, col.status.id);
            }}
            className={`flex w-[85vw] max-w-[20rem] shrink-0 snap-center flex-col rounded-xl border transition sm:w-72 ${dragOver === col.status.id ? "border-brand-500 bg-brand-50/60" : "border-transparent bg-slate-100/70"}`}
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <Dot color={col.status.color} />
              <span className="text-sm font-semibold tracking-wide text-slate-700 uppercase">{col.status.name}</span>
              <span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-slate-500">{col.count}</span>
            </div>
            <div className="h-0.5 mx-3 mb-2 rounded-full" style={{ backgroundColor: col.status.color }} />
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {col.leads.map((l) => (
                <Card
                  key={l.id}
                  lead={l}
                  statuses={meta.statuses.filter((s) => s.show_in_pipeline)}
                  onMove={canMove ? (to) => move(l.id, col.status.id, to) : null}
                  onOpen={() => router.push(`/leads/${l.id}`)}
                  draggable={canMove}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", `${l.id}:${col.status.id}`);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                />
              ))}
              {col.leads.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Drop leads here</p>}
              {col.count > col.leads.length && (
                <Link href={`/leads?status=${col.status.id}`} className="block py-2 text-center text-xs text-brand-600 hover:underline">
                  +{col.count - col.leads.length} more in list view
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <LeadFormModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={() => load()} />
    </div>
  );
}
