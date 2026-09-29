"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, relative } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Empty, PageHeader, PageLoader, useToast } from "@/components/ui";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const load = useCallback(async () => {
    const r = await api<{ items: Notification[] }>(`/api/notifications?limit=200${unreadOnly ? "&unread_only=true" : ""}`);
    setItems(r.items);
  }, [unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          <>
            <button className={unreadOnly ? "btn-primary" : "btn-secondary"} onClick={() => setUnreadOnly((u) => !u)}>
              Unread only
            </button>
            <button
              className="btn-secondary"
              onClick={async () => {
                await api("/api/notifications/read-all", { method: "POST" });
                load();
              }}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await api("/api/notifications", { method: "DELETE" });
                toast("Cleared read notifications");
                load();
              }}
            >
              <Trash2 className="h-4 w-4" /> Clear read
            </button>
          </>
        }
      />
      <div className="card divide-y divide-slate-100">
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <Empty icon={<Bell className="h-10 w-10" />} title="No notifications" hint="You'll be notified about new assignments, follow-ups and lead updates." />
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              className={`flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 ${n.is_read ? "" : "bg-brand-50/40"}`}
              onClick={async () => {
                if (!n.is_read) await api(`/api/notifications/${n.id}/read`, { method: "POST" });
                if (n.lead_id) router.push(`/leads/${n.lead_id}`);
                else load();
              }}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand-600"}`} />
              <span className="flex-1">
                <span className={`block text-sm ${n.is_read ? "text-slate-700" : "font-medium"}`}>{n.title}</span>
                {n.body && <span className="block text-sm text-slate-500">{n.body}</span>}
              </span>
              <span className="text-xs whitespace-nowrap text-slate-400" title={fmtDateTime(n.created_at)}>
                {relative(n.created_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
