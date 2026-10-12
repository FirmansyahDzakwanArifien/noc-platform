"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";

const TOGGLEABLE = ["sites", "shifts", "vendors"] as const;

function backOf(formData: FormData, fallback: string) {
  const b = str(formData, "back");
  return b && b.startsWith("/admin/master") ? b : fallback;
}

export async function createSite(formData: FormData) {
  const back = "/admin/master?tab=site";
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase.from("sites").insert({
    code: req(formData, "code", back, "Kode").toUpperCase(),
    name: req(formData, "name", back, "Nama"),
    site_type: str(formData, "site_type") ?? "pop",
    region: str(formData, "region"),
    address: str(formData, "address"),
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Site ditambahkan.");
}

export async function createTeam(formData: FormData) {
  const back = "/admin/master?tab=tim";
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase.from("teams").insert({
    name: req(formData, "name", back, "Nama tim"),
    description: str(formData, "description"),
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Tim ditambahkan.");
}

export async function deleteTeam(formData: FormData) {
  const back = backOf(formData, "/admin/master?tab=tim");
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase.from("teams").delete().eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Tim dihapus.");
}

export async function createShift(formData: FormData) {
  const back = "/admin/master?tab=shift";
  const { supabase } = await actionContext(back, "master.manage");
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  if (!!start !== !!end) fail(back, "Isi jam mulai dan selesai, atau kosongkan keduanya untuk shift libur.");
  const { error } = await supabase.from("shifts").insert({
    code: req(formData, "code", back, "Kode").toUpperCase(),
    name: req(formData, "name", back, "Nama"),
    start_time: start,
    end_time: end,
    is_working: !!start,
    color: str(formData, "color"),
    sort_order: num(formData, "sort_order") ?? 0,
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Shift ditambahkan.");
}

export async function createVendor(formData: FormData) {
  const back = "/admin/master?tab=vendor";
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase.from("vendors").insert({
    name: req(formData, "name", back, "Nama perusahaan"),
    pic_name: str(formData, "pic_name"),
    pic_phone: str(formData, "pic_phone"),
    pic_email: str(formData, "pic_email")?.toLowerCase() ?? null,
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Vendor ditambahkan.");
}

export async function toggleActive(formData: FormData) {
  const back = backOf(formData, "/admin/master");
  const { supabase } = await actionContext(back, "master.manage");
  const table = req(formData, "table", back);
  if (!TOGGLEABLE.includes(table as (typeof TOGGLEABLE)[number])) fail(back, "Tabel tidak valid.");
  const { error } = await supabase
    .from(table)
    .update({ is_active: req(formData, "active", back) === "1" })
    .eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, "Status diperbarui.");
}
