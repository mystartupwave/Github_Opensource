"use client";

import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Field, Spinner, Toggle, useToast } from "@/components/ui";

function useSaver(group: string) {
  const toast = useToast();
  const { refreshMeta } = useSession();
  const [busy, setBusy] = useState(false);
  const save = async (value: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/api/settings/${group}`, { method: "PATCH", json: value });
      await refreshMeta();
      toast("Settings saved");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

export function NotificationSettings({ initial }: { initial: Record<string, any> }) {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver("notifications");
  const row = (k: string, label: string) => (
    <label key={k} className="flex items-center justify-between gap-4 py-3 text-sm">
      {label}
      <Toggle checked={!!v[k]} onChange={(on) => setV({ ...v, [k]: on })} />
    </label>
  );
  return (
    <section className="card p-5">
      <h2 className="font-semibold">In-app notifications</h2>
      <p className="mb-4 text-sm text-slate-500">Shown under the bell icon. Email, WhatsApp and SMS delivery can be added later.</p>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Managers get notified when</p>
          <div className="divide-y divide-slate-100">
            {row("manager_assigned", "A lead is assigned or reassigned to them")}
            {row("manager_lead_updated", "Someone else updates or comments on their lead")}
            {row("manager_followup_due", "A follow-up is coming up")}
            {row("manager_followup_overdue", "A follow-up is overdue")}
          </div>
          <div className="mt-3 max-w-xs">
            <Field label="Remind this many minutes before a follow-up">
              <input className="input" type="number" min={0} max={1440} value={v.followup_reminder_minutes} onChange={(e) => setV({ ...v, followup_reminder_minutes: Number(e.target.value) })} />
            </Field>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Admins get notified about</p>
          <div className="divide-y divide-slate-100">
            {row("admin_new_lead", "Every new lead (and repeat enquiries)")}
            {row("admin_new_user", "New users being added")}
            {row("admin_conversion", "Conversions (lead moved to a won status)")}
            {row("admin_status_change", "Every other status change")}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={() => save(v)}>
          {busy && <Spinner />} Save
        </button>
      </div>
    </section>
  );
}

export function CompanySettings({ initial }: { initial: Record<string, any> }) {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver("company");
  return (
    <section className="card max-w-2xl p-5">
      <h2 className="mb-4 font-semibold">Company</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" hint="Shown in the sidebar.">
          <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Timezone">
          <input className="input" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} />
        </Field>
        <Field label="Currency code">
          <input className="input" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} />
        </Field>
        <Field label="Currency symbol" hint="Used for currency custom fields.">
          <input className="input" value={v.currency_symbol} onChange={(e) => setV({ ...v, currency_symbol: e.target.value })} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={() => save(v)}>
          {busy && <Spinner />} Save
        </button>
      </div>
    </section>
  );
}

export function SecuritySettings({ initial }: { initial: Record<string, any> }) {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver("security");
  return (
    <section className="card max-w-2xl p-5">
      <h2 className="mb-4 font-semibold">Security</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Session length (hours)" hint="Users are signed out after this long.">
          <input className="input" type="number" min={1} max={720} value={v.session_hours} onChange={(e) => setV({ ...v, session_hours: Number(e.target.value) })} />
        </Field>
        <Field label="Minimum password length">
          <input className="input" type="number" min={6} max={64} value={v.password_min_length} onChange={(e) => setV({ ...v, password_min_length: Number(e.target.value) })} />
        </Field>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        Resetting a user&apos;s password or deactivating them signs them out immediately. Every login, logout and failed login is recorded in Activity Logs.
      </p>
      <div className="mt-5 flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={() => save(v)}>
          {busy && <Spinner />} Save
        </button>
      </div>
    </section>
  );
}

export function ProfileSettings() {
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [name, setName] = useState(me?.name ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Your profile</h2>
        <div className="space-y-4">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" hint="Ask an admin to change your email.">
            <input className="input" value={me.email} disabled />
          </Field>
          <Field label="Role">
            <input className="input" value={me.role.name} disabled />
          </Field>
          <button
            className="btn-primary"
            onClick={async () => {
              try {
                await api("/api/auth/me", { method: "PATCH", json: { name, phone: phone || null } });
                await refreshMe();
                toast("Profile updated");
              } catch (e: any) {
                toast(e.message, "error");
              }
            }}
          >
            Save profile
          </button>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Change password</h2>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw !== pw2) return toast("New passwords don't match", "error");
            setBusy(true);
            try {
              const r = await api<{ access_token: string }>("/api/auth/change-password", { method: "POST", json: { current_password: cur, new_password: pw } });
              setToken(r.access_token);
              setCur("");
              setPw("");
              setPw2("");
              toast("Password changed. Other sessions were signed out.");
            } catch (err: any) {
              toast(err.message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Current password">
            <input className="input" type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password">
            <input className="input" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          <button className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Change password
          </button>
        </form>
      </section>
    </div>
  );
}
