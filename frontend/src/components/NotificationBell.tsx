"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, CheckCheck, PartyPopper, Repeat, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Dropdown } from "./ui";

const ICONS: Record<string, React.ReactNode> = {
  lead_assigned: <UserPlus className="h-4 w-4 text-brand-600" />,
  new_lead: <UserPlus className="h-4 w-4 text-emerald-600" />,
  followup_due: <CalendarClock className="h-4 w-4 text-amber-500" />,
  followup_overdue: <CalendarClock className="h-4 w-4 text-red-500" />,
  conversion: <PartyPopper className="h-4 w-4 text-emerald-600" />,
  repeat_enquiry: <Repeat className="h-4 w-4 text-sky-600" />,
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Notification[]; unread: number }>("/api/notifications?limit=20");
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Dropdown
      align="right"
      width={360}
      title="Notifications"
      className="p-0"
      trigger={({ toggle, open }) => (
        <button
          onClick={() => {
            if (!open) load();
            toggle();
          }}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          {unread > 0 && (
            <div className="flex justify-end px-3 pb-1">
              <button
                onClick={async () => {
                  await api("/api/notifications/read-all", { method: "POST" });
                  load();
                }}
                className="flex items-center gap-1 py-1 text-xs text-brand-600 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>
          )}
          {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">You&apos;re all caught up</p>}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.is_read) api(`/api/notifications/${n.id}/read`, { method: "POST" }).then(load);
                close();
                if (n.lead_id) router.push(`/leads/${n.lead_id}`);
              }}
              className={`flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 ${n.is_read ? "" : "bg-brand-50/50"}`}
            >
              <span className="mt-0.5">{ICONS[n.type] ?? <Bell className="h-4 w-4 text-slate-400" />}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${n.is_read ? "text-slate-700" : "font-medium text-slate-900"}`}>{n.title}</span>
                {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                <span className="mt-0.5 block text-[11px] text-slate-400">{relative(n.created_at)}</span>
              </span>
              {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
            </button>
          ))}
          <button
            onClick={() => {
              close();
              router.push("/notifications");
            }}
            className="mt-1 w-full rounded-lg border-t border-slate-100 py-2.5 text-center text-sm text-brand-600 hover:bg-slate-50"
          >
            View all notifications
          </button>
        </div>
      )}
    </Dropdown>
  );
}
