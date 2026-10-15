"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";

const TOGGLEABLE = ["sites", "shifts", "vendors"] as const;
const DELETABLE = { sites: "Site", teams: "Tim", shifts: "Shift", vendors: "Vendor" } as const;
const TAB_OF = { sites: "site", teams: "tim", shifts: "shift", vendors: "vendor" } as const;

function backOf(formData: FormData, fallback: string) {
  const b = str(formData, "back");
  return b && b.startsWith("/admin/master") ? b : fallback;
}

function siteFields(formData: FormData, back: string) {
  return {
    code: req(formData, "code", back, "Kode").toUpperCase(),
    name: req(formData, "name", back, "Nama"),
    site_type: str(formData, "site_type") ?? "pop",
    region: str(formData, "region"),
    address: str(formData, "address"),
  };
}

function teamFields(formData: FormData, back: string) {
  return {
    name: req(formData, "name", back, "Nama tim"),
    description: str(formData, "description"),
    managed_by_team_id: str(formData, "managed_by_team_id"),
  };
}

function shiftFields(formData: FormData, back: string) {
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  if (!!start !== !!end) fail(back, "Isi jam mulai dan selesai, atau kosongkan keduanya untuk shift libur.");
  return {
    code: req(formData, "code", back, "Kode").toUpperCase(),
    name: req(formData, "name", back, "Nama"),
    start_time: start,
    end_time: end,
    is_working: !!start,
    color: str(formData, "color"),
    sort_order: num(formData, "sort_order") ?? 0,
  };
}

function vendorFields(formData: FormData, back: string) {
  return {
    name: req(formData, "name", back, "Nama perusahaan"),
    npwp: str(formData, "npwp"),
    pic_name: str(formData, "pic_name"),
    pic_phone: str(formData, "pic_phone"),
    pic_email: str(formData, "pic_email")?.toLowerCase() ?? null,
  };
}

const FIELDS = { sites: siteFields, teams: teamFields, shifts: shiftFields, vendors: vendorFields } as const;
type MasterTable = keyof typeof FIELDS;

function tableOf(formData: FormData, back: string): MasterTable {
  const t = req(formData, "table", back);
  if (!(t in FIELDS)) fail(back, "Tabel tidak valid.");
  return t as MasterTable;
}

/** Tambah (tanpa id) atau ubah (dengan id) satu baris master data. */
export async function saveMaster(formData: FormData) {
  const fallback = "/admin/master";
  const table = tableOf(formData, fallback);
  const list = `/admin/master?tab=${TAB_OF[table]}`;
  const id = str(formData, "id");
  const back = id ? `${list}&edit=${id}` : list;
  const { supabase } = await actionContext(back, "master.manage");
  const values: Record<string, unknown> = FIELDS[table](formData, back);

  const { error } = id
    ? await supabase.from(table).update(values).eq("id", id)
    : await supabase.from(table).insert(values);
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(list, `${DELETABLE[table]} ${id ? "diperbarui" : "ditambahkan"}.`);
}

export async function deleteMaster(formData: FormData) {
  const table = tableOf(formData, "/admin/master");
  const back = `/admin/master?tab=${TAB_OF[table]}`;
  const { supabase } = await actionContext(back, "master.delete");
  const { data, error } = await supabase.from(table).delete().eq("id", req(formData, "id", back)).select("id");
  if (error) {
    fail(
      back,
      error.code === "23503"
        ? `${DELETABLE[table]} masih dipakai oleh data lain. ${table === "teams" ? "Kosongkan anggota/jadwalnya dulu." : "Nonaktifkan saja."}`
        : dbError(error),
    );
  }
  if (!data?.length) fail(back, "Anda tidak memiliki izin untuk menghapus data ini.");
  revalidatePath("/admin/master");
  done(back, `${DELETABLE[table]} dihapus.`);
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

/** Tambah/keluarkan anggota tim (team = "" berarti keluarkan dari tim). */
export async function setTeamMember(formData: FormData) {
  const back = backOf(formData, "/admin/master?tab=tim");
  const { supabase } = await actionContext(back, "master.manage");
  const { error } = await supabase.rpc("set_profile_team", {
    p_user: req(formData, "user_id", back, "User"),
    p_team: str(formData, "team_id"),
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/master");
  done(back, str(formData, "team_id") ? "Anggota ditambahkan." : "Anggota dikeluarkan dari tim.");
}
