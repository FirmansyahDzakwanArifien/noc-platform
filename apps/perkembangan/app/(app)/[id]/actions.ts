"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import { MEMBER_ROLES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, oneOf } from "@/lib/constants";
import { isDateStr, isUuid, todayWIB as toDateInput } from "@/lib/data";

const NO_ACCESS = "Anda tidak memiliki izin untuk aksi ini.";

function backOf(projectId: string) {
  if (!isUuid(projectId)) fail("/", "Project tidak valid.");
  return `/${projectId}`;
}

function checkId(id: string | null, back: string, label = "Data"): string {
  if (!isUuid(id)) fail(back, `${label} tidak valid.`);
  return id;
}

function optDate(formData: FormData, key: string, back: string): string | null {
  const v = str(formData, key);
  if (v !== null && !isDateStr(v)) fail(back, "Format tanggal tidak valid.");
  return v;
}

function refresh(projectId: string) {
  revalidatePath("/");
  revalidatePath(backOf(projectId));
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export async function updateProject(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");

  const name = req(formData, "name", back, "Nama project");
  const status = oneOf(str(formData, "status"), PROJECT_STATUSES);
  if (!status) fail(back, "Status tidak valid.");
  const priority = oneOf(str(formData, "priority"), PRIORITIES) ?? "medium";
  const start = optDate(formData, "start_date", back);
  const target = optDate(formData, "target_date", back);
  if (start && target && target < start) fail(back, "Target selesai tidak boleh sebelum tanggal mulai.");
  const siteId = str(formData, "site_id");

  let finished = optDate(formData, "finished_date", back);
  if (status === "done") finished ??= toDateInput();
  else finished = null;

  const { data, error } = await supabase
    .from("projects")
    .update({
      name,
      description: str(formData, "description"),
      category: str(formData, "category"),
      site_id: isUuid(siteId) ? siteId : null,
      status,
      priority,
      start_date: start,
      target_date: target,
      finished_date: finished,
    })
    .eq("id", projectId)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  refresh(projectId);
  done(back, "Project diperbarui.");
}

export async function deleteProject(projectId: string) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.manage");
  const { data, error } = await supabase.from("projects").delete().eq("id", projectId).select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);
  revalidatePath("/");
  redirect(`/?${new URLSearchParams({ success: "Project dihapus." })}`);
}

// ---------------------------------------------------------------------------
// Anggota
// ---------------------------------------------------------------------------

export async function upsertMember(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const userId = checkId(str(formData, "user_id"), back, "Anggota");
  const role = oneOf(str(formData, "role"), MEMBER_ROLES) ?? "member";

  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: "project_id,user_id" });
  if (error) fail(back, dbError(error));

  refresh(projectId);
  done(back, "Anggota disimpan.");
}

export async function removeMember(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const userId = checkId(str(formData, "user_id"), back, "Anggota");

  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  refresh(projectId);
  done(back, "Anggota dihapus dari project.");
}

// ---------------------------------------------------------------------------
// Milestone
// ---------------------------------------------------------------------------

export async function addMilestone(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const name = req(formData, "name", back, "Nama milestone");
  const due = optDate(formData, "due_date", back);

  const { count } = await supabase
    .from("project_milestones")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase
    .from("project_milestones")
    .insert({ project_id: projectId, name, due_date: due, sort_order: Math.min(count ?? 0, 32000) });
  if (error) fail(back, dbError(error));

  refresh(projectId);
  done(back, "Milestone ditambahkan.");
}

export async function toggleMilestone(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const id = checkId(str(formData, "milestone_id"), back, "Milestone");
  const complete = str(formData, "complete") === "1";

  const { data, error } = await supabase
    .from("project_milestones")
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  refresh(projectId);
  done(back, complete ? "Milestone ditandai selesai." : "Milestone dibuka kembali.");
}

export async function deleteMilestone(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const id = checkId(str(formData, "milestone_id"), back, "Milestone");

  const { data, error } = await supabase
    .from("project_milestones")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  refresh(projectId);
  done(back, "Milestone dihapus. Task di dalamnya tetap ada tanpa milestone.");
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export async function addTask(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");

  const title = req(formData, "title", back, "Judul task");
  const assignee = str(formData, "assignee_id");
  let milestone = str(formData, "milestone_id");
  const parent = str(formData, "parent_id");
  const priority = oneOf(str(formData, "priority"), PRIORITIES) ?? "medium";
  const status = oneOf(str(formData, "status"), TASK_STATUSES) ?? "todo";
  const weight = num(formData, "weight") ?? 1;
  if (weight <= 0 || weight > 9999) fail(back, "Bobot harus lebih dari 0.");
  const start = optDate(formData, "start_date", back);
  const due = optDate(formData, "due_date", back);
  if (start && due && due < start) fail(back, "Tenggat tidak boleh sebelum tanggal mulai.");
  if (assignee && !isUuid(assignee)) fail(back, "Assignee tidak valid.");
  if (milestone && !isUuid(milestone)) fail(back, "Milestone tidak valid.");

  // Subtask mewarisi milestone parent bila milestone tidak dipilih.
  if (parent) {
    if (!isUuid(parent)) fail(back, "Parent task tidak valid.");
    const { data: p } = await supabase
      .from("project_tasks")
      .select("id, milestone_id")
      .eq("id", parent)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!p) fail(back, "Parent task tidak ditemukan di project ini.");
    milestone ??= (p as { milestone_id: string | null }).milestone_id;
  }

  const { count } = await supabase
    .from("project_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("project_tasks").insert({
    project_id: projectId,
    title,
    description: str(formData, "description"),
    assignee_id: assignee,
    milestone_id: milestone,
    parent_id: parent,
    priority,
    status,
    weight,
    start_date: start,
    due_date: due,
    sort_order: count ?? 0,
  });
  if (error) fail(back, dbError(error));

  // Assignee otomatis jadi anggota project agar bisa mengirim laporan progress (RLS progress_updates).
  let note = "";
  if (assignee) {
    const { error: mErr } = await supabase
      .from("project_members")
      .upsert({ project_id: projectId, user_id: assignee, role: "member" }, { onConflict: "project_id,user_id", ignoreDuplicates: true });
    if (mErr) note = " (assignee belum terdaftar sebagai anggota)";
  }

  refresh(projectId);
  done(back, `Task ditambahkan.${note}`);
}

export async function deleteTask(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const id = checkId(str(formData, "task_id"), back, "Task");

  const { data, error } = await supabase
    .from("project_tasks")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  refresh(projectId);
  done(back, "Task dihapus (beserta subtask & laporannya).");
}

// ---------------------------------------------------------------------------
// Laporan progress
// ---------------------------------------------------------------------------

export async function addProgress(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase, auth } = await actionContext(back, "progress.report");

  const content = req(formData, "content", back, "Uraian pekerjaan");
  const taskId = str(formData, "task_id");
  if (taskId && !isUuid(taskId)) fail(back, "Task tidak valid.");
  const pct = num(formData, "progress_pct");
  if (pct !== null && (pct < 0 || pct > 100)) fail(back, "Progress harus 0–100.");
  if (pct !== null && !taskId) fail(back, "Pilih task bila ingin memperbarui progress %.");
  const reportDate = optDate(formData, "report_date", back) ?? toDateInput();
  if (reportDate > toDateInput()) fail(back, "Tanggal laporan tidak boleh di masa depan.");

  const { error } = await supabase.from("progress_updates").insert({
    project_id: projectId,
    task_id: taskId,
    reported_by: auth.userId,
    report_date: reportDate,
    progress_pct: pct,
    content,
    blockers: str(formData, "blockers"),
    next_plan: str(formData, "next_plan"),
  });
  if (error) fail(back, dbError(error));

  revalidatePath("/", "layout");
  done(back, "Laporan progress terkirim.");
}

export async function deleteProgress(projectId: string, formData: FormData) {
  const back = backOf(projectId);
  const { supabase } = await actionContext(back, "project.view");
  const id = checkId(str(formData, "update_id"), back, "Laporan");

  const { data, error } = await supabase
    .from("progress_updates")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, NO_ACCESS);

  revalidatePath("/", "layout");
  done(back, "Laporan dihapus.");
}
