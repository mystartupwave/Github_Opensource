"use client";

import { useEffect, useState } from "react";
import { Gauge, Hand, Plus, RotateCw, Split, Trash2, User as UserIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar, Field, Spinner, Toggle, useToast } from "@/components/ui";

export type AssignmentCfg = {
  auto_assign: boolean;
  mode: "round_robin" | "least_loaded" | "specific" | "rules" | "shared";
  manager_ids: number[];
  specific_user_id: number | null;
  rules: { source_id: number; user_ids: number[] }[];
  fallback: "round_robin" | "least_loaded" | "manual";
  apply_to_manual: boolean;
  managers_self_assign: boolean;
};
export type LeadsCfg = { dedupe_enabled: boolean; dedupe_reopen_lost: boolean };

const MODES = [
  { key: "round_robin", icon: RotateCw, title: "Round robin", desc: "Rotate new leads evenly: Amit → Priya → Rahul → Rohit → Amit…" },
  { key: "least_loaded", icon: Gauge, title: "Least loaded", desc: "Give each new lead to the manager with the fewest open leads." },
  { key: "specific", icon: UserIcon, title: "Single manager", desc: "Send every new lead to one chosen person." },
  { key: "rules", icon: Split, title: "Source-based rules", desc: "Route by source, e.g. Instagram → Priya, Google Ads → Amit & Rahul." },
  { key: "shared", icon: Hand, title: "Shared pool", desc: "Leads stay unassigned and visible to all managers; first to claim owns it." },
] as const;

function UserChecklist({ value, onChange, users }: { value: number[]; onChange: (v: number[]) => void; users: { id: number; name: string; is_admin?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {users.map((u) => {
        const on = value.includes(u.id);
        return (
          <button
            type="button"
            key={u.id}
            onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
            className={`inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Avatar name={u.name} size={22} />
            {u.name}
            {u.is_admin && <span className="text-[10px] text-slate-400">admin</span>}
          </button>
        );
      })}
    </div>
  );
}

export function AssignmentSettings({ initial, initialLeads }: { initial: AssignmentCfg; initialLeads: LeadsCfg }) {
  const { meta, refreshMeta } = useSession();
  const toast = useToast();
  const [cfg, setCfg] = useState<AssignmentCfg>(initial);
  const [leads, setLeads] = useState<LeadsCfg>(initialLeads);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCfg(initial), [initial]);
  if (!meta) return null;
  const managers = meta.users.filter((u) => !u.is_admin);
  const set = <K extends keyof AssignmentCfg>(k: K, v: AssignmentCfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await api("/api/settings/assignment", { method: "PATCH", json: cfg });
      await api("/api/settings/leads", { method: "PATCH", json: leads });
      await refreshMeta();
      toast("Assignment settings saved");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const poolNames = (cfg.manager_ids.length ? meta.users.filter((u) => cfg.manager_ids.includes(u.id)) : managers).map((u) => u.name);
  const summary = !cfg.auto_assign
    ? "New leads arrive unassigned. You assign them yourself from the Leads page (single or bulk)."
    : cfg.mode === "round_robin"
      ? `New leads rotate through: ${poolNames.join(" → ") || "no one yet — add a manager"}.`
      : cfg.mode === "least_loaded"
        ? `New leads go to whoever has the fewest open leads among: ${poolNames.join(", ") || "no one yet"}.`
        : cfg.mode === "specific"
          ? `Every new lead goes to ${meta.users.find((u) => u.id === cfg.specific_user_id)?.name ?? "— pick someone —"}.`
          : cfg.mode === "rules"
            ? `Leads are routed by source; anything unmatched is ${cfg.fallback === "manual" ? "left unassigned" : cfg.fallback === "least_loaded" ? "given to the least-loaded manager" : "assigned round robin"}.`
            : "New leads go into a shared pool visible to every manager. The first manager to click “Claim” owns the lead.";

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Auto-assign new leads</h2>
            <p className="text-sm text-slate-500">Turn off to assign every lead yourself. Applies to website/API leads and CSV imports.</p>
          </div>
          <Toggle checked={cfg.auto_assign} onChange={(v) => set("auto_assign", v)} />
        </div>
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${cfg.auto_assign ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-700"}`}>{summary}</div>
      </section>

      {cfg.auto_assign && (
        <>
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">How should leads be distributed?</h2>
            <p className="mb-4 text-sm text-slate-500">Pick one method. You can change it any time; existing leads are not moved.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {MODES.map((m) => {
                const on = cfg.mode === m.key;
                const Icon = m.icon;
                return (
                  <button
                    type="button"
                    key={m.key}
                    onClick={() => set("mode", m.key)}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition sm:flex-col sm:gap-0 sm:p-4 ${on ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 sm:mt-0 sm:mb-2 ${on ? "text-brand-600" : "text-slate-400"}`} />
                    <span>
                      <span className="block font-medium">{m.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{m.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {(cfg.mode === "round_robin" || cfg.mode === "least_loaded" || (cfg.mode === "rules" && cfg.fallback !== "manual")) && (
            <section className="card p-5">
              <h2 className="font-semibold">Who is in the rotation?</h2>
              <p className="mb-4 text-sm text-slate-500">Leave everyone unselected to include all active managers automatically (new managers join the rotation too).</p>
              <UserChecklist value={cfg.manager_ids} onChange={(v) => set("manager_ids", v)} users={meta.users} />
            </section>
          )}

          {cfg.mode === "specific" && (
            <section className="card p-5">
              <Field label="Send every new lead to">
                <select className="input max-w-sm" value={cfg.specific_user_id ?? ""} onChange={(e) => set("specific_user_id", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choose a user…</option>
                  {meta.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          )}

          {cfg.mode === "rules" && (
            <section className="card p-5">
              <h2 className="font-semibold">Routing rules</h2>
              <p className="mb-4 text-sm text-slate-500">If a rule lists several people, the one with the fewest open leads gets it.</p>
              <div className="space-y-3">
                {cfg.rules.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="w-44">
                      <span className="label">When source is</span>
                      <select
                        className="input"
                        value={r.source_id}
                        onChange={(e) => set("rules", cfg.rules.map((x, j) => (j === i ? { ...x, source_id: Number(e.target.value) } : x)))}
                      >
                        {meta.sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="label">Assign to</span>
                      <UserChecklist value={r.user_ids} onChange={(v) => set("rules", cfg.rules.map((x, j) => (j === i ? { ...x, user_ids: v } : x)))} users={meta.users} />
                    </div>
                    <button className="btn-ghost btn-sm mt-5 text-red-600" onClick={() => set("rules", cfg.rules.filter((_, j) => j !== i))} aria-label="Remove rule">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button className="btn-secondary" onClick={() => set("rules", [...cfg.rules, { source_id: meta.sources[0]?.id, user_ids: [] }])}>
                  <Plus className="h-4 w-4" /> Add rule
                </button>
              </div>
              <div className="mt-5 max-w-sm">
                <Field label="When no rule matches">
                  <select className="input" value={cfg.fallback} onChange={(e) => set("fallback", e.target.value as AssignmentCfg["fallback"])}>
                    <option value="round_robin">Round robin</option>
                    <option value="least_loaded">Least loaded</option>
                    <option value="manual">Leave unassigned (admin assigns)</option>
                  </select>
                </Field>
              </div>
            </section>
          )}
        </>
      )}

      <section className="card divide-y divide-slate-100">
        {(
          [
            ["managers_self_assign", "Leads a manager creates are assigned to them", "Otherwise they follow the rules above."],
            ["apply_to_manual", "Also auto-assign leads an admin creates without an owner", "By default, leads you add by hand stay unassigned unless you pick someone."],
          ] as const
        ).map(([k, l, h]) => (
          <label key={k} className="flex items-center justify-between gap-4 px-5 py-4">
            <span>
              <span className="text-sm font-medium">{l}</span>
              <span className="block text-xs text-slate-500">{h}</span>
            </span>
            <Toggle checked={cfg[k]} onChange={(v) => set(k, v)} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-4 px-5 py-4">
          <span>
            <span className="text-sm font-medium">Merge repeat enquiries</span>
            <span className="block text-xs text-slate-500">If someone with the same phone or email enquires again, update the existing lead (and count it) instead of creating a duplicate.</span>
          </span>
          <Toggle checked={leads.dedupe_enabled} onChange={(v) => setLeads({ ...leads, dedupe_enabled: v })} />
        </label>
        {leads.dedupe_enabled && (
          <label className="flex items-center justify-between gap-4 px-5 py-4">
            <span>
              <span className="text-sm font-medium">Reopen lost leads on repeat enquiry</span>
              <span className="block text-xs text-slate-500">Moves the lead back to your default status so someone follows up.</span>
            </span>
            <Toggle checked={leads.dedupe_reopen_lost} onChange={(v) => setLeads({ ...leads, dedupe_reopen_lost: v })} />
          </label>
        )}
      </section>

      <div className="sticky bottom-[5.25rem] z-10 flex justify-end sm:bottom-4">
        <button className="btn-primary shadow-lg shadow-brand-600/20" onClick={save} disabled={busy}>
          {busy && <Spinner />} Save assignment settings
        </button>
      </div>
    </div>
  );
}
