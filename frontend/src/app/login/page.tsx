"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Columns3, Eye, EyeOff, LayoutGrid, MessageCircle, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/session";
import { Spinner } from "@/components/ui";

const FEATURES = [
  { icon: Columns3, title: "Visual pipeline", text: "Drag leads from New to Won and see every stage at a glance." },
  { icon: CalendarClock, title: "Never miss a follow-up", text: "Overdue, today and tomorrow — reminders for every call." },
  { icon: MessageCircle, title: "One-tap Call & WhatsApp", text: "Contact leads with ready-made message templates." },
  { icon: ShieldCheck, title: "Full audit trail", text: "Know who did what, and when, across your whole team." },
];

export default function LoginPage() {
  const { me, login, loading } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace("/dashboard");
  }, [me, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-white">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">CRM</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl leading-tight font-semibold tracking-tight">Every lead, every follow-up, in one simple place.</h2>
          <ul className="mt-10 grid gap-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-indigo-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-indigo-200">© {new Date().getFullYear()} MyStartupWave</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 flex-col justify-center bg-gradient-to-b from-brand-50/60 to-white px-5 py-10 sm:px-10 lg:bg-none">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">CRM</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage your leads and follow-ups.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Email</span>
              <input
                className="input py-2.5"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <span className="relative block">
                <input
                  className="input py-2.5 pr-10"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-slate-700"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full py-2.5 shadow-lg shadow-brand-600/20" disabled={busy}>
              {busy && <Spinner />}
              Sign in
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Forgot your password? Ask your admin to reset it.</p>
        </div>
      </main>
    </div>
  );
}
