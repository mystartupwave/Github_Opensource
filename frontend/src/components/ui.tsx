"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { hexAlpha, initials } from "@/lib/format";

// ------------------------------------------------------------------ toast

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-in pointer-events-auto max-w-sm rounded-lg px-4 py-2.5 text-sm shadow-lg ${
              t.kind === "error" ? "bg-red-600 text-white" : t.kind === "info" ? "bg-slate-800 text-white" : "bg-emerald-600 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ primitives

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function Badge({ color, children, className = "" }: { color?: string; children: React.ReactNode; className?: string }) {
  const c = color || "#64748b";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: hexAlpha(c, 0.12), color: c }}
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color?: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />;
}

export function StatusBadge({ status }: { status?: { name: string; color: string } | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <Badge color={status.color}>
      <Dot color={status.color} />
      {status.name}
    </Badge>
  );
}

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];

export function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const idx = name ? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length : 0;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: AVATAR_COLORS[idx] }}
      title={name || undefined}
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-brand-600" : "bg-slate-300"
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4.5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            value === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`animate-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[88vh] sm:rounded-xl ${width}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="truncate pr-3 font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>*]:flex-1 sm:[&>*]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ dropdown

export type Option = { value: string; label: string; color?: string };

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fn();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, fn]);
}

export function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

/**
 * Menu anchored to a trigger. Rendered in a portal with fixed positioning so it is never clipped by
 * scrolling tables or pipeline columns; flips upward / right-aligns near viewport edges; becomes a
 * bottom sheet on phones.
 */
export function Dropdown({
  trigger,
  children,
  align = "left",
  width = 224,
  title,
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    if (below >= 240 || below >= above) setPos({ top: r.bottom + 4, left, maxH: Math.max(160, below - 4) });
    else setPos({ bottom: vh - r.top + 4, left, maxH: Math.max(160, above - 4) });
  }, [align, width]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  const content =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      mobile ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-900/40" onClick={(e) => e.stopPropagation()}>
          <div
            ref={menu}
            className="animate-in max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl"
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
            {title && <p className="px-3 pb-2 text-sm font-semibold text-slate-900">{title}</p>}
            {children(close)}
          </div>
        </div>
      ) : (
        pos && (
          <div
            ref={menu}
            onClick={(e) => e.stopPropagation()}
            className={`animate-in fixed z-[70] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ${className}`}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: Math.min(pos.maxH, 420) }}
          >
            {title && <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</p>}
            {children(close)}
          </div>
        )
      ),
      document.body,
    );

  return (
    <>
      <span
        ref={anchor}
        className="inline-flex"
        onClick={(e) => {
          // Keep clicks from reaching clickable rows/cards behind the trigger.
          e.stopPropagation();
        }}
      >
        {trigger({ open, toggle: () => setOpen((o) => !o) })}
      </span>
      {content}
    </>
  );
}

export function MenuItem({
  icon,
  children,
  hint,
  onClick,
  href,
  disabled,
  danger,
  external,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
  external?: boolean;
}) {
  const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition sm:py-2 ${
    disabled ? "pointer-events-none opacity-40" : danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50 active:bg-slate-100"
  }`;
  const inner = (
    <>
      {icon && <span className="flex w-5 shrink-0 justify-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {hint && <span className="block truncate text-xs text-slate-400">{hint}</span>}
      </span>
    </>
  );
  if (href && !disabled)
    return (
      <a href={href} className={cls} onClick={onClick} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {inner}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  );
}

export const MenuDivider = () => <div className="my-1 h-px bg-slate-100" />;

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  single,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const active = value.length > 0;
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const summary = active
    ? value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? label
      : `${label} · ${value.length}`
    : label;
  return (
    <Dropdown
      title={label}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition ${
            active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="max-w-[140px] truncate">{summary}</span>
          {active ? (
            <X
              className="h-3.5 w-3.5"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          {options.length > 7 && <input className="input mb-1 py-1.5" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}
          {shown.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  if (single) {
                    onChange(on ? [] : [o.value]);
                    close();
                  } else onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 sm:px-2 sm:py-1.5"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${single ? "rounded-full" : "rounded"} ${
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                {o.color && <Dot color={o.color} />}
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {!shown.length && <p className="px-2 py-2 text-xs text-slate-400">No options</p>}
          {!single && active && (
            <div className="mt-1 flex gap-2 border-t border-slate-100 p-1 pt-2">
              <button className="btn-ghost btn-sm flex-1" onClick={() => onChange([])}>
                Clear
              </button>
              <button className="btn-primary btn-sm flex-1" onClick={close}>
                Done
              </button>
            </div>
          )}
        </>
      )}
    </Dropdown>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const swatches = ["#22c55e", "#3b82f6", "#eab308", "#f97316", "#a855f7", "#10b981", "#ef4444", "#0f172a", "#ec4899", "#14b8a6", "#6366f1", "#64748b"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-offset-2 transition ${value.toLowerCase() === c ? "ring-2 ring-slate-400" : ""}`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-200" />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
