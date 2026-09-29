"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { CustomField, Lead, Tag } from "@/lib/types";
import { Field, Modal, Spinner, useClickOutside, useToast } from "./ui";

export function CustomFieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const { meta } = useSession();
  const common = { className: "input", placeholder: field.placeholder || undefined };
  switch (field.field_type) {
    case "textarea":
      return <textarea {...common} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input {...common} type="number" step="any" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "currency":
      return (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">{meta?.company.currency_symbol ?? "₹"}</span>
          <input {...common} className="input pl-7" type="number" step="any" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "email":
      return <input {...common} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <input {...common} type="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "dropdown":
      return (
        <select className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((o) => {
            const on = arr.includes(o);
            return (
              <button
                type="button"
                key={o}
                onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      );
    default:
      return <input {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function TagPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { meta, refreshMeta, can } = useSession();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const tags = meta?.tags ?? [];
  const selected = tags.filter((t) => value.includes(t.id));
  const matches = tags.filter((t) => !value.includes(t.id) && t.name.toLowerCase().includes(q.toLowerCase()));
  const exact = tags.some((t) => t.name.toLowerCase() === q.trim().toLowerCase());

  async function create() {
    const t = await api<Tag>("/api/tags", { method: "POST", json: { name: q.trim(), color: "#64748b" } });
    await refreshMeta();
    onChange([...value, t.id]);
    setQ("");
  }

  return (
    <div className="relative" ref={ref}>
      <div className="input flex min-h-[38px] flex-wrap items-center gap-1.5 py-1.5" onClick={() => setOpen(true)}>
        {selected.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: t.color }}>
            {t.name}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((id) => id !== t.id));
              }}
            />
          </span>
        ))}
        <input
          className="min-w-[80px] flex-1 bg-transparent text-sm outline-none"
          placeholder={selected.length ? "" : "Add tags…"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) {
                onChange([...value, matches[0].id]);
                setQ("");
              } else if (q.trim() && !exact && can("leads.edit")) create();
            }
          }}
        />
      </div>
      {open && (matches.length > 0 || (q.trim() && !exact)) && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {matches.map((t) => (
            <button
              type="button"
              key={t.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onChange([...value, t.id]);
                setQ("");
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
          {q.trim() && !exact && can("leads.edit") && (
            <button type="button" onClick={create} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50">
              <Plus className="h-3.5 w-3.5" /> Create tag “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type FormState = {
  name: string;
  phone: string;
  email: string;
  company: string;
  message: string;
  notes: string;
  source_id: string;
  status_id: string;
  priority_id: string;
  assigned_to_id: string;
  tag_ids: number[];
  custom: Record<string, unknown>;
};

function fromLead(l?: Lead | null): FormState {
  return {
    name: l?.name ?? "",
    phone: l?.phone ?? "",
    email: l?.email ?? "",
    company: l?.company ?? "",
    message: l?.message ?? "",
    notes: l?.notes ?? "",
    source_id: l?.source ? String(l.source.id) : "",
    status_id: l?.status ? String(l.status.id) : "",
    priority_id: l?.priority ? String(l.priority.id) : "",
    assigned_to_id: l?.assigned_to ? String(l.assigned_to.id) : "",
    tag_ids: l?.tags.map((t) => t.id) ?? [],
    custom: { ...(l?.custom ?? {}) },
  };
}

export function LeadFormModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead?: Lead | null; onSaved: (l: Lead) => void }) {
  const { meta, can, me } = useSession();
  const toast = useToast();
  const [f, setF] = useState<FormState>(fromLead(lead));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setF(fromLead(lead));
      setError("");
    }
  }, [open, lead]);

  if (!meta) return null;
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const fields = meta.custom_fields.filter((c) => c.is_active);
  const canAssign = can("leads.assign");
  const idOrNull = (v: string) => (v ? Number(v) : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      name: f.name,
      phone: f.phone,
      email: f.email,
      company: f.company,
      message: f.message,
      notes: f.notes,
      source_id: idOrNull(f.source_id),
      priority_id: idOrNull(f.priority_id),
      tag_ids: f.tag_ids,
      custom: f.custom,
    };
    if (f.status_id) payload.status_id = Number(f.status_id);
    if (canAssign) payload.assigned_to_id = idOrNull(f.assigned_to_id);
    try {
      const saved = lead
        ? await api<Lead>(`/api/leads/${lead.id}`, { method: "PATCH", json: payload })
        : await api<Lead>("/api/leads", { method: "POST", json: payload });
      toast(lead ? "Lead updated" : "Lead created");
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? `Edit ${lead.name}` : "New lead"}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button form="lead-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {lead ? "Save changes" : "Create lead"}
          </button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead name" required>
            <input className="input" required value={f.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Company">
            <input className="input" value={f.company} onChange={set("company")} />
          </Field>
          <Field label="Phone">
            <input className="input" type="tel" value={f.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Source">
            <select className="input" value={f.source_id} onChange={set("source_id")}>
              <option value="">—</option>
              {meta.sources
                .filter((s) => s.is_active || String(s.id) === f.source_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={f.status_id} onChange={set("status_id")}>
              {!lead && <option value="">Default ({meta.statuses.find((s) => s.is_default)?.name ?? meta.statuses[0]?.name})</option>}
              {meta.statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={f.priority_id} onChange={set("priority_id")}>
              <option value="">{lead ? "—" : `Default (${meta.priorities.find((p) => p.is_default)?.name ?? "none"})`}</option>
              {meta.priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Assigned to"
            hint={!canAssign ? (lead ? "Only admins can reassign" : "Assigned to you") : !lead && !f.assigned_to_id ? "Leave empty to follow assignment rules" : undefined}
          >
            <select className="input" value={f.assigned_to_id} onChange={set("assigned_to_id")} disabled={!canAssign}>
              <option value="">{canAssign ? "Unassigned / auto" : lead ? "Unassigned" : me?.name}</option>
              {meta.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Tags">
          <TagPicker value={f.tag_ids} onChange={(ids) => setF((s) => ({ ...s, tag_ids: ids }))} />
        </Field>
        {fields.length > 0 && (
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            {fields.map((cf) => (
              <div key={cf.id} className={cf.field_type === "textarea" || cf.field_type === "multiselect" ? "sm:col-span-2" : ""}>
                <Field label={cf.name} required={cf.required}>
                  <CustomFieldInput field={cf} value={f.custom[cf.key]} onChange={(v) => setF((s) => ({ ...s, custom: { ...s.custom, [cf.key]: v } }))} />
                </Field>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <Field label="Enquiry message">
            <textarea className="input" rows={3} value={f.message} onChange={set("message")} />
          </Field>
          <Field label="Notes">
            <textarea className="input" rows={3} value={f.notes} onChange={set("notes")} placeholder="e.g. Wants quotation" />
          </Field>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
