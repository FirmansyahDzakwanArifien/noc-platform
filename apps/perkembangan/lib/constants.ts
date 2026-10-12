import type { Priority, ProjectMember, ProjectStatus, TaskStatus } from "@noc/supabase/types";

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Perencanaan" },
  { value: "on_going", label: "Berjalan" },
  { value: "on_hold", label: "Ditunda" },
  { value: "done", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "Dikerjakan" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Terhambat" },
  { value: "done", label: "Selesai" },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const MEMBER_ROLES: { value: ProjectMember["role"]; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
  { value: "reviewer", label: "Reviewer" },
];

/** Saran kategori (input bebas, ditampilkan via <datalist>). */
export const CATEGORY_SUGGESTIONS = ["upgrade", "deployment", "migrasi", "improvement", "maintenance", "dokumentasi"];

export function oneOf<T extends string>(value: string | null, options: { value: T }[]): T | null {
  return options.find((o) => o.value === value)?.value ?? null;
}
