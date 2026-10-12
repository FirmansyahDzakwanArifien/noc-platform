import type { HandoverCategory, HandoverStatus, ItemStatus, Priority } from "@noc/supabase/types";

export const HANDOVER_STATUSES: { value: HandoverStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Diajukan" },
  { value: "acknowledged", label: "Diterima" },
  { value: "returned", label: "Dikembalikan" },
];

export const CATEGORIES: { value: HandoverCategory; label: string }[] = [
  { value: "incident", label: "Incident" },
  { value: "pending_task", label: "Pekerjaan tertunda" },
  { value: "maintenance", label: "Maintenance" },
  { value: "monitoring", label: "Monitoring" },
  { value: "equipment", label: "Perangkat" },
  { value: "info", label: "Informasi" },
];

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Dikerjakan" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export type IncidentStatus = "open" | "investigating" | "mitigated" | "resolved" | "closed";

export const INCIDENT_STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigasi" },
  { value: "mitigated", label: "Mitigasi" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const INPUT_TYPES = [
  { value: "boolean", label: "Ya/Tidak" },
  { value: "number", label: "Angka" },
  { value: "text", label: "Teks" },
  { value: "select", label: "Pilihan" },
] as const;

export const isOneOf = <T extends string>(list: { value: T }[], v: string | null): v is T =>
  v !== null && list.some((x) => x.value === v);

export type Incident = {
  id: string;
  ticket_no: string | null;
  title: string;
  description: string | null;
  site_id: string | null;
  severity: Priority;
  status: IncidentStatus;
  affected_service: string | null;
  started_at: string;
  detected_at: string;
  resolved_at: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  root_cause: string | null;
  resolution: string | null;
  external_ticket: string | null;
  created_at: string;
};

export type IncidentUpdate = {
  id: string;
  incident_id: string;
  status: IncidentStatus | null;
  content: string;
  created_by: string;
  created_at: string;
};
