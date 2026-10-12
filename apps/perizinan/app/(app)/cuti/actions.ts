"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import type { LeaveRequest } from "@noc/supabase/types";
import { toDateInput } from "@noc/ui";
import { isLeaveType } from "@/lib/labels";
import { isUuid } from "@/lib/util";

const LIST = "/cuti";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createLeave(formData: FormData) {
  const type = str(formData, "leave_type");
  const back = `/cuti/baru${isLeaveType(type) ? `?jenis=${type}` : ""}`;
  const { supabase, auth } = await actionContext(back, "leave.request");
  if (!isLeaveType(type)) fail(back, "Jenis permintaan tidak valid.");
  const reason = req(formData, "reason", back, "Alasan");

  let startDate: string;
  let endDate: string;
  let swapWith: string | null = null;
  let swapScheduleId: string | null = null;

  if (type === "tukar_shift") {
    swapScheduleId = req(formData, "swap_schedule_id", back, "Jadwal yang ditukar");
    swapWith = req(formData, "swap_with", back, "Rekan pengganti");
    if (!isUuid(swapScheduleId) || !isUuid(swapWith)) fail(back, "Data tukar shift tidak valid.");
    if (swapWith === auth.userId) fail(back, "Tidak bisa tukar shift dengan diri sendiri.");
    const { data: sched, error } = await supabase
      .from("v_my_schedule")
      .select("id, work_date, is_working")
      .eq("id", swapScheduleId)
      .maybeSingle();
    if (error) fail(back, dbError(error));
    const s = sched as { id: string; work_date: string; is_working: boolean } | null;
    if (!s || !s.is_working) fail(back, "Jadwal tidak ditemukan atau bukan jadwal kerja Anda.");
    if (s.work_date < toDateInput()) fail(back, "Jadwal yang sudah lewat tidak bisa ditukar.");
    startDate = s.work_date;
    endDate = s.work_date;
  } else {
    startDate = req(formData, "start_date", back, "Tanggal mulai");
    endDate = req(formData, "end_date", back, "Tanggal selesai");
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) fail(back, "Format tanggal tidak valid.");
    if (endDate < startDate) fail(back, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  }

  const { error } = await supabase.from("leave_requests").insert({
    user_id: auth.userId,
    leave_type: type,
    start_date: startDate,
    end_date: endDate,
    swap_with: swapWith,
    swap_schedule_id: swapScheduleId,
    reason,
  });
  if (error) fail(back, dbError(error));
  revalidatePath(LIST);
  done(LIST, type === "tukar_shift" ? "Permintaan tukar shift terkirim. Menunggu persetujuan rekan." : "Permintaan terkirim.");
}

export async function cancelLeave(formData: FormData) {
  const id = str(formData, "id");
  if (!isUuid(id)) fail(LIST, "Data tidak valid.");
  const { supabase, auth } = await actionContext(LIST);
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("status", "pending")
    .select("id");
  if (error) fail(LIST, dbError(error));
  if (!data || data.length === 0) fail(LIST, "Permintaan tidak ditemukan atau sudah diproses.");
  revalidatePath(LIST);
  done(LIST, "Permintaan dibatalkan.");
}

export async function acceptSwap(formData: FormData) {
  const id = str(formData, "id");
  if (!isUuid(id)) fail(LIST, "Data tidak valid.");
  const { supabase } = await actionContext(LIST);
  const { error } = await supabase.rpc("accept_shift_swap", { p_request_id: id });
  if (error) fail(LIST, dbError(error));
  revalidatePath(LIST);
  done(LIST, "Anda menyetujui tukar shift. Menunggu persetujuan atasan.");
}

export async function decideLeave(formData: FormData) {
  const id = str(formData, "id");
  if (!isUuid(id)) fail(LIST, "Data tidak valid.");
  const decision = str(formData, "decision");
  if (decision !== "approved" && decision !== "rejected") fail(LIST, "Keputusan tidak valid.");
  const note = str(formData, "decision_note");
  const { supabase, auth } = await actionContext(LIST, "leave.approve");
  if (decision === "rejected" && !note) fail(LIST, "Catatan wajib diisi bila menolak.");

  const { data: row, error: e0 } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (e0) fail(LIST, dbError(e0));
  const r = row as LeaveRequest | null;
  if (!r) fail(LIST, "Permintaan tidak ditemukan.");
  if (r.status !== "pending") fail(LIST, "Permintaan ini sudah diproses.");
  if (r.user_id === auth.userId) fail(LIST, "Anda tidak bisa memutuskan permintaan sendiri.");
  if (decision === "approved" && r.leave_type === "tukar_shift" && !r.swap_accepted_at) {
    fail(LIST, "Rekan belum menyetujui tukar shift.");
  }

  // approver_id & decided_at diisi otomatis oleh trigger tg_guard_leave_request
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: note })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) fail(LIST, dbError(error));
  if (!data || data.length === 0) fail(LIST, "Anda tidak memiliki izin untuk memutuskan permintaan ini.");
  revalidatePath(LIST);
  done(LIST, decision === "approved" ? "Permintaan disetujui." : "Permintaan ditolak.");
}
