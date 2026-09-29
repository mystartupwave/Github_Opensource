"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ChevronDown,
  Columns3,
  Contact,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { NotificationBell } from "@/components/NotificationBell";
import { LeadFormModal } from "@/components/LeadForm";
import { Avatar, Dropdown, MenuDivider, MenuItem, PageLoader } from "@/components/ui";

type NavItem = { href: string; label: string; icon: React.ElementType; section: string; show?: boolean; children?: { href: string; label: string }[] };

function Shell({ children }: { children: React.ReactNode }) {
  const { me, meta, loading, logout, can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => setDrawerOpen(false), [pathname, search]);

  if (loading || !me || !meta) return <PageLoader />;

  const isAdmin = me.is_admin;
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Workspace" },
    {
      href: "/leads",
      label: "Leads",
      icon: Contact,
      section: "Workspace",
      children: [
        { href: "/leads", label: "All Leads" },
        { href: "/leads?view=new", label: "New Leads" },
        { href: "/leads?category=won", label: "Converted" },
        { href: "/leads?category=lost", label: "Lost" },
      ],
    },
    { href: "/leads/pipeline", label: "Pipeline", icon: Columns3, section: "Workspace" },
    { href: "/followups", label: "Follow-ups", icon: CalendarClock, section: "Workspace" },
    { href: "/reports", label: "Reports", icon: BarChart3, section: "Insights", show: can("reports.view") },
    { href: "/activity", label: isAdmin || can("activity.view_all") ? "Activity Logs" : "My Activity", icon: Activity, section: "Insights" },
    { href: "/users", label: "Users", icon: Users, section: "Admin", show: isAdmin },
    { href: "/settings", label: "Settings", icon: Settings, section: isAdmin ? "Admin" : "Account" },
  ];

  const current = pathname + (search.toString() ? `?${search.toString()}` : "");
  const isActive = (href: string) => (href === "/leads" ? pathname === "/leads" || /^\/leads\/\d+/.test(pathname) : pathname.startsWith(href));

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <LayoutGrid className="h-4 w-4" />
        </span>
        <span className="truncate font-semibold tracking-tight">{meta.company.name || "CRM"}</span>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {nav
          .filter((n) => n.show !== false)
          .map((item, i, arr) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const header = i === 0 || arr[i - 1].section !== item.section;
            return (
              <div key={item.href}>
                {header && <p className={`px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase ${i ? "pt-4" : ""}`}>{item.section}</p>}
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2 ${
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
                {item.children && pathname === "/leads" && (
                  <div className="mt-0.5 mb-1 ml-9 space-y-0.5 border-l border-slate-200 pl-2">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`block rounded-md px-2 py-1.5 text-[13px] lg:py-1 ${current === c.href ? "font-medium text-brand-700" : "text-slate-500 hover:text-slate-900"}`}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <Avatar name={me.name} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-slate-400">{me.role.name}</p>
          </div>
          <button onClick={doLogout} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  const tabs = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/leads", label: "Leads", icon: Contact },
    { href: "#new", label: "New", icon: Plus },
    { href: "/followups", label: "Follow-ups", icon: CalendarClock },
    { href: "#menu", label: "Menu", icon: Menu },
  ];

  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile / tablet drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button className="absolute top-3.5 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 sm:block lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white sm:hidden" aria-label="Home">
            <LayoutGrid className="h-4 w-4" />
          </Link>
          <form
            className="relative min-w-0 max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/leads?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input border-transparent bg-slate-100 pl-9 focus:bg-white"
              type="search"
              enterKeyHint="search"
              placeholder="Search name, phone, LD-ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {can("leads.create") && (
              <button className="btn-primary hidden md:inline-flex" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> New lead
              </button>
            )}
            <NotificationBell />
            <Dropdown
              align="right"
              width={240}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100 sm:px-2 sm:py-1.5" aria-label="Account menu">
                  <Avatar name={me.name} size={30} />
                  <span className="hidden text-sm font-medium md:inline">{me.name}</span>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
                </button>
              )}
            >
              {(close) => (
                <div>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={me.name} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{me.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {me.email} · {me.role.name}
                      </p>
                    </div>
                  </div>
                  <MenuDivider />
                  <MenuItem
                    icon={<UserCircle className="h-4 w-4 text-slate-400" />}
                    onClick={() => {
                      close();
                      router.push("/settings?tab=profile");
                    }}
                  >
                    Profile &amp; password
                  </MenuItem>
                  <MenuItem
                    icon={<Activity className="h-4 w-4 text-slate-400" />}
                    onClick={() => {
                      close();
                      router.push(`/activity${isAdmin ? `?user_id=${me.id}` : ""}`);
                    }}
                  >
                    My activity
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem danger icon={<LogOut className="h-4 w-4" />} onClick={doLogout}>
                    Log out
                  </MenuItem>
                </div>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="flex-1 px-3 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-8 lg:px-8">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-5">
          {tabs.map((t) => {
            const Icon = t.icon;
            if (t.href === "#new")
              return (
                <button
                  key={t.href}
                  onClick={() => (can("leads.create") ? setNewOpen(true) : router.push("/leads/pipeline"))}
                  className="flex items-center justify-center"
                  aria-label={can("leads.create") ? "New lead" : "Pipeline"}
                >
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-white">
                    {can("leads.create") ? <Plus className="h-6 w-6" /> : <Columns3 className="h-5 w-5" />}
                  </span>
                </button>
              );
            const active = t.href === "#menu" ? drawerOpen : isActive(t.href);
            const cls = `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand-700" : "text-slate-500"}`;
            return t.href === "#menu" ? (
              <button key={t.href} className={cls} onClick={() => setDrawerOpen(true)}>
                <Icon className="h-5 w-5" />
                {t.label}
              </button>
            ) : (
              <Link key={t.href} href={t.href} className={cls}>
                <Icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <LeadFormModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={(l) => router.push(`/leads/${l.id}`)} />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
