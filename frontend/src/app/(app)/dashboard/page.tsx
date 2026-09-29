"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CalendarCheck, CalendarClock, Inbox, Plus, Sparkles, Target, TrendingUp, Trophy, UserX, Users, XCircle } from "lucide-react";
import { api, qs, tzOffset } from "@/lib/api";
import { num, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Lead } from "@/lib/types";
import { Avatar, PageLoader, StatusBadge } from "@/components/ui";
import { BarList, TrendChart } from "@/components/charts";
import { LeadFormModal } from "@/components/LeadForm";
import { ContactMenu } from "@/components/ContactMenu";

type Dash = {
  totals: { total: number; new_today: number; new_week: number; converted: number; lost: number; open: number; unassigned: number; conversion_rate: number };
  by_status: { id: number; name: string; color: string; category: string; count: number }[];
  by_source: { id: number | null; name: string; color: string; count: number; converted: number }[];
  followups: { overdue: number; today: number; tomorrow: number };
  trend: { date: string; count: number }[];
  managers: { id: number; name: string; leads: number; converted: number; conversion_rate: number; open: number }[];
  recent: Lead[];
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const TONES = {
  indigo: "bg-indigo-50 text-indigo-600",
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  icon: React.ElementType;
  tone?: keyof typeof TONES;
}) {
  const inner = (
    <div className="card group h-full p-3.5 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-sm sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase sm:text-xs">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { me, can } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Dash | null>(null);
  const [range, setRange] = useState<"all" | "30" | "7">("all");
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const from = range === "all" ? undefined : new Date(Date.now() - (Number(range) - 1) * 86400000).toLocaleDateString("en-CA");
    api<Dash>(`/api/dashboard${qs({ tz_offset: tzOffset(), date_from: from })}`).then(setData);
  }, [range]);

  if (!data || !me) return <PageLoader />;
  const t = data.totals;
  const statusRows = data.by_status.filter((s) => s.count > 0 || s.category === "open");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            {greeting()}, {me.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            <span className="hidden sm:inline"> · {me.is_admin ? "here's what's happening across your CRM" : "here's your pipeline at a glance"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {(
              [
                ["7", "7 days"],
                ["30", "30 days"],
                ["all", "All time"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setRange(k)} className={`rounded-md px-3 py-1 ${range === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {l}
              </button>
            ))}
          </div>
          {can("leads.create") && (
            <button className="btn-primary hidden sm:inline-flex md:hidden" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New lead
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Users} tone="indigo" label="Total leads" value={num(t.total)} hint={`${num(t.new_week)} in last 7 days`} href="/leads" />
        <Stat icon={Sparkles} tone="sky" label="New today" value={num(t.new_today)} hint="Fresh enquiries" href="/leads?view=new" />
        <Stat icon={Target} tone="amber" label="Open" value={num(t.open)} hint="In pipeline" href="/leads?category=open" />
        <Stat icon={Trophy} tone="emerald" label="Converted" value={num(t.converted)} hint={`${t.conversion_rate}% conversion`} href="/leads?category=won" />
        <Stat icon={XCircle} tone="rose" label="Lost" value={num(t.lost)} hint="Closed lost" href="/leads?category=lost" />
        {me.is_admin ? (
          <Stat icon={Inbox} tone="slate" label="Unassigned" value={num(t.unassigned)} hint={t.unassigned ? "Needs an owner" : "All leads have owners"} href="/leads?assigned_to=unassigned" />
        ) : (
          <Stat icon={CalendarClock} tone="slate" label="Due now" value={num(data.followups.overdue + data.followups.today)} hint="Overdue + today" href="/followups?bucket=overdue" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {(
          [
            ["overdue", "Overdue", data.followups.overdue, AlertCircle, "text-red-600 bg-red-50"],
            ["today", "Due today", data.followups.today, CalendarClock, "text-amber-600 bg-amber-50"],
            ["tomorrow", "Tomorrow", data.followups.tomorrow, CalendarCheck, "text-sky-600 bg-sky-50"],
          ] as const
        ).map(([k, label, n, Icon, cls]) => (
          <Link key={k} href={`/followups?bucket=${k}`} className="card flex flex-col gap-2 p-3 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-sm sm:flex-row sm:items-center sm:gap-3 sm:p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${cls}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {label}
                <span className="hidden xl:inline"> follow-ups</span>
              </p>
              <p className="text-xl font-semibold tabular-nums">{n}</p>
            </div>
            <ArrowRight className="hidden h-4 w-4 text-slate-300 lg:block" />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-5">
        <section className="card p-4 sm:p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Leads by status</h2>
            <Link href="/leads/pipeline" className="text-sm text-brand-600 hover:underline">
              Open pipeline
            </Link>
          </div>
          <BarList
            rows={statusRows.map((s) => ({ key: s.id, label: s.name, value: s.count, color: s.color }))}
            onClick={(id) => router.push(`/leads?status=${id}`)}
          />
        </section>
        <section className="card p-4 sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Lead sources</h2>
            <span className="text-xs text-slate-400">leads · converted</span>
          </div>
          <BarList
            rows={data.by_source.map((s) => ({
              key: s.id ?? "none",
              label: s.name,
              value: s.count,
              color: s.color,
              extra: <span className="ml-1 font-normal text-slate-400">· {s.converted}</span>,
            }))}
            onClick={(id) => id !== "none" && router.push(`/leads?source=${id}`)}
          />
        </section>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-5">
        <section className="card p-4 sm:p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">New leads · last 14 days</h2>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </div>
          <TrendChart data={data.trend} height={200} />
        </section>
        <section className="card xl:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 className="font-semibold">Recent leads</h2>
            <Link href="/leads" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.recent.map((l) => (
              <li key={l.id}>
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 sm:px-5">
                  <Link href={`/leads/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {l.source?.name ?? "—"} · {relative(l.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                  {l.assigned_to ? <Avatar name={l.assigned_to.name} size={24} /> : <UserX className="hidden h-4 w-4 text-slate-300 sm:block" />}
                  </Link>
                  <ContactMenu lead={l} />
                </div>
              </li>
            ))}
            {!data.recent.length && <li className="px-5 py-8 text-center text-sm text-slate-400">No leads yet</li>}
          </ul>
        </section>
      </div>

      {data.managers.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 className="font-semibold">Manager performance</h2>
            {can("reports.view") && (
              <Link href="/reports" className="text-sm text-brand-600 hover:underline">
                Full report
              </Link>
            )}
          </div>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
            {data.managers.map((m) => (
              <li key={m.id}>
                <Link href={`/leads?assigned_to=${m.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                  <Avatar name={m.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="text-sm font-semibold tabular-nums text-emerald-700">{m.conversion_rate}%</p>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, m.conversion_rate)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {num(m.leads)} leads · {num(m.open)} open · {num(m.converted)} converted
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Manager</th>
                  <th className="th text-right">Leads</th>
                  <th className="th text-right">Open</th>
                  <th className="th text-right">Converted</th>
                  <th className="th w-1/3">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.managers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/leads?assigned_to=${m.id}`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                        <Avatar name={m.name} size={24} /> {m.name}
                      </Link>
                    </td>
                    <td className="td text-right tabular-nums">{num(m.leads)}</td>
                    <td className="td text-right tabular-nums">{num(m.open)}</td>
                    <td className="td text-right tabular-nums">{num(m.converted)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, m.conversion_rate)}%` }} />
                        </div>
                        <span className="w-12 text-right text-sm tabular-nums">{m.conversion_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <LeadFormModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={(l) => router.push(`/leads/${l.id}`)} />
    </div>
  );
}
