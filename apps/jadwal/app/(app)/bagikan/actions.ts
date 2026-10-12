"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import { addDays, diffDays, isValidDate } from "@/lib/dates";

const back = "/bagikan";

/** Buat link publik jadwal untuk rentang tanggal tertentu. */
export async function createShare(formData: FormData) {
  const { supabase, auth } = await actionContext(back, "schedule.manage");
  const title = req(formData, "title", back, "Judul");
  const start = req(formData, "start_date", back, "Tanggal mulai");
  const end = req(formData, "end_date", back, "Tanggal selesai");
  if (!isValidDate(start) || !isValidDate(end)) fail(back, "Format tanggal tidak valid.");
  if (end < start) fail(back, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (diffDays(start, end) > 92) fail(back, "Rentang maksimal 93 hari.");

  // Masa berlaku: "end" = sampai akhir rentang, angka = N hari dari sekarang, "" = tanpa batas.
  const validity = str(formData, "validity");
  let expires: string | null = null;
  if (validity === "end") expires = `${addDays(end, 1)}T00:00:00+07:00`;
  else if (validity && /^\d+$/.test(validity)) expires = new Date(Date.now() + Number(validity) * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("schedule_shares")
    .insert({
      title,
      start_date: start,
      end_date: end,
      team_id: str(formData, "team_id"),
      expires_at: expires,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));
  revalidatePath(back);
  done(`${back}?baru=${data.id}`, "Link dibuat. Salin dan bagikan — siapa pun yang punya link bisa melihat jadwal ini tanpa login.");
}

export async function revokeShare(formData: FormData) {
  const { supabase } = await actionContext(back, "schedule.manage");
  const { error } = await supabase
    .from("schedule_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Link dinonaktifkan. Orang yang membukanya sekarang akan melihat pesan link tidak berlaku.");
}

export async function deleteShare(formData: FormData) {
  const { supabase } = await actionContext(back, "schedule.manage");
  const { error } = await supabase.from("schedule_shares").delete().eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Link dihapus.");
}
