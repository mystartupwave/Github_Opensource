"use client";

import { useState } from "react";
import { num } from "@/lib/format";

/** Horizontal labelled bars. Each row is named in text; the bar colour follows the entity. */
export function BarList({
  rows,
  onClick,
  suffix,
}: {
  rows: { key: string | number; label: string; value: number; color?: string; extra?: React.ReactNode }[];
  onClick?: (key: string | number) => void;
  suffix?: (row: { value: number }) => React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          disabled={!onClick}
          onClick={() => onClick?.(r.key)}
          className="group grid w-full grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-left disabled:cursor-default"
          title={`${r.label}: ${num(r.value)}`}
        >
          <span className="truncate text-sm text-slate-600 group-enabled:group-hover:text-slate-900">{r.label}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full transition-all group-enabled:group-hover:opacity-80"
              style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%`, backgroundColor: r.color || "#6366f1" }}
            />
          </span>
          <span className="min-w-10 text-right text-sm font-medium tabular-nums text-slate-900">
            {num(r.value)}
            {suffix?.(r)}
            {r.extra}
          </span>
        </button>
      ))}
      {!rows.length && <p className="py-6 text-center text-sm text-slate-400">No data yet</p>}
    </div>
  );
}

/** Single-series daily column chart with hover tooltip. */
export function TrendChart({ data, color = "#6366f1", height = 140 }: { data: { date: string; count: number }[]; color?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const H = height;
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const ticks = [0, niceMax / 2, niceMax];
  const label = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return (
    <div className="relative">
      <div className="flex">
        <div className="relative mr-2 w-6 shrink-0 text-right text-[11px] text-slate-400" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / niceMax) * H }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ top: H - (t / niceMax) * H }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div key={d.date} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <div
                  className="w-full rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${(d.count / niceMax) * 100}%`,
                    minHeight: d.count ? 2 : 0,
                    backgroundColor: color,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </div>
            ))}
          </div>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
            >
              {label(data[hover].date)} · <b>{data[hover].count}</b> leads
            </div>
          )}
        </div>
      </div>
      <div className="mt-1.5 ml-8 flex justify-between text-[11px] text-slate-400">
        <span>{data[0] && label(data[0].date)}</span>
        <span>{data.length > 1 && label(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
