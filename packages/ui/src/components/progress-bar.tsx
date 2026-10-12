import { cn } from "../cn";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-brand-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-11 text-right text-xs font-medium tabular-nums text-slate-600">{pct.toFixed(0)}%</span>
    </div>
  );
}
