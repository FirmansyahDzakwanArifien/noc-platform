import type { Tone } from "@noc/ui";
import type { Priority, ProjectMember, ProjectStatus, TaskStatus } from "@noc/supabase/types";

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Perencanaan" },
  { value: "on_going", label: "Berjalan" },
  { value: "on_hold", label: "Ditunda" },
  { value: "done", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

export const TASK_STATUSES: { value: TaskStatus; label: string; tone: Tone }[] = [
  { value: "todo", label: "Belum mulai", tone: "gray" },
  { value: "in_progress", label: "Dikerjakan", tone: "blue" },
  { value: "review", label: "Ditinjau", tone: "purple" },
  { value: "blocked", label: "Terhambat", tone: "red" },
  { value: "done", label: "Selesai", tone: "green" },
];

export const PRIORITIES: { value: Priority; label: string; tone: Tone }[] = [
  { value: "low", label: "Rendah", tone: "gray" },
  { value: "medium", label: "Sedang", tone: "blue" },
  { value: "high", label: "Tinggi", tone: "orange" },
  { value: "critical", label: "Kritis", tone: "red" },
];

export const MEMBER_ROLES: { value: ProjectMember["role"]; label: string; hint: string }[] = [
  { value: "lead", label: "Ketua", hint: "boleh mengubah project, task, dan anggota" },
  { value: "member", label: "Anggota", hint: "mengerjakan task dan mengirim laporan" },
  { value: "reviewer", label: "Peninjau", hint: "memantau dan meninjau hasil pekerjaan" },
];

/** Saran kategori (input bebas, ditampilkan via <datalist>). */
export const CATEGORY_SUGGESTIONS = ["upgrade", "deployment", "migrasi", "improvement", "maintenance", "dokumentasi"];

export function oneOf<T extends string>(value: string | null, options: { value: T }[]): T | null {
  return options.find((o) => o.value === value)?.value ?? null;
}
