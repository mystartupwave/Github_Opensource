"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { api, qs, tzOffset } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Activity } from "@/lib/types";
import { MultiSelect, PageHeader, PageLoader, Pagination } from "@/components/ui";
import { Timeline } from "@/components/Timeline";

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const { meta, can } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<{ items: Activity[]; total: number } | null>(null);
  const [actions, setActions] = useState<{ key: string; label: string }[]>([]);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const all = can("activity.view_all");
  const page = Number(sp.get("page") || 1);

  useEffect(() => {
    api<{ key: string; label: string }[]>("/api/activity/actions").then(setActions);
  }, []);

  const load = useCallback(async () => {
    const p = Object.fromEntries(["user_id", "action", "q", "date_from", "date_to"].map((k) => [k, sp.get(k) ?? undefined]));
    setData(await api(`/api/activity${qs({ ...p, page, page_size: PAGE_SIZE, tz_offset: tzOffset() })}`));
  }, [sp, page]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };

  if (!meta) return <PageLoader />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={all ? "Activity logs" : "My activity"}
        subtitle={all ? "Every important action across the CRM — who did what, and when." : "Everything you've done in the CRM."}
      />
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", q.trim() || null);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-9" placeholder="Search descriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {all && (
          <MultiSelect single label="User" options={meta.users.map((u) => ({ value: String(u.id), label: u.name }))} value={sp.get("user_id") ? [sp.get("user_id")!] : []} onChange={(v) => set("user_id", v[0] ?? null)} />
        )}
        <MultiSelect label="Action" options={actions.map((a) => ({ value: a.key, label: a.label }))} value={sp.get("action")?.split(",") ?? []} onChange={(v) => set("action", v.join(",") || null)} />
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm">
          <input type="date" className="bg-transparent outline-none" value={sp.get("date_from") ?? ""} onChange={(e) => set("date_from", e.target.value || null)} />
          <span className="text-slate-400">–</span>
          <input type="date" className="bg-transparent outline-none" value={sp.get("date_to") ?? ""} onChange={(e) => set("date_to", e.target.value || null)} />
        </div>
      </div>
      <div className="card">
        {!data ? (
          <PageLoader />
        ) : (
          <>
            <div className="p-5">
              <p className="mb-4 text-sm text-slate-500">{data.total.toLocaleString("en-IN")} events</p>
              <Timeline items={data.items} showLead />
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={(p) => set("page", String(p))} />
          </>
        )}
      </div>
    </div>
  );
}
