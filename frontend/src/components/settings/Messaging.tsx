"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fillTemplate } from "@/lib/contact";
import { useSession } from "@/lib/session";
import { Field, Spinner, useToast } from "@/components/ui";
import { WhatsAppIcon } from "@/components/ContactMenu";

type Cfg = { country_code: string; templates: { name: string; text: string }[] };

const PLACEHOLDERS = ["{first_name}", "{name}", "{lead_company}", "{manager}", "{company}"];

export function MessagingSettings({ initial }: { initial: Cfg }) {
  const { me, meta, refreshMeta } = useSession();
  const toast = useToast();
  const [cfg, setCfg] = useState<Cfg>(initial);
  const [busy, setBusy] = useState(false);
  const sample = { name: "Rahul Sharma", company: "ABC Pvt Ltd", manager: me?.name, ourCompany: meta?.company.name };

  const setT = (i: number, patch: Partial<Cfg["templates"][number]>) =>
    setCfg((c) => ({ ...c, templates: c.templates.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  async function save() {
    setBusy(true);
    try {
      const r = await api<Cfg>("/api/settings/messaging", { method: "PATCH", json: cfg });
      setCfg(r);
      await refreshMeta();
      toast("Message templates saved");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-semibold">Call &amp; WhatsApp</h2>
        <p className="mb-4 text-sm text-slate-500">
          Every lead has Call, WhatsApp, SMS and Email actions. Numbers saved without a country code (e.g. 98765 43210) get this code added automatically.
        </p>
        <div className="max-w-[12rem]">
          <Field label="Default country code">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">+</span>
              <input className="input pl-7" inputMode="numeric" value={cfg.country_code} onChange={(e) => setCfg({ ...cfg, country_code: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold">Message templates</h2>
            <p className="text-sm text-slate-500">
              One tap from any lead opens WhatsApp with the message pre-filled. Placeholders:{" "}
              {PLACEHOLDERS.map((p) => (
                <code key={p} className="mr-1 rounded bg-slate-100 px-1 text-xs">
                  {p}
                </code>
              ))}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => setCfg({ ...cfg, templates: [...cfg.templates, { name: "", text: "" }] })}>
            <Plus className="h-4 w-4" /> Add template
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {cfg.templates.map((t, i) => (
            <div key={i} className="grid gap-4 p-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Template name">
                      <input className="input" value={t.name} onChange={(e) => setT(i, { name: e.target.value })} placeholder="e.g. Quotation sent" />
                    </Field>
                  </div>
                  <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => setCfg({ ...cfg, templates: cfg.templates.filter((_, j) => j !== i) })} aria-label="Remove template">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Field label="Message">
                  <textarea className="input" rows={3} value={t.text} onChange={(e) => setT(i, { text: e.target.value })} />
                </Field>
              </div>
              <div>
                <span className="label">Preview</span>
                <div className="rounded-xl bg-[#e7ddd3] p-3">
                  <div className="ml-auto max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm whitespace-pre-wrap text-slate-800 shadow-sm">
                    {t.text ? fillTemplate(t.text, sample) : <span className="text-slate-400">Type a message…</span>}
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-600">
                    <WhatsAppIcon className="h-3 w-3" /> As seen by Rahul Sharma
                  </p>
                </div>
              </div>
            </div>
          ))}
          {!cfg.templates.length && <p className="px-5 py-8 text-center text-sm text-slate-400">No templates. Leads can still be messaged with an empty chat.</p>}
        </div>
      </section>

      <div className="sticky bottom-[5.25rem] z-10 flex justify-end sm:bottom-4">
        <button className="btn-primary shadow-lg shadow-brand-600/20" onClick={save} disabled={busy}>
          {busy && <Spinner />} Save
        </button>
      </div>
    </div>
  );
}
