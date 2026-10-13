import type { ReactNode } from "react";
import { cn } from "../cn";

const tones = {
  info: "border-blue-100 bg-blue-50/70 text-blue-800",
  success: "border-emerald-100 bg-emerald-50/70 text-emerald-800",
  warning: "border-amber-100 bg-amber-50/70 text-amber-900",
  error: "border-red-100 bg-red-50/70 text-red-800",
};

export function Alert({
  tone = "info",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
