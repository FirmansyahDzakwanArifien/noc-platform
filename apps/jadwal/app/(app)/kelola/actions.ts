"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import { dateRange, diffDays, isValidDate } from "@/lib/dates";

export async function createPeriod(formData: FormData) {
  const back = "/kelola";
  const { supabase, auth } = await actionContext(back, "schedule.manage");
  const name = req(formData, "name", back, "Nama periode");
  const start = req(formData, "start_date", back, "Tanggal mulai");
  const end = req(formData, "end_date", back, "Tanggal selesai");
  if (!isValidDate(start) || !isValidDate(end)) fail(back, "Format tanggal tidak valid.");
  if (end < start) fail(back, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (diffDays(start, end) > 92) fail(back, "Rentang periode maksimal 93 hari.");

  const { data, error } = await supabase
    .from("schedule_periods")
    .insert({
      name,
      start_date: start,
      end_date: end,
      team_id: str(formData, "team_id"),
      site_id: str(formData, "site_id"),
      notes: str(formData, "notes"),
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));

  revalidatePath(back);
  done(`/kelola/${data.id}`, `Periode "${name}" dibuat (${dateRange(start, end).length} hari). Silakan isi jadwal.`);
}
