"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import type { Auth } from "@noc/supabase/auth";
import type { PermitApproval, PermitStatus } from "@noc/supabase/types";
import { isUuid, safeBack, type Supabase } from "@/lib/util";

type PermitHead = { id: string; status: PermitStatus; requested_by: string };

/** Ambil & validasi permit_id dari form. */
function permitIdOf(formData: FormData, fallback = "/"): string {
  const id = str(formData, "permit_id");
  if (!isUuid(id)) fail(safeBack(str(formData, "back"), fallback), "Izin tidak valid.");
  return id;
}

function backOf(formData: FormData, permitId: string): string {
  return safeBack(str(formData, "back"), `/${permitId}`);
}

async function loadPermit(supabase: Supabase, id: string, back: string): Promise<PermitHead> {
  const { data, error } = await supabase.from("permits").select("id, status, requested_by").eq("id", id).maybeSingle();
  if (error) fail(back, dbError(error));
  if (!data) fail(back, "Izin tidak ditemukan atau Anda tidak memiliki akses.");
  return data as PermitHead;
}

function refresh(permitId: string) {
  revalidatePath("/");
  revalidatePath(`/${permitId}`);
  revalidatePath("/approval");
  revalidatePath("/kunjungan");
}

const isOwnerOrManager = (p: PermitHead, auth: Auth) => p.requested_by === auth.userId || auth.can("permit.manage");

/** Update yang tidak kena RLS → 0 baris; anggap gagal karena izin. */
async function updatePermit(supabase: Supabase, id: string, values: Record<string, unknown>) {
  const { data, error } = await supabase.from("permits").update(values).eq("id", id).select("id");
  if (error) return dbError(error);
  if (!data || data.length === 0) return "Anda tidak memiliki izin untuk mengubah status izin ini.";
  return null;
}

// ---------------------------------------------------------------- pemohon

export async function submitDraft(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  const permit = await loadPermit(supabase, id, back);
  if (permit.status !== "draft") fail(back, "Hanya draft yang bisa diajukan.");
  if (!isOwnerOrManager(permit, auth)) fail(back, "Hanya pemohon yang bisa mengajukan izin ini.");
  const err = await updatePermit(supabase, id, { status: "submitted", submitted_at: new Date().toISOString() });
  if (err) fail(back, err);
  refresh(id);
  done(back, "Izin berhasil diajukan.");
}

export async function cancelPermit(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  const permit = await loadPermit(supabase, id, back);
  const allowed = auth.can("permit.manage")
    ? ["draft", "submitted", "in_review", "approved"].includes(permit.status)
    : permit.requested_by === auth.userId && ["draft", "submitted"].includes(permit.status);
  if (!allowed) fail(back, "Izin ini tidak bisa dibatalkan pada status sekarang.");
  const err = await updatePermit(supabase, id, { status: "cancelled", closed_at: new Date().toISOString() });
  if (err) fail(back, err);
  refresh(id);
  done(back, "Izin dibatalkan.");
}

export async function deletePermit(formData: FormData) {
  const id = permitIdOf(formData);
  const back = `/${id}`;
  const { supabase, auth } = await actionContext(back);
  const permit = await loadPermit(supabase, id, back);
  const allowed = auth.can("permit.delete") || (permit.requested_by === auth.userId && permit.status === "draft");
  if (!allowed) fail(back, "Anda tidak memiliki izin untuk menghapus izin ini.");
  const { data, error } = await supabase.from("permits").delete().eq("id", id).select("id");
  if (error) fail(back, dbError(error));
  if (!data || data.length === 0) fail(back, "Izin tidak dapat dihapus.");
  revalidatePath("/");
  done("/", "Izin dihapus.");
}

async function requireEditableDraft(supabase: Supabase, auth: Auth, id: string, back: string) {
  const permit = await loadPermit(supabase, id, back);
  if (permit.status !== "draft") fail(back, "Personel & barang hanya bisa diubah selama status draft.");
  if (!isOwnerOrManager(permit, auth)) fail(back, "Hanya pemohon yang bisa mengubah izin ini.");
}

export async function addPersonnel(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  await requireEditableDraft(supabase, auth, id, back);
  const { error } = await supabase.from("permit_personnel").insert({
    permit_id: id,
    full_name: req(formData, "full_name", back, "Nama personel"),
    id_number: str(formData, "id_number"),
    company: str(formData, "company"),
    phone: str(formData, "phone"),
    role: str(formData, "role"),
  });
  if (error) fail(back, dbError(error));
  refresh(id);
  done(back, "Personel ditambahkan.");
}

export async function removePersonnel(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  await requireEditableDraft(supabase, auth, id, back);
  const rowId = str(formData, "row_id");
  if (!isUuid(rowId)) fail(back, "Data tidak valid.");
  const { error } = await supabase.from("permit_personnel").delete().eq("id", rowId).eq("permit_id", id);
  if (error) fail(back, dbError(error));
  refresh(id);
  done(back, "Personel dihapus.");
}

export async function addItem(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  await requireEditableDraft(supabase, auth, id, back);
  const qty = num(formData, "qty") ?? 1;
  if (!Number.isInteger(qty) || qty < 1) fail(back, "Jumlah barang minimal 1.");
  const { error } = await supabase.from("permit_items").insert({
    permit_id: id,
    direction: str(formData, "direction") === "keluar" ? "keluar" : "masuk",
    name: req(formData, "name", back, "Nama barang"),
    brand_model: str(formData, "brand_model"),
    serial_number: str(formData, "serial_number"),
    qty,
  });
  if (error) fail(back, dbError(error));
  refresh(id);
  done(back, "Barang ditambahkan.");
}

export async function removeItem(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back);
  await requireEditableDraft(supabase, auth, id, back);
  const rowId = str(formData, "row_id");
  if (!isUuid(rowId)) fail(back, "Data tidak valid.");
  const { error } = await supabase.from("permit_items").delete().eq("id", rowId).eq("permit_id", id);
  if (error) fail(back, dbError(error));
  refresh(id);
  done(back, "Barang dihapus.");
}

// ---------------------------------------------------------------- approval

export async function addApprovalStep(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase } = await actionContext(back, "permit.manage");
  const permit = await loadPermit(supabase, id, back);
  if (!["submitted", "in_review"].includes(permit.status)) {
    fail(back, "Alur persetujuan hanya bisa diatur saat izin berstatus Diajukan / Ditinjau.");
  }
  const approverId = req(formData, "approver_id", back, "Approver");
  if (!isUuid(approverId)) fail(back, "Approver tidak valid.");

  const { data: steps, error: e1 } = await supabase.from("permit_approvals").select("step").eq("permit_id", id);
  if (e1) fail(back, dbError(e1));
  const nextStep = Math.max(0, ...((steps ?? []) as { step: number }[]).map((s) => s.step)) + 1;

  const { error } = await supabase.from("permit_approvals").insert({ permit_id: id, step: nextStep, approver_id: approverId });
  if (error) fail(back, dbError(error));

  if (permit.status === "submitted") {
    const err = await updatePermit(supabase, id, { status: "in_review" });
    if (err) fail(back, `Langkah ${nextStep} ditambahkan, tetapi status izin gagal diubah: ${err}`);
  }
  refresh(id);
  done(back, `Approver langkah ${nextStep} ditambahkan.`);
}

export async function decideApproval(formData: FormData) {
  const fallbackBack = safeBack(str(formData, "back"), "/approval");
  const approvalId = str(formData, "approval_id");
  if (!isUuid(approvalId)) fail(fallbackBack, "Data approval tidak valid.");
  const decision = str(formData, "decision");
  if (decision !== "approved" && decision !== "rejected") fail(fallbackBack, "Keputusan tidak valid.");
  const comment = str(formData, "comment");
  const { supabase, auth } = await actionContext(fallbackBack, "permit.approve");
  if (decision === "rejected" && !comment) fail(fallbackBack, "Alasan penolakan wajib diisi.");

  const { data: row, error: e0 } = await supabase.from("permit_approvals").select("*").eq("id", approvalId).maybeSingle();
  if (e0) fail(fallbackBack, dbError(e0));
  const step = row as PermitApproval | null;
  if (!step || step.approver_id !== auth.userId) fail(fallbackBack, "Langkah approval tidak ditemukan atau bukan untuk Anda.");
  if (step.decision !== "pending") fail(fallbackBack, "Langkah approval ini sudah diputuskan.");
  const permitId = step.permit_id;
  const back = safeBack(str(formData, "back"), `/${permitId}`);

  const permit = await loadPermit(supabase, permitId, back);
  if (!["submitted", "in_review"].includes(permit.status)) fail(back, "Izin ini tidak sedang dalam proses approval.");

  const { data: allRows, error: e1 } = await supabase.from("permit_approvals").select("*").eq("permit_id", permitId);
  if (e1) fail(back, dbError(e1));
  const all = (allRows ?? []) as PermitApproval[];
  if (all.some((s) => s.step < step.step && s.decision !== "approved")) {
    fail(back, "Masih menunggu keputusan approver di langkah sebelumnya.");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("permit_approvals")
    .update({ decision, comment, decided_at: now })
    .eq("id", approvalId)
    .eq("approver_id", auth.userId)
    .eq("decision", "pending")
    .select("id");
  if (error) fail(back, dbError(error));
  if (!updated || updated.length === 0) fail(back, "Keputusan tidak tersimpan (mungkin sudah diputuskan).");

  const after = all.map((s) => (s.id === approvalId ? { ...s, decision } : s));
  let permitUpdate: Record<string, unknown> | null = null;
  if (after.some((s) => s.decision === "rejected")) permitUpdate = { status: "rejected", closed_at: now };
  else if (after.every((s) => s.decision === "approved")) permitUpdate = { status: "approved", approved_at: now };

  if (permitUpdate) {
    const err = await updatePermit(supabase, permitId, permitUpdate);
    if (err) {
      refresh(permitId);
      fail(
        back,
        "Keputusan Anda tersimpan, tetapi status izin belum dapat diperbarui (perlu hak kelola izin). " +
          "Mohon minta pengelola izin memperbarui statusnya.",
      );
    }
  }
  refresh(permitId);
  done(back, decision === "approved" ? "Izin disetujui." : "Izin ditolak.");
}

// ---------------------------------------------------------------- kunjungan

export async function checkIn(formData: FormData) {
  const id = permitIdOf(formData, "/kunjungan");
  const back = backOf(formData, id);
  const { supabase, auth } = await actionContext(back, "permit.checkin");
  const permit = await loadPermit(supabase, id, back);
  if (!["approved", "active"].includes(permit.status)) fail(back, "Check-in hanya untuk izin yang sudah disetujui / aktif.");

  const personnelId = req(formData, "personnel_id", back, "Personel");
  if (!isUuid(personnelId)) fail(back, "Personel tidak valid.");
  const { data: person } = await supabase
    .from("permit_personnel")
    .select("id")
    .eq("id", personnelId)
    .eq("permit_id", id)
    .maybeSingle();
  if (!person) fail(back, "Personel tidak terdaftar di izin ini.");
  const { data: open } = await supabase
    .from("permit_visits")
    .select("id")
    .eq("permit_id", id)
    .eq("personnel_id", personnelId)
    .is("check_out_at", null)
    .limit(1);
  if (open && open.length > 0) fail(back, "Personel ini masih tercatat di lokasi (belum check-out).");

  const { error } = await supabase.from("permit_visits").insert({
    permit_id: id,
    personnel_id: personnelId,
    checked_in_by: auth.userId,
    note: str(formData, "note"),
  });
  if (error) fail(back, dbError(error));

  if (permit.status === "approved") {
    const err = await updatePermit(supabase, id, { status: "active" });
    if (err) {
      refresh(id);
      done(back, "Check-in tercatat. Status izin belum dapat diubah ke Aktif (perlu hak kelola izin).");
    }
  }
  refresh(id);
  done(back, "Check-in tercatat.");
}

export async function checkOut(formData: FormData) {
  const fallback = safeBack(str(formData, "back"), "/kunjungan");
  const visitId = str(formData, "visit_id");
  if (!isUuid(visitId)) fail(fallback, "Data kunjungan tidak valid.");
  const { supabase, auth } = await actionContext(fallback, "permit.checkin");
  const { data, error } = await supabase
    .from("permit_visits")
    .update({ check_out_at: new Date().toISOString(), checked_out_by: auth.userId })
    .eq("id", visitId)
    .is("check_out_at", null)
    .select("permit_id");
  if (error) fail(fallback, dbError(error));
  if (!data || data.length === 0) fail(fallback, "Kunjungan tidak ditemukan atau sudah check-out.");
  refresh((data[0] as { permit_id: string }).permit_id);
  done(fallback, "Check-out tercatat.");
}

// ---------------------------------------------------------------- penutupan

export async function completePermit(formData: FormData) {
  const id = permitIdOf(formData);
  const back = backOf(formData, id);
  const { supabase } = await actionContext(back, "permit.manage");
  const permit = await loadPermit(supabase, id, back);
  if (!["approved", "active"].includes(permit.status)) fail(back, "Hanya izin yang disetujui / aktif yang bisa diselesaikan.");

  const { count } = await supabase
    .from("permit_visits")
    .select("id", { count: "exact", head: true })
    .eq("permit_id", id)
    .is("check_out_at", null);
  if (count && count > 0) fail(back, `Masih ada ${count} personel di lokasi. Lakukan check-out terlebih dahulu.`);

  const err = await updatePermit(supabase, id, {
    status: "completed",
    closed_at: new Date().toISOString(),
    closing_note: str(formData, "closing_note"),
  });
  if (err) fail(back, err);
  refresh(id);
  done(back, "Izin diselesaikan.");
}
