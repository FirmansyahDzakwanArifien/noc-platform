"use client";

import { useState } from "react";

export type ActivityPoint = { date: string; label: string; incidents: number; handovers: number };

const SERIES = [
  { key: "handovers", name: "Handover", color: "bg-slate-800", fill: "#1e293b" },
  { key: "incidents", name: "Incident", color: "bg-brand-500", fill: "#ef4444" },
] as const;

/** Grafik batang bertumpuk 14 hari terakhir dengan tooltip saat hover / tap. */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.incidents + d.handovers));
  const totals = { incidents: data.reduce((s, d) => s + d.incidents, 0), handovers: data.reduce((s, d) => s + d.handovers, 0) };
  const current = active !== null ? data[active] : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-5">
          {SERIES.map((s) => (
            <div key={s.key}>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`size-2 rounded-sm ${s.color}`} /> {s.name}
              </p>
              <p className="text-xl font-semibold tabular-nums text-slate-900">{totals[s.key]}</p>
            </div>
          ))}
        </div>
        <p className="h-9 text-right text-xs text-slate-500">
          {current ? (
            <>
              <span className="font-medium text-slate-900">{current.label}</span>
              <br />
              {current.handovers} handover · {current.incidents} incident
            </>
          ) : (
            "Arahkan kursor ke grafik"
          )}
        </p>
      </div>

      <div className="mt-4 flex h-40 items-end gap-1 sm:gap-1.5" onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => {
          const total = d.incidents + d.handovers;
          return (
            <button
              key={d.date}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group flex h-full flex-1 flex-col justify-end rounded-md focus:outline-none"
              aria-label={`${d.label}: ${d.handovers} handover, ${d.incidents} incident`}
            >
              <div
                className={`flex w-full flex-col justify-end overflow-hidden rounded-md transition-all duration-500 ${
                  active === null || active === i ? "opacity-100" : "opacity-40"
                } ${total === 0 ? "bg-slate-100" : ""}`}
                style={{ height: total === 0 ? "4px" : `${(total / max) * 100}%` }}
              >
                <div style={{ flexGrow: d.incidents, background: SERIES[1].fill }} />
                <div style={{ flexGrow: d.handovers, background: SERIES[0].fill }} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>Hari ini</span>
      </div>
    </div>
  );
}
