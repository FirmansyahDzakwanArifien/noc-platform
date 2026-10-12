import type { ReactNode } from "react";
import { cn } from "../cn";

export type Tone = "gray" | "blue" | "green" | "yellow" | "red" | "purple" | "orange";

const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Warna + label bahasa Indonesia untuk status/prioritas yang dipakai di semua modul. */
const STATUS: Record<string, [Tone, string]> = {
  // umum
  draft: ["gray", "Draft"],
  pending: ["yellow", "Menunggu"],
  submitted: ["blue", "Diajukan"],
  in_review: ["purple", "Ditinjau"],
  approved: ["green", "Disetujui"],
  rejected: ["red", "Ditolak"],
  cancelled: ["gray", "Dibatalkan"],
  active: ["blue", "Aktif"],
  completed: ["green", "Selesai"],
  expired: ["gray", "Kedaluwarsa"],
  published: ["green", "Dipublikasikan"],
  archived: ["gray", "Diarsipkan"],
  // handover
  acknowledged: ["green", "Diterima"],
  returned: ["orange", "Dikembalikan"],
  open: ["yellow", "Open"],
  in_progress: ["blue", "Dikerjakan"],
  resolved: ["green", "Resolved"],
  closed: ["gray", "Closed"],
  // project
  planning: ["gray", "Perencanaan"],
  on_going: ["blue", "Berjalan"],
  on_hold: ["orange", "Ditunda"],
  done: ["green", "Selesai"],
  todo: ["gray", "To do"],
  review: ["purple", "Review"],
  blocked: ["red", "Terhambat"],
  // incident
  investigating: ["orange", "Investigasi"],
  mitigated: ["purple", "Mitigasi"],
  // prioritas
  low: ["gray", "Low"],
  medium: ["blue", "Medium"],
  high: ["orange", "High"],
  critical: ["red", "Critical"],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [tone, label] = STATUS[status] ?? ["gray", status];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
