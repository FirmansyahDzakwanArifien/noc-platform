// Tipe baris tabel (sinkron dengan supabase/migrations). Bisa diganti dengan
// `supabase gen types typescript` setelah database tersambung.

export type Priority = "low" | "medium" | "high" | "critical";

export type Profile = {
  id: string;
  full_name: string;
  employee_no: string | null;
  email: string | null;
  phone: string | null;
  team_id: string | null;
  vendor_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rank: number;
  is_system: boolean;
};

export type Site = {
  id: string;
  code: string;
  name: string;
  site_type: string;
  address: string | null;
  region: string | null;
  is_active: boolean;
};

export type Team = { id: string; name: string; description: string | null };

export type Vendor = {
  id: string;
  name: string;
  pic_name: string | null;
  pic_phone: string | null;
  pic_email: string | null;
  is_active: boolean;
};

// ---------- Jadwal ----------
export type Shift = {
  id: string;
  code: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  is_working: boolean;
  color: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ScheduleStatus = "draft" | "published" | "archived";

export type SchedulePeriod = {
  id: string;
  name: string;
  site_id: string | null;
  team_id: string | null;
  start_date: string;
  end_date: string;
  status: ScheduleStatus;
  notes: string | null;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
};

export type ShiftSchedule = {
  id: string;
  period_id: string;
  work_date: string;
  shift_id: string;
  site_id: string | null;
  user_id: string;
  is_leader: boolean;
  note: string | null;
};

// ---------- Handover ----------
export type HandoverStatus = "draft" | "submitted" | "acknowledged" | "returned";
export type HandoverCategory = "incident" | "pending_task" | "maintenance" | "monitoring" | "info" | "equipment";
export type ItemStatus = "open" | "in_progress" | "resolved" | "closed";

export type Handover = {
  id: string;
  handover_no: string | null;
  site_id: string | null;
  shift_date: string;
  from_shift_id: string;
  to_shift_id: string;
  outgoing_by: string;
  incoming_by: string | null;
  status: HandoverStatus;
  summary: string | null;
  notes: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  ack_note: string | null;
  created_at: string;
};

export type HandoverItem = {
  id: string;
  handover_id: string;
  category: HandoverCategory;
  title: string;
  description: string | null;
  priority: Priority;
  status: ItemStatus;
  incident_id: string | null;
  ref_ticket: string | null;
  carried_from: string | null;
  due_at: string | null;
  sort_order: number;
};

export type ChecklistTemplate = { id: string; name: string; site_id: string | null; is_active: boolean };

export type ChecklistTemplateItem = {
  id: string;
  template_id: string;
  section: string | null;
  label: string;
  input_type: "boolean" | "number" | "text" | "select";
  unit: string | null;
  options: string[] | null;
  min_value: number | null;
  max_value: number | null;
  is_required: boolean;
  sort_order: number;
};

export type HandoverChecklistResult = {
  id: string;
  handover_id: string;
  template_item_id: string;
  value: unknown;
  is_ok: boolean | null;
  note: string | null;
  checked_by: string | null;
  checked_at: string;
};

// ---------- Perizinan ----------
export type PermitType = "akses_site" | "pekerjaan" | "maintenance" | "change_request" | "keluar_masuk_barang";
export type PermitStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "active"
  | "completed"
  | "cancelled"
  | "expired";

export type Permit = {
  id: string;
  permit_no: string | null;
  permit_type: PermitType;
  title: string;
  purpose: string;
  site_id: string;
  requested_by: string;
  vendor_id: string | null;
  pic_internal: string | null;
  start_at: string;
  end_at: string;
  risk_level: Priority;
  impact: string | null;
  rollback_plan: string | null;
  status: PermitStatus;
  submitted_at: string | null;
  approved_at: string | null;
  closed_at: string | null;
  closing_note: string | null;
  created_at: string;
};

export type PermitPersonnel = {
  id: string;
  permit_id: string;
  full_name: string;
  id_number: string | null;
  company: string | null;
  phone: string | null;
  role: string | null;
};

export type PermitItem = {
  id: string;
  permit_id: string;
  direction: "masuk" | "keluar";
  name: string;
  brand_model: string | null;
  serial_number: string | null;
  qty: number;
  note: string | null;
};

export type PermitApproval = {
  id: string;
  permit_id: string;
  step: number;
  approver_id: string;
  decision: "pending" | "approved" | "rejected";
  comment: string | null;
  decided_at: string | null;
};

export type PermitVisit = {
  id: string;
  permit_id: string;
  personnel_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
  checked_in_by: string | null;
  checked_out_by: string | null;
  note: string | null;
};

export type LeaveType = "cuti" | "izin" | "sakit" | "tukar_shift" | "dinas";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  request_no: string | null;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  swap_with: string | null;
  swap_schedule_id: string | null;
  swap_accepted_at: string | null;
  reason: string;
  status: RequestStatus;
  approver_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

// ---------- Perkembangan ----------
export type ProjectStatus = "planning" | "on_going" | "on_hold" | "done" | "cancelled";
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";

export type Project = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  category: string | null;
  site_id: string | null;
  owner_id: string;
  status: ProjectStatus;
  priority: Priority;
  start_date: string | null;
  target_date: string | null;
  finished_date: string | null;
  progress_pct: number;
  created_at: string;
};

export type ProjectMember = { project_id: string; user_id: string; role: "lead" | "member" | "reviewer" };

export type ProjectMilestone = {
  id: string;
  project_id: string;
  name: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  priority: Priority;
  weight: number;
  progress_pct: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
};

export type ProgressUpdate = {
  id: string;
  project_id: string;
  task_id: string | null;
  reported_by: string;
  report_date: string;
  progress_pct: number | null;
  content: string;
  blockers: string | null;
  next_plan: string | null;
  created_at: string;
};

// ---------- Shared ----------
export type Notification = {
  id: string;
  user_id: string;
  app: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  publish_at: string;
  expire_at: string | null;
  created_by: string;
  created_at: string;
};
