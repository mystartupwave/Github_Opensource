"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, ColorInput, ConfirmModal, Dot, Field, Modal, Toggle, useToast } from "@/components/ui";

type Item = { id: number; name: string; color: string; [k: string]: any };

type Extra = {
  key: string;
  label: string;
  kind: "toggle" | "select" | "text";
  options?: { value: string; label: string }[];
  hint?: string;
  default: any;
};

export function LookupEditor({
  title,
  description,
  endpoint,
  items,
  extras = [],
  reorderable = true,
  badge,
  deleteNeedsTarget,
}: {
  title: string;
  description: string;
  endpoint: string;
  items: Item[];
  extras?: Extra[];
  reorderable?: boolean;
  badge?: (item: Item) => React.ReactNode;
  deleteNeedsTarget?: boolean;
}) {
  const { refreshMeta } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, any>>({});
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing === undefined) return;
    setError("");
    const base: Record<string, any> = { name: editing?.name ?? "", color: editing?.color ?? "#6366f1" };
    extras.forEach((e) => (base[e.key] = editing ? editing[e.key] : e.default));
    setForm(base);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    try {
      if (editing) await api(`${endpoint}/${editing.id}`, { method: "PATCH", json: form });
      else await api(endpoint, { method: "POST", json: form });
      toast(`${form.name} saved`);
      setEditing(undefined);
      refreshMeta();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const ids = items.map((i) => i.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await api(`${endpoint}/reorder`, { method: "PUT", json: { ids } });
    refreshMeta();
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-3 px-5 py-3">
            {reorderable && (
              <div className="flex flex-col">
                <button className="text-slate-300 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button className="text-slate-300 hover:text-slate-700 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Badge color={item.color}>
              <Dot color={item.color} /> {item.name}
            </Badge>
            <div className="flex flex-1 flex-wrap gap-1.5 text-xs text-slate-500">{badge?.(item)}</div>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(item)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => (setMoveTo(""), setDeleting(item))} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!items.length && <li className="px-5 py-8 text-center text-sm text-slate-400">Nothing here yet</li>}
      </ul>

      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? `Edit ${editing.name}` : `Add ${title.toLowerCase().replace(/s$/, "")}`}
        width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={!form.name?.trim()}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Colour">
            <ColorInput value={form.color ?? "#6366f1"} onChange={(c) => setForm({ ...form, color: c })} />
          </Field>
          {extras.map((x) =>
            x.kind === "toggle" ? (
              <label key={x.key} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {x.label}
                  {x.hint && <span className="block text-xs text-slate-500">{x.hint}</span>}
                </span>
                <Toggle checked={!!form[x.key]} onChange={(v) => setForm({ ...form, [x.key]: v })} />
              </label>
            ) : x.kind === "select" ? (
              <Field key={x.key} label={x.label} hint={x.hint}>
                <select className="input" value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })}>
                  {x.options!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field key={x.key} label={x.label} hint={x.hint}>
                <input className="input" value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
              </Field>
            ),
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message={
          deleteNeedsTarget ? (
            <div className="space-y-3">
              <p>Leads currently in this status will be moved to the status you choose.</p>
              <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Choose a status…</option>
                {items
                  .filter((i) => i.id !== deleting?.id)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            "Leads using it will simply have this value cleared."
          )
        }
        onConfirm={async () => {
          try {
            await api(`${endpoint}/${deleting!.id}${moveTo ? `?move_to_id=${moveTo}` : ""}`, { method: "DELETE" });
            toast("Deleted");
            setDeleting(null);
            refreshMeta();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
      />
    </section>
  );
}
