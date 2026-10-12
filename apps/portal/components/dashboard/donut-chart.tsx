"use client";

import { useState } from "react";

export type DonutSlice = { key: string; label: string; value: number; color: string };

/** Donut interaktif: hover slice / legend untuk menyorot. */
export function DonutChart({ data, centerLabel }: { data: DonutSlice[]; centerLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const current = data.find((d) => d.key === active);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {total > 0 &&
            data
              .filter((d) => d.value > 0)
              .map((d) => {
                const len = (d.value / total) * c;
                const el = (
                  <circle
                    key={d.key}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={active === d.key ? 15 : 12}
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    className="cursor-pointer transition-all duration-300"
                    style={{ opacity: active && active !== d.key ? 0.35 : 1 }}
                    onMouseEnter={() => setActive(d.key)}
                    onMouseLeave={() => setActive(null)}
                  />
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{current ? current.value : total}</p>
            <p className="text-[11px] text-slate-500">{current ? current.label : centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-1">
        {data.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${
                active === d.key ? "bg-slate-100" : ""
              }`}
            >
              <span className="size-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-slate-600">{d.label}</span>
              <span className="ml-auto font-medium tabular-nums text-slate-900">{d.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
