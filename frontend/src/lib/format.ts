const d = (v: string | Date) => (typeof v === "string" ? new Date(v) : v);

export function fmtDate(v?: string | null) {
  if (!v) return "—";
  return d(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  return d(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtTime(v?: string | null) {
  if (!v) return "";
  return d(v).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function startOfDay(x: Date) {
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

export function dayLabel(v: string) {
  const date = startOfDay(d(v));
  const today = startOfDay(new Date());
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export function relative(v?: string | null) {
  if (!v) return "—";
  const ms = d(v).getTime() - Date.now();
  const abs = Math.abs(ms);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(ms / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(ms / 86_400_000), "day");
  return fmtDate(v);
}

export type FollowupState = "overdue" | "today" | "tomorrow" | "later" | null;

export function followupState(v?: string | null): FollowupState {
  if (!v) return null;
  const t = d(v);
  if (t.getTime() < Date.now()) return "overdue";
  const label = dayLabel(v);
  if (label === "Today") return "today";
  if (label === "Tomorrow") return "tomorrow";
  return "later";
}

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Convert a local "YYYY-MM-DDTHH:mm" input value to an ISO string, and back. */
export const localInputToIso = (v: string) => new Date(v).toISOString();
export function isoToLocalInput(v?: string | null) {
  const x = v ? new Date(v) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
