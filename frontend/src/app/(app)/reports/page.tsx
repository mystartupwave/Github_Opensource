"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, MousePointerClick, PenLine, Repeat, Trophy } from "lucide-react";
import { api, qs, tzOffset } from "@/lib/api";
import { num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Avatar, Empty, PageHeader, PageLoader, StatusBadge, Tabs } from "@/components/ui";
import { BarList } from "@/components/charts";
import { ContactMenu } from "@/components/ContactMenu";

type M = {
  id: number;
  name: string;
  leads: number;
  converted: number;
  lost: number;
  open: number;
  created: number;
  conversion_rate: number;
  actions: number;
  contacts: number;
  avg_days_to_convert: number | null;
};
type Report = {
  managers: M[];
  most_active: M[];
  most_created: M[];
  most_converted: M[];
  sources: { name: string; color: string; leads: number; converted: number; lost: number; conversion_rate: number }[];
  top_enquirers: { id: number; code: string; name: string; phone: string | null; company: string | null; enquiries: number; status: string | null; status_color: string | null }[];
};

const RANGES = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
] as const;

function Leaderboard({ title, icon, rows, value, unit }: { title: string; icon: React.ReactNode; rows: M[]; value: (m: M) => number; unit: string }) {
  const top = rows.filter((m) => value(m) > 0).slice(0, 6);
  return (
    <section className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        {icon} {title}
      </h3>
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No data in this period</p>
      ) : (
        <ol className="space-y-2.5">
          {top.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className={`w-5 text-center text-sm font-semibold ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>{i + 1}</span>
              <Avatar name={m.name} size={26} />
              <Link href={`/leads?assigned_to=${m.id}`} className="flex-1 truncate text-sm font-medium hover:text-brand-700">
                {m.name}
              </Link>
              <span className="text-sm tabular-nums">
                <b>{num(value(m))}</b> <span className="text-slate-400">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const { can } = useSession();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("30");
  const [tab, setTab] = useState<"managers" | "sources" | "enquirers">("managers");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const from = range === "all" ? undefined : new Date(Date.now() - (Number(range) - 1) * 86400000).toLocaleDateString("en-CA");
    setData(null);
    api<Report>(`/api/reports${qs({ tz_offset: tzOffset(), date_from: from })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range]);

  if (!can("reports.view")) return <Empty title="No access" hint="Ask your admin for the “View reports” permission." />;
  if (error) return <Empty title="Couldn't load reports" hint={error} />;

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        subtitle="Who is handling leads, who converts, and where your leads come from. Based on leads created in the selected period."
        actions={
          <select className="input w-auto" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            {RANGES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        }
      />
      {!data ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:gap-4 md:grid-cols-3">
            <Leaderboard title="Most active" icon={<MousePointerClick className="h-4 w-4 text-brand-600" />} rows={data.most_active} value={(m) => m.actions} unit="actions" />
            <Leaderboard title="Most leads created" icon={<PenLine className="h-4 w-4 text-sky-600" />} rows={data.most_created} value={(m) => m.created} unit="created" />
            <Leaderboard title="Most converted" icon={<Trophy className="h-4 w-4 text-amber-500" />} rows={data.most_converted} value={(m) => m.converted} unit="won" />
          </div>

          <Tabs
            tabs={[
              { key: "managers", label: "Manager performance" },
              { key: "sources", label: "Lead sources" },
              { key: "enquirers", label: "Top enquirers" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "managers" && (
            <>
            <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
              {data.managers.map((m) => (
                <li key={m.id} className="card p-4">
                  <Link href={`/leads?assigned_to=${m.id}`} className="flex items-center gap-3">
                    <Avatar name={m.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="text-xs text-slate-500">{m.avg_days_to_convert != null ? `Converts in ~${m.avg_days_to_convert} days` : "No conversions yet"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold tabular-nums ${m.conversion_rate >= 15 ? "text-emerald-700" : "text-slate-900"}`}>{m.conversion_rate}%</p>
                      <p className="text-[11px] text-slate-400">conversion</p>
                    </div>
                  </Link>
                  <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 text-center">
                    {(
                      [
                        ["Leads", m.leads],
                        ["Open", m.open],
                        ["Won", m.converted],
                        ["Lost", m.lost],
                        ["Created", m.created],
                        ["Contacts", m.contacts],
                        ["Actions", m.actions],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dd className="text-sm font-semibold tabular-nums">{num(v)}</dd>
                        <dt className="text-[11px] text-slate-500">{k}</dt>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="card hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[800px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Manager</th>
                    <th className="th text-right">Leads handled</th>
                    <th className="th text-right">Created</th>
                    <th className="th text-right">Open</th>
                    <th className="th text-right">Converted</th>
                    <th className="th text-right">Lost</th>
                    <th className="th text-right">Conversion</th>
                    <th className="th text-right">Contacts made</th>
                    <th className="th text-right">Actions</th>
                    <th className="th text-right">Avg. days to convert</th>
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
                      <td className="td text-right tabular-nums">{num(m.created)}</td>
                      <td className="td text-right tabular-nums">{num(m.open)}</td>
                      <td className="td text-right font-medium text-emerald-700 tabular-nums">{num(m.converted)}</td>
                      <td className="td text-right tabular-nums text-slate-500">{num(m.lost)}</td>
                      <td className="td text-right tabular-nums">
                        <span className={m.conversion_rate >= 15 ? "font-medium text-emerald-700" : ""}>{m.conversion_rate}%</span>
                      </td>
                      <td className="td text-right tabular-nums">{num(m.contacts)}</td>
                      <td className="td text-right tabular-nums">{num(m.actions)}</td>
                      <td className="td text-right tabular-nums">{m.avg_days_to_convert ?? "—"}</td>
                    </tr>
                  ))}
                  {!data.managers.length && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-sm text-slate-400">
                        No managers yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}

          {tab === "sources" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card p-5">
                <h3 className="mb-4 font-semibold">Leads by source</h3>
                <BarList rows={data.sources.map((s) => ({ key: s.name, label: s.name, value: s.leads, color: s.color }))} />
              </section>
              <section className="card overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr>
                      <th className="th">Source</th>
                      <th className="th text-right">Leads</th>
                      <th className="th text-right">Converted</th>
                      <th className="th text-right">Lost</th>
                      <th className="th text-right">Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sources.map((s) => (
                      <tr key={s.name}>
                        <td className="td">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
                          </span>
                        </td>
                        <td className="td text-right tabular-nums">{num(s.leads)}</td>
                        <td className="td text-right tabular-nums">{num(s.converted)}</td>
                        <td className="td text-right tabular-nums text-slate-500">{num(s.lost)}</td>
                        <td className="td text-right font-medium tabular-nums">{s.conversion_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.sources.length > 0 && (
                  <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                    <Award className="h-3.5 w-3.5 text-amber-500" />
                    Best converting: <b>{[...data.sources].filter((s) => s.leads >= 5).sort((a, b) => b.conversion_rate - a.conversion_rate)[0]?.name ?? "—"}</b> (min. 5 leads)
                  </p>
                )}
              </section>
            </div>
          )}

          {tab === "enquirers" && (
            <div className="card overflow-x-auto">
              <p className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
                <Repeat className="h-4 w-4" /> Customers who enquired more than once (matched by phone or email).
              </p>
              {data.top_enquirers.length === 0 ? (
                <Empty title="No repeat enquiries yet" hint="When the same person submits your website form again, they'll show up here." />
              ) : (
                <>
                <ul className="divide-y divide-slate-100 md:hidden">
                  {data.top_enquirers.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-semibold text-sky-700">×{l.enquiries}</span>
                      <Link href={`/leads/${l.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {l.phone ?? "—"}
                          {l.company && ` · ${l.company}`}
                        </p>
                      </Link>
                      <StatusBadge status={l.status ? { name: l.status, color: l.status_color! } : null} />
                      <ContactMenu lead={{ id: l.id, name: l.name, phone: l.phone, email: null, company: l.company }} />
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full md:table">
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr>
                      <th className="th">Lead</th>
                      <th className="th">Phone</th>
                      <th className="th">Company</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Enquiries</th>
                      <th className="th relative w-12">
                        <span className="sr-only">Contact</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.top_enquirers.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="td">
                          <Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-700">
                            {l.name}
                          </Link>
                          <span className="ml-2 text-xs text-slate-400">{l.code}</span>
                        </td>
                        <td className="td text-slate-600">{l.phone ?? "—"}</td>
                        <td className="td text-slate-600">{l.company ?? "—"}</td>
                        <td className="td">
                          <StatusBadge status={l.status ? { name: l.status, color: l.status_color! } : null} />
                        </td>
                        <td className="td text-right font-semibold tabular-nums">{l.enquiries}</td>
                        <td className="td">
                          <ContactMenu lead={{ id: l.id, name: l.name, phone: l.phone, email: null, company: l.company }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
