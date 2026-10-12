"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import { isPermitType, isPriority, ROW_COUNT } from "@/lib/labels";
import { isUuid, wibToIso } from "@/lib/util";

const BACK = "/baru";

export async function saveDraft(formData: FormData) {
  await createPermit(formData, false);
}

export async function submitPermit(formData: FormData) {
  await createPermit(formData, true);
}

async function createPermit(formData: FormData, submit: boolean) {
  const { supabase, auth } = await actionContext(BACK, "permit.create");

  const permitType = req(formData, "permit_type", BACK, "Jenis izin");
  if (!isPermitType(permitType)) fail(BACK, "Jenis izin tidak valid.");
  const title = req(formData, "title", BACK, "Judul");
  const purpose = req(formData, "purpose", BACK, "Tujuan / lingkup pekerjaan");
  const siteId = req(formData, "site_id", BACK, "Site");
  const vendorId = str(formData, "vendor_id");
  const picInternal = str(formData, "pic_internal");
  const startAt = wibToIso(req(formData, "start_at", BACK, "Waktu mulai"));
  const endAt = wibToIso(req(formData, "end_at", BACK, "Waktu selesai"));
  const riskLevel = str(formData, "risk_level") ?? "low";
  const impact = str(formData, "impact");
  const rollbackPlan = str(formData, "rollback_plan");

  if (!isUuid(siteId)) fail(BACK, "Site tidak valid.");
  if (vendorId && !isUuid(vendorId)) fail(BACK, "Vendor tidak valid.");
  if (picInternal && !isUuid(picInternal)) fail(BACK, "PIC internal tidak valid.");
  if (!startAt || !endAt) fail(BACK, "Format waktu tidak valid.");
  if (new Date(endAt) <= new Date(startAt)) fail(BACK, "Waktu selesai harus setelah waktu mulai.");
  if (!isPriority(riskLevel)) fail(BACK, "Tingkat risiko tidak valid.");
  if (permitType === "change_request" && !rollbackPlan) fail(BACK, "Rencana rollback wajib diisi untuk Change Request.");

  const personnel = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const fullName = str(formData, `p_full_name_${i}`);
    if (!fullName) continue;
    personnel.push({
      full_name: fullName,
      id_number: str(formData, `p_id_number_${i}`),
      company: str(formData, `p_company_${i}`),
      phone: str(formData, `p_phone_${i}`),
      role: str(formData, `p_role_${i}`),
    });
  }

  const items = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    const name = str(formData, `i_name_${i}`);
    if (!name) continue;
    const direction = str(formData, `i_direction_${i}`) === "keluar" ? "keluar" : "masuk";
    const qty = num(formData, `i_qty_${i}`) ?? 1;
    if (!Number.isInteger(qty) || qty < 1) fail(BACK, `Jumlah barang "${name}" minimal 1.`);
    items.push({
      direction,
      name,
      brand_model: str(formData, `i_brand_model_${i}`),
      serial_number: str(formData, `i_serial_number_${i}`),
      qty,
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("permits")
    .insert({
      permit_type: permitType,
      title,
      purpose,
      site_id: siteId,
      vendor_id: vendorId,
      pic_internal: picInternal,
      start_at: startAt,
      end_at: endAt,
      risk_level: riskLevel,
      impact,
      rollback_plan: rollbackPlan,
      requested_by: auth.userId,
      status: submit ? "submitted" : "draft",
      submitted_at: submit ? now : null,
    })
    .select("id")
    .single();
  if (error || !data) fail(BACK, dbError(error));
  const id = (data as { id: string }).id;
  const detail = `/${id}`;

  const problems: string[] = [];
  if (personnel.length) {
    const { error: e } = await supabase.from("permit_personnel").insert(personnel.map((p) => ({ ...p, permit_id: id })));
    if (e) problems.push(`personel (${dbError(e)})`);
  }
  if (items.length) {
    const { error: e } = await supabase.from("permit_items").insert(items.map((it) => ({ ...it, permit_id: id })));
    if (e) problems.push(`barang (${dbError(e)})`);
  }

  revalidatePath("/");
  if (problems.length) fail(detail, `Izin tersimpan, tetapi gagal menyimpan ${problems.join(" dan ")}.`);
  done(detail, submit ? "Izin berhasil diajukan." : "Draft izin tersimpan.");
}
