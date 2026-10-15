"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import { INPUT_TYPES } from "@/lib/constants";
import { isUuid } from "@/lib/util";

/** Divisi template dari form; kosong = semua divisi. */
function divisionOf(formData: FormData, back: string): string | null {
  const v = str(formData, "division_id");
  if (v !== null && !isUuid(v)) fail(back, "Divisi tidak valid.");
  return v;
}

export async function createTemplate(formData: FormData) {
  const back = "/checklist";
  const { supabase } = await actionContext(back, "master.manage");
  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      name: req(formData, "name", back, "Nama template"),
      site_id: str(formData, "site_id"),
      division_id: divisionOf(formData, back),
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));
  revalidatePath(back);
  done(`/checklist/${(data as { id: string }).id}`, "Template dibuat. Tambahkan item checklist.");
}

export async function updateTemplate(formData: FormData) {
  const id = req(formData, "id", "/checklist", "ID");
  const back = `/checklist/${id}`;
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase
    .from("checklist_templates")
    .update({
      name: req(formData, "name", back, "Nama template"),
      site_id: str(formData, "site_id"),
      division_id: divisionOf(formData, back),
    })
    .eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/checklist");
  revalidatePath(back);
  done(back, "Template diperbarui.");
}

export async function toggleTemplate(formData: FormData) {
  const id = req(formData, "id", "/checklist", "ID");
  const back = str(formData, "back") === "detail" ? `/checklist/${id}` : "/checklist";
  const { supabase } = await actionContext(back, "master.manage");
  const active = str(formData, "active") === "true";
  const { error } = await supabase.from("checklist_templates").update({ is_active: active }).eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/checklist");
  revalidatePath(`/checklist/${id}`);
  done(back, active ? "Template diaktifkan." : "Template dinonaktifkan.");
}

export async function addTemplateItem(formData: FormData) {
  const templateId = req(formData, "template_id", "/checklist", "Template");
  const back = `/checklist/${templateId}`;
  const { supabase } = await actionContext(back, "master.manage");

  const inputType = str(formData, "input_type") ?? "boolean";
  if (!INPUT_TYPES.some((t) => t.value === inputType)) fail(back, "Tipe input tidak valid.");
  const options = (str(formData, "options") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (inputType === "select" && options.length === 0) fail(back, "Isi pilihan (dipisah koma) untuk tipe Pilihan.");
  const min = num(formData, "min_value");
  const max = num(formData, "max_value");
  if (min !== null && max !== null && min > max) fail(back, "Nilai min tidak boleh lebih besar dari max.");

  const { error } = await supabase.from("checklist_template_items").insert({
    template_id: templateId,
    section: str(formData, "section"),
    label: req(formData, "label", back, "Label"),
    input_type: inputType,
    unit: inputType === "number" ? str(formData, "unit") : null,
    options: inputType === "select" ? options : null,
    min_value: inputType === "number" ? min : null,
    max_value: inputType === "number" ? max : null,
    is_required: bool(formData, "is_required"),
    sort_order: Math.trunc(num(formData, "sort_order") ?? 0),
  });
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Item ditambahkan.");
}

export async function deleteTemplateItem(formData: FormData) {
  const templateId = req(formData, "template_id", "/checklist", "Template");
  const back = `/checklist/${templateId}`;
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("id", req(formData, "item_id", back, "Item"))
    .eq("template_id", templateId);
  if (error) {
    fail(
      back,
      error.code === "23503" ? "Item sudah dipakai di hasil checklist handover sehingga tidak bisa dihapus." : dbError(error),
    );
  }
  revalidatePath(back);
  done(back, "Item dihapus.");
}
