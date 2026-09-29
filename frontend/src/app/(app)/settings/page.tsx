"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Building2, Flag, GitBranch, ListChecks, MessageCircle, Plug, Shield, Shuffle, Signpost, Tags, UserCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, PageLoader } from "@/components/ui";
import { LookupEditor } from "@/components/settings/LookupEditor";
import { AssignmentSettings } from "@/components/settings/Assignment";
import { CustomFieldsSettings } from "@/components/settings/CustomFields";
import { IntegrationSettings } from "@/components/settings/Integration";
import { MessagingSettings } from "@/components/settings/Messaging";
import { CompanySettings, NotificationSettings, ProfileSettings, SecuritySettings } from "@/components/settings/General";

const GROUPS = [
  {
    label: "Leads",
    items: [
      { key: "assignment", label: "Lead assignment", icon: Shuffle },
      { key: "statuses", label: "Lead statuses", icon: GitBranch },
      { key: "sources", label: "Lead sources", icon: Signpost },
      { key: "priorities", label: "Priorities", icon: Flag },
      { key: "tags", label: "Tags", icon: Tags },
      { key: "fields", label: "Custom fields", icon: ListChecks },
    ],
  },
  {
    label: "Integrations",
    items: [
      { key: "integrations", label: "Website forms & API", icon: Plug },
      { key: "messaging", label: "WhatsApp & calling", icon: MessageCircle },
    ],
  },
  {
    label: "Settings",
    items: [
      { key: "company", label: "Company", icon: Building2 },
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "security", label: "Security", icon: Shield },
      { key: "profile", label: "Profile", icon: UserCircle },
    ],
  },
];

export default function SettingsPage() {
  const { me, meta } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = !!me?.is_admin;
  const tab = isAdmin ? sp.get("tab") || "assignment" : "profile";
  const [all, setAll] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setAll(null);
    api("/api/settings").then(setAll);
  }, [isAdmin, tab]);

  if (!me || !meta) return <PageLoader />;

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your profile and password." />
        <ProfileSettings />
      </div>
    );
  }

  const needsAll = ["assignment", "integrations", "messaging", "company", "notifications", "security"].includes(tab);

  return (
    <div>
      <PageHeader title="Admin settings" subtitle="Customize how your CRM works — no developer needed." />
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <nav className="no-scrollbar -mx-3 flex shrink-0 gap-1 overflow-x-auto px-3 lg:mx-0 lg:w-56 lg:flex-col lg:overflow-visible lg:px-0">
          {GROUPS.map((g) => (
            <div key={g.label} className="flex gap-1 lg:mb-3 lg:flex-col">
              <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase lg:block">{g.label}</p>
              {g.items.map((it) => {
                const Icon = it.icon;
                const on = tab === it.key;
                return (
                  <button
                    key={it.key}
                    onClick={() => router.replace(`${pathname}?tab=${it.key}`)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition ${on ? "bg-white font-medium text-brand-700 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    <Icon className="h-4 w-4" /> {it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {needsAll && !all ? (
            <PageLoader />
          ) : tab === "assignment" ? (
            <AssignmentSettings initial={all!.assignment} initialLeads={all!.leads} />
          ) : tab === "statuses" ? (
            <LookupEditor
              title="Lead statuses"
              description="Your pipeline stages. Rename them, recolour them, and reorder them — the pipeline and reports follow."
              endpoint="/api/statuses"
              items={meta.statuses}
              deleteNeedsTarget
              extras={[
                {
                  key: "category",
                  label: "Stage type",
                  kind: "select",
                  default: "open",
                  hint: "Won statuses count as conversions; lost statuses as lost leads in reports.",
                  options: [
                    { value: "open", label: "Open — still in progress" },
                    { value: "won", label: "Won — converted" },
                    { value: "lost", label: "Lost — dead lead" },
                  ],
                },
                { key: "is_default", label: "Default for new leads", kind: "toggle", default: false },
                { key: "show_in_pipeline", label: "Show as a pipeline column", kind: "toggle", default: true },
              ]}
              badge={(s) => (
                <>
                  {s.category !== "open" && <span className={s.category === "won" ? "text-emerald-600" : "text-red-600"}>{s.category === "won" ? "Won" : "Lost"}</span>}
                  {s.is_default && <span className="rounded bg-slate-100 px-1.5">Default</span>}
                  {!s.show_in_pipeline && <span className="rounded bg-slate-100 px-1.5">Hidden from pipeline</span>}
                </>
              )}
            />
          ) : tab === "sources" ? (
            <LookupEditor
              title="Lead sources"
              description="Where leads come from. The key is what your website sends as “source”."
              endpoint="/api/sources"
              items={meta.sources}
              extras={[
                { key: "key", label: "API key", kind: "text", default: "", hint: "Leave blank to generate from the name, e.g. google_ads" },
                { key: "is_active", label: "Active (shown in forms)", kind: "toggle", default: true },
              ]}
              badge={(s) => (
                <>
                  <code>{s.key}</code>
                  {!s.is_active && <span className="rounded bg-slate-100 px-1.5">Inactive</span>}
                </>
              )}
            />
          ) : tab === "priorities" ? (
            <LookupEditor
              title="Priorities"
              description="How urgent a lead is. The first one gets a 🔥 flame."
              endpoint="/api/priorities"
              items={meta.priorities}
              extras={[{ key: "is_default", label: "Default for new leads", kind: "toggle", default: false }]}
              badge={(p) => p.is_default && <span className="rounded bg-slate-100 px-1.5">Default</span>}
            />
          ) : tab === "tags" ? (
            <LookupEditor title="Tags" description="Free labels like Hot, VIP or a city. Managers can also create tags while editing a lead." endpoint="/api/tags" items={meta.tags} reorderable={false} />
          ) : tab === "fields" ? (
            <CustomFieldsSettings />
          ) : tab === "integrations" ? (
            <IntegrationSettings initial={all!.integration} />
          ) : tab === "messaging" ? (
            <MessagingSettings initial={all!.messaging} />
          ) : tab === "company" ? (
            <CompanySettings initial={all!.company} />
          ) : tab === "notifications" ? (
            <NotificationSettings initial={all!.notifications} />
          ) : tab === "security" ? (
            <SecuritySettings initial={all!.security} />
          ) : (
            <ProfileSettings />
          )}
        </div>
      </div>
    </div>
  );
}
