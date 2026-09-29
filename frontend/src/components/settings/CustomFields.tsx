"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { CustomField, FieldType } from "@/lib/types";
import { Badge, ConfirmModal, Field, Modal, Toggle, useToast } from "@/components/ui";
import { CustomFieldInput } from "@/components/LeadForm";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  dropdown: "Dropdown",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
  textarea: "Text area",
  currency: "Currency",
};

type Form = Omit<CustomField, "id" | "order" | "key"> & { optionsText: string };

export function CustomFieldsSettings() {
  const { meta, refreshMeta } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<CustomField | null | undefined>(undefined);
  const [f, setF] = useState<Form | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<CustomField | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing === undefined) return;
    setError("");
    setPreview(null);
    setF({
      name: editing?.name ?? "",
      field_type: editing?.field_type ?? "text",
      options: editing?.options ?? [],
      optionsText: (editing?.options ?? []).join("\n"),
      required: editing?.required ?? false,
      show_in_list: editing?.show_in_list ?? false,
      is_active: editing?.is_active ?? true,
      placeholder: editing?.placeholder ?? "",
    });
  }, [editing]);

  if (!meta) return null;
  const fields = meta.custom_fields;
  const hasOptions = f && (f.field_type === "dropdown" || f.field_type === "multiselect");

  async function save() {
    if (!f) return;
    const body = { ...f, options: f.optionsText.split("\n").map((s) => s.trim()).filter(Boolean), placeholder: f.placeholder || null };
    try {
      if (editing) await api(`/api/custom-fields/${editing.id}`, { method: "PATCH", json: body });
      else await api("/api/custom-fields", { method: "POST", json: body });
      toast(`Field “${f.name}” saved`);
      setEditing(undefined);
      refreshMeta();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const ids = fields.map((x) => x.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api("/api/custom-fields/reorder", { method: "PUT", json: { ids } });
    refreshMeta();
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-semibold">Custom lead fields</h2>
          <p className="text-sm text-slate-500">Add your own fields to every lead — no developer needed. They appear on the lead form, detail page, filters and CSV export.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" /> Add field
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {fields.map((cf, i) => (
          <li key={cf.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${cf.is_active ? "" : "opacity-50"}`}>
            <div className="flex flex-col">
              <button className="text-slate-300 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button className="text-slate-300 hover:text-slate-700 disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {cf.name} {cf.required && <span className="text-red-500">*</span>}
              </p>
              <p className="truncate text-xs text-slate-500">
                <code>{cf.key}</code>
                {cf.options.length > 0 && ` · ${cf.options.join(", ")}`}
              </p>
            </div>
            <Badge color="#6366f1">{TYPE_LABELS[cf.field_type]}</Badge>
            {cf.show_in_list && <Badge color="#0284c7">In list</Badge>}
            {!cf.is_active && <Badge color="#64748b">Hidden</Badge>}
            <button className="btn-ghost btn-sm" onClick={() => setEditing(cf)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => setDeleting(cf)} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!fields.length && <li className="px-5 py-10 text-center text-sm text-slate-400">No custom fields yet. Try “Budget” (Dropdown) or “Customer Type”.</li>}
      </ul>

      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? `Edit field · ${editing.name}` : "New custom field"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={!f?.name.trim()}>
              Save field
            </button>
          </>
        }
      >
        {f && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Field name" required>
                <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Budget" autoFocus />
              </Field>
              <Field label="Type">
                <select className="input" value={f.field_type} onChange={(e) => setF({ ...f, field_type: e.target.value as FieldType })}>
                  {meta.field_types.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {hasOptions && (
              <Field label="Options (one per line)" required>
                <textarea className="input font-mono text-xs" rows={5} value={f.optionsText} onChange={(e) => setF({ ...f, optionsText: e.target.value })} placeholder={"₹10k–₹25k\n₹25k–₹50k\n₹50k–₹1L\n₹1L+"} />
              </Field>
            )}
            {!hasOptions && f.field_type !== "checkbox" && (
              <Field label="Placeholder">
                <input className="input" value={f.placeholder ?? ""} onChange={(e) => setF({ ...f, placeholder: e.target.value })} />
              </Field>
            )}
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              {(
                [
                  ["required", "Required", "Must be filled when creating or editing a lead in the CRM"],
                  ["show_in_list", "Show as a column in the leads list", ""],
                  ["is_active", "Active", "Hidden fields keep their data but are not shown on forms"],
                ] as const
              ).map(([k, l, h]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {l}
                    {h && <span className="block text-xs text-slate-500">{h}</span>}
                  </span>
                  <Toggle checked={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />
                </label>
              ))}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Preview</p>
              <Field label={f.name || "Field name"} required={f.required}>
                <CustomFieldInput
                  field={{ ...f, id: 0, key: "preview", order: 0, options: f.optionsText.split("\n").map((s) => s.trim()).filter(Boolean) }}
                  value={preview}
                  onChange={setPreview}
                />
              </Field>
            </div>
            {editing && (
              <p className="text-xs text-slate-500">
                API key: <code>{editing.key}</code> — send this in website form submissions to fill the field.
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete field “${deleting?.name}”?`}
        message="All values stored in this field on every lead will be permanently removed. To keep the data, edit the field and switch off “Active” instead."
        onConfirm={async () => {
          await api(`/api/custom-fields/${deleting!.id}`, { method: "DELETE" });
          toast("Field deleted");
          setDeleting(null);
          refreshMeta();
        }}
      />
    </section>
  );
}
