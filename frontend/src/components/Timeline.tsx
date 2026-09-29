"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Flag,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Repeat,
  Settings,
  Tag,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";
import { dayLabel, fmtDateTime, fmtTime } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { Badge, Dot } from "./ui";

const ICON: Record<string, [React.ElementType, string]> = {
  lead_created: [Plus, "bg-emerald-100 text-emerald-700"],
  lead_edited: [Pencil, "bg-slate-100 text-slate-600"],
  lead_assigned: [UserPlus, "bg-indigo-100 text-indigo-700"],
  status_changed: [ArrowRightLeft, "bg-amber-100 text-amber-700"],
  priority_changed: [Flag, "bg-orange-100 text-orange-700"],
  tags_changed: [Tag, "bg-slate-100 text-slate-600"],
  note_added: [MessageSquare, "bg-sky-100 text-sky-700"],
  note_deleted: [Trash2, "bg-slate-100 text-slate-500"],
  contacted: [Phone, "bg-teal-100 text-teal-700"],
  followup_created: [CalendarClock, "bg-violet-100 text-violet-700"],
  followup_completed: [CalendarCheck, "bg-emerald-100 text-emerald-700"],
  followup_rescheduled: [CalendarClock, "bg-violet-100 text-violet-700"],
  followup_cancelled: [CalendarX, "bg-slate-100 text-slate-500"],
  followup_deleted: [CalendarX, "bg-slate-100 text-slate-500"],
  enquiry_repeat: [Repeat, "bg-sky-100 text-sky-700"],
  lead_deleted: [Trash2, "bg-red-100 text-red-700"],
  login: [LogIn, "bg-slate-100 text-slate-600"],
  logout: [LogOut, "bg-slate-100 text-slate-600"],
  login_failed: [LogIn, "bg-red-100 text-red-700"],
  settings_changed: [Settings, "bg-slate-100 text-slate-600"],
};

function Detail({ a }: { a: Activity }) {
  const m = a.meta || {};
  if (a.action === "status_changed" && m.to) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {m.from && (
          <Badge color={m.from.color}>
            <Dot color={m.from.color} /> {m.from.name}
          </Badge>
        )}
        <span className="text-slate-400">→</span>
        <Badge color={m.to.color}>
          <Dot color={m.to.color} /> {m.to.name}
        </Badge>
      </div>
    );
  }
  const quote = m.content || m.summary || m.outcome || m.message || (a.action === "followup_created" ? m.note : null);
  const due = a.action.startsWith("followup_") && m.due_at ? `Due ${fmtDateTime(m.due_at)}` : null;
  if (!quote && !due && !m.diff) return null;
  return (
    <div className="mt-1 space-y-1">
      {due && <p className="text-xs text-slate-500">{due}</p>}
      {quote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap text-slate-700">“{quote}”</p>}
      {m.diff && Object.keys(m.diff).length > 0 && (
        <ul className="text-xs text-slate-500">
          {Object.entries(m.diff as Record<string, [string, string]>).map(([k, [from, to]]) => (
            <li key={k}>
              <span className="capitalize">{k.replace(/_/g, " ")}</span>: <span className="line-through">{from || "empty"}</span> → <span className="text-slate-700">{to || "empty"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Timeline({ items, showLead = false }: { items: Activity[]; showLead?: boolean }) {
  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of items) {
    const day = dayLabel(a.created_at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }
  if (!items.length) return <p className="py-8 text-center text-sm text-slate-400">No activity yet</p>;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.day}>
          <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">{g.day}</p>
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {g.items.map((a) => {
              const [Icon, cls] = ICON[a.action] ?? (a.action.startsWith("user") || a.action.startsWith("role") || a.action.startsWith("password") ? [UserCog, "bg-slate-100 text-slate-600"] : [Pencil, "bg-slate-100 text-slate-600"]);
              return (
                <li key={a.id} className="relative">
                  <span className={`absolute top-0 -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${cls}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs text-slate-400 tabular-nums" title={fmtDateTime(a.created_at)}>
                      {fmtTime(a.created_at)}
                    </span>
                    <span className="text-sm text-slate-800">{a.description}</span>
                  </div>
                  {showLead && a.lead_id && a.lead_name && (
                    <p className="text-xs">
                      {a.lead_deleted ? (
                        <span className="text-slate-400">Lead: {a.lead_name} (deleted)</span>
                      ) : (
                        <Link href={`/leads/${a.lead_id}`} className="text-brand-600 hover:underline">
                          Lead: {a.lead_name}
                        </Link>
                      )}
                    </p>
                  )}
                  <Detail a={a} />
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
