"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, KeyRound, Lock, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, relative } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { Avatar, Badge, ConfirmModal, Dropdown, Empty, Field, MenuItem, Modal, PageHeader, PageLoader, Spinner, Tabs, Toggle, useToast } from "@/components/ui";

type Perm = { key: string; label: string };

function UserModal({ open, onClose, user, roles, onSaved }: { open: boolean; onClose: () => void; user: User | null; roles: Role[]; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", role_id: 0, is_active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    setF({
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      password: "",
      role_id: user?.role.id ?? roles.find((r) => !r.is_admin)?.id ?? roles[0]?.id ?? 0,
      is_active: user?.is_active ?? true,
    });
  }, [open, user, roles]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (user) {
        await api(`/api/users/${user.id}`, { method: "PATCH", json: { name: f.name, email: f.email, phone: f.phone || null, role_id: f.role_id, is_active: f.is_active } });
        toast("User updated");
      } else {
        await api("/api/users", { method: "POST", json: { ...f, phone: f.phone || null } });
        toast(`${f.name} can now sign in`);
      }
      onSaved();
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
      title={user ? `Edit ${user.name}` : "Add user"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button form="user-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} {user ? "Save" : "Create user"}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Phone">
            <input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Email (used to sign in)" required>
          <input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        {!user && (
          <Field label="Temporary password" required hint="Share it with the user; they can change it from their profile.">
            <input className="input" type="text" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
        )}
        <Field label="Role">
          <select className="input" value={f.role_id} onChange={(e) => setF({ ...f, role_id: Number(e.target.value) })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.description ? ` — ${r.description}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-xs text-slate-500">Inactive users can&apos;t sign in and don&apos;t receive new leads.</span>
          </span>
          <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

function RoleModal({ open, onClose, role, perms, onSaved }: { open: boolean; onClose: () => void; role: Role | null; perms: Perm[]; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDesc(role?.description ?? "");
    setSel(role?.permissions ?? ["leads.create", "leads.edit"]);
    setError("");
  }, [open, role]);
  async function save() {
    try {
      const body = { name, description: desc || null, permissions: sel };
      if (role) await api(`/api/roles/${role.id}`, { method: "PATCH", json: body });
      else await api("/api/roles", { method: "POST", json: body });
      toast("Role saved");
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `Edit role · ${role.name}` : "New role"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!name.trim()}>
            Save role
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Manager" />
          </Field>
          <Field label="Description">
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="label">What can this role do?</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {perms.map((p) => (
              <label key={p.key} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span>{p.label}</span>
                <Toggle checked={sel.includes(p.key)} onChange={(on) => setSel(on ? [...sel, p.key] : sel.filter((x) => x !== p.key))} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Users in non-admin roles never see Users or Admin settings, and can only see leads assigned to them unless “View all leads” is on.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { me, refreshMeta } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined);
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPw, setNewPw] = useState("");
  const [deleting, setDeleting] = useState<User | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([api<User[]>("/api/users"), api<{ roles: Role[]; permissions: Perm[] }>("/api/roles")]);
    setUsers(u);
    setRoles(r.roles);
    setPerms(r.permissions);
  }, []);

  useEffect(() => {
    load().catch((e) => toast(e.message, "error"));
  }, [load, toast]);

  if (!me?.is_admin) return <Empty title="Admins only" hint="You don't have access to user management." />;
  if (!users) return <PageLoader />;

  const refresh = () => {
    load();
    refreshMeta();
  };

  async function toggleActive(u: User) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", json: { is_active: !u.is_active } });
      toast(u.is_active ? `${u.name} deactivated` : `${u.name} activated`);
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & roles"
        subtitle="Create accounts for your team and control what each role can access."
        actions={
          tab === "users" ? (
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> Add user
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setEditingRole(null)}>
              <Plus className="h-4 w-4" /> New role
            </button>
          )
        }
      />
      <Tabs
        tabs={[
          { key: "users", label: `Users (${users.length})` },
          { key: "roles", label: `Roles (${roles.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "users" ? (
        <>
        <ul className="card divide-y divide-slate-100 lg:hidden">
          {users.map((u) => (
            <li key={u.id} className={`flex items-center gap-3 p-3 ${u.is_active ? "" : "opacity-60"}`}>
              <Avatar name={u.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.name} {u.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge color={u.role.is_admin ? "#7c3aed" : "#0284c7"}>{u.role.name}</Badge>
                  <span>{u.lead_count ?? 0} leads</span>
                  <span>· {u.last_login_at ? relative(u.last_login_at) : "never logged in"}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Toggle checked={u.is_active} onChange={() => toggleActive(u)} disabled={u.id === me.id} />
                <Dropdown
                  align="right"
                  title={u.name}
                  trigger={({ toggle }) => (
                    <button className="btn-ghost btn-sm" onClick={toggle} aria-label="User actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                >
                  {(close) => (
                    <div>
                      <MenuItem icon={<Pencil className="h-4 w-4 text-slate-400" />} onClick={() => (close(), setEditing(u))}>
                        Edit
                      </MenuItem>
                      <MenuItem icon={<KeyRound className="h-4 w-4 text-slate-400" />} onClick={() => (close(), setNewPw(""), setResetting(u))}>
                        Reset password
                      </MenuItem>
                      <MenuItem icon={<Activity className="h-4 w-4 text-slate-400" />} href={`/activity?user_id=${u.id}`}>
                        View activity
                      </MenuItem>
                      {u.id !== me.id && (
                        <MenuItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => (close(), setReassignTo(""), setDeleting(u))}>
                          Delete
                        </MenuItem>
                      )}
                    </div>
                  )}
                </Dropdown>
              </div>
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th text-right">Leads</th>
                <th className="th">Last login</th>
                <th className="th">Active</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? "" : "bg-slate-50/60 text-slate-400"}>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} size={32} />
                      <div>
                        <p className="font-medium text-slate-900">
                          {u.name} {u.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <Badge color={u.role.is_admin ? "#7c3aed" : "#0284c7"}>
                      {u.role.is_admin && <ShieldCheck className="h-3 w-3" />}
                      {u.role.name}
                    </Badge>
                  </td>
                  <td className="td text-right tabular-nums">
                    <Link href={`/leads?assigned_to=${u.id}`} className="hover:text-brand-700">
                      {u.lead_count ?? 0}
                    </Link>
                  </td>
                  <td className="td text-sm" title={fmtDateTime(u.last_login_at)}>
                    {u.last_login_at ? relative(u.last_login_at) : <span className="text-slate-400">Never</span>}
                  </td>
                  <td className="td">
                    <Toggle checked={u.is_active} onChange={() => toggleActive(u)} disabled={u.id === me.id} />
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Link href={`/activity?user_id=${u.id}`} className="btn-ghost btn-sm" title="View activity">
                        <Activity className="h-4 w-4" />
                      </Link>
                      <button className="btn-ghost btn-sm" title="Reset password" onClick={() => (setNewPw(""), setResetting(u))}>
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost btn-sm" title="Edit" onClick={() => setEditing(u)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {u.id !== me.id && (
                        <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" title="Delete" onClick={() => (setReassignTo(""), setDeleting(u))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">
                    {r.is_admin && <ShieldCheck className="h-4 w-4 text-violet-600" />}
                    {r.name}
                  </h3>
                  <p className="text-sm text-slate-500">{r.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {r.user_count} user{r.user_count === 1 ? "" : "s"}
                  </p>
                </div>
                {r.is_admin ? (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Lock className="h-3.5 w-3.5" /> Full access
                  </span>
                ) : (
                  <div className="flex gap-1">
                    <button className="btn-secondary btn-sm" onClick={() => setEditingRole(r)}>
                      <Pencil className="h-3.5 w-3.5" /> Permissions
                    </button>
                    {!r.is_system && (
                      <button
                        className="btn-ghost btn-sm text-red-600"
                        onClick={async () => {
                          try {
                            await api(`/api/roles/${r.id}`, { method: "DELETE" });
                            toast("Role deleted");
                            load();
                          } catch (e: any) {
                            toast(e.message, "error");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!r.is_admin && (
                <ul className="space-y-1 text-sm">
                  {perms.map((p) => {
                    const on = r.permissions.includes(p.key);
                    return (
                      <li key={p.key} className={on ? "text-slate-700" : "text-slate-300 line-through"}>
                        {on ? "✓" : "✕"} {p.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <UserModal open={editing !== undefined} onClose={() => setEditing(undefined)} user={editing ?? null} roles={roles} onSaved={refresh} />
      <RoleModal open={editingRole !== undefined} onClose={() => setEditingRole(undefined)} role={editingRole ?? null} perms={perms} onSaved={load} />

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Reset password · ${resetting?.name}`}
        width="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setResetting(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!newPw}
              onClick={async () => {
                try {
                  await api(`/api/users/${resetting!.id}/reset-password`, { method: "POST", json: { password: newPw } });
                  toast("Password reset. The user has been signed out everywhere.");
                  setResetting(null);
                } catch (e: any) {
                  toast(e.message, "error");
                }
              }}
            >
              Reset password
            </button>
          </>
        }
      >
        <Field label="New password" hint="The user will be signed out of all sessions.">
          <input className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus />
        </Field>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message={
          <div className="space-y-3">
            <p>This permanently removes the account. Their past activity stays in the logs. Consider deactivating instead.</p>
            <Field label={`Move their ${deleting?.lead_count ?? 0} lead(s) to`}>
              <select className="input" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Leave unassigned</option>
                {users
                  .filter((u) => u.id !== deleting?.id && u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        }
        onConfirm={async () => {
          try {
            await api(`/api/users/${deleting!.id}${reassignTo ? `?reassign_to_id=${reassignTo}` : ""}`, { method: "DELETE" });
            toast("User deleted");
            setDeleting(null);
            refresh();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
      />
    </div>
  );
}
