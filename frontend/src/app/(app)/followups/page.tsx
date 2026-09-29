"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Check, Clock, X } from "lucide-react";
import { api, qs, tzOffset } from "@/lib/api";
import { dayLabel, fmtDateTime, fmtTime, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Followup } from "@/lib/types";
import { Avatar, Empty, Modal, PageHeader, PageLoader, StatusBadge, useToast } from "@/components/ui";
import { ContactMenu } from "@/components/ContactMenu";

const BUCKETS = [
  ["overdue", "Overdue", "text-red-600"],
  ["today", "Today", "text-amber-600"],
  ["tomorrow", "Tomorrow", "text-sky-600"],
  ["upcoming", "Later", "text-slate-600"],
  ["done", "Completed", "text-emerald-600"],
] as const;
type Bucket = (typeof BUCKETS)[number][0];

const TYPE_ICON: Record<string, string> = { call: "📞", meeting: "🤝", whatsapp: "💬", email: "📧", other: "📝" };

export default function FollowupsPage() {
  const { meta, can } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const bucket = (sp.get("bucket") as Bucket) || "today";
  const assigned = sp.get("assigned_to") ?? "";
  const [items, setItems] = useState<Followup[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [completing, setCompleting] = useState<Followup | null>(null);
  const [outcome, setOutcome] = useState("");

  const load = useCallback(async () => {
    const common = { tz_offset: tzOffset(), assigned_to: assigned || undefined };
    const [list, summary] = await Promise.all([
      api<{ items: Followup[] }>(`/api/followups${qs({ ...common, bucket, page_size: 200 })}`),
      api<Record<string, number>>(`/api/followups/summary${qs(common)}`),
    ]);
    setItems(list.items);
    setCounts(summary);
  }, [bucket, assigned]);

  useEffect(() => {
    load().catch((e) => toast(e.message, "error"));
  }, [load, toast]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next}`);
  };

  async function update(f: Followup, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/followups/${f.id}`, { method: "PATCH", json: body });
      toast(msg);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  async function snooze(f: Followup, days: number) {
    const d = new Date(Math.max(Date.now(), new Date(f.due_at).getTime()));
    d.setDate(d.getDate() + days);
    if (days === 0) d.setTime(Date.now() + 3600_000);
    await update(f, { due_at: d.toISOString() }, days ? "Moved to tomorrow" : "Snoozed 1 hour");
  }

  if (!meta) return <PageLoader />;

  // Group upcoming/done lists by day for readability.
  const groups: { day: string; items: Followup[] }[] = [];
  for (const f of items ?? []) {
    const day = bucket === "done" ? dayLabel(f.completed_at ?? f.due_at) : dayLabel(f.due_at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(f);
    else groups.push({ day, items: [f] });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Follow-ups"
        subtitle="Calls, meetings and reminders scheduled on your leads."
        actions={
          can("leads.view_all") && (
            <select className="input w-auto" value={assigned} onChange={(e) => set("assigned_to", e.target.value)}>
              <option value="">Everyone</option>
              <option value="me">Assigned to me</option>
              {meta.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )
        }
      />

      <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:mb-5 sm:grid sm:grid-cols-5 sm:px-0">
        {BUCKETS.map(([k, label, cls]) => (
          <button
            key={k}
            onClick={() => set("bucket", k)}
            className={`card min-w-[6.5rem] shrink-0 px-4 py-3 text-left transition sm:min-w-0 ${bucket === k ? "border-brand-500 ring-2 ring-brand-100" : "hover:border-slate-300"}`}
          >
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${cls}`}>{k === "done" ? "—" : (counts[k] ?? "…")}</p>
          </button>
        ))}
      </div>

      <div className="card">
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <Empty
            icon={<CalendarCheck className="h-10 w-10" />}
            title={bucket === "overdue" ? "Nothing overdue 🎉" : "No follow-ups here"}
            hint="Schedule follow-ups from any lead's page."
          />
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <p className="border-b border-slate-100 bg-slate-50/60 px-5 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.day}</p>
              <ul className="divide-y divide-slate-100">
                {g.items.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-slate-50 sm:px-5">
                    <span className="w-16 text-xs whitespace-nowrap text-slate-500 tabular-nums sm:text-sm">{fmtTime(f.due_at)}</span>
                    <span className="text-lg" title={f.type}>
                      {TYPE_ICON[f.type] ?? "📝"}
                    </span>
                    <Link href={`/leads/${f.lead_id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900 hover:text-brand-700">
                        {f.lead?.name} <span className="text-xs font-normal text-slate-400">{f.lead?.code}</span>
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {f.note || "No details"}
                        {f.lead?.phone && ` · ${f.lead.phone}`}
                        {bucket === "overdue" && <span className="text-red-600"> · due {relative(f.due_at)}</span>}
                        {f.outcome && <span className="text-emerald-700"> · {f.outcome}</span>}
                      </p>
                    </Link>
                    <span className="hidden sm:inline-flex">
                      <StatusBadge status={f.lead?.status} />
                    </span>
                    {f.assigned_to && (
                      <span className="hidden sm:inline-flex">
                        <Avatar name={f.assigned_to.name} size={24} />
                      </span>
                    )}
                    {f.lead && <ContactMenu lead={{ ...f.lead, email: null, assigned_to: f.assigned_to }} onContacted={load} />}
                    {f.status === "pending" ? (
                      <div className="flex w-full justify-end gap-1 pl-[4.75rem] sm:w-auto sm:pl-0">
                        <button className="btn-secondary btn-sm" onClick={() => snooze(f, bucket === "overdue" ? 0 : 1)} title={bucket === "overdue" ? "Snooze 1 hour" : "Move to tomorrow"}>
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => update(f, { status: "cancelled" }, "Cancelled")} title="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => {
                            setOutcome("");
                            setCompleting(f);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" /> Done
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs ${f.status === "done" ? "text-emerald-600" : "text-slate-400"}`}>
                        {f.status === "done" ? "Done" : "Cancelled"} {f.completed_at && fmtDateTime(f.completed_at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title={`Complete follow-up · ${completing?.lead?.name ?? ""}`}
        width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCompleting(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                await update(completing!, { status: "done", outcome: outcome || null }, "Follow-up completed");
                setCompleting(null);
              }}
            >
              Mark done
            </button>
          </>
        }
      >
        <label className="label">Outcome (optional)</label>
        <textarea className="input" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Sent quotation, will decide by Friday" autoFocus />
      </Modal>
    </div>
  );
}
