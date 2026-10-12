"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext, dbError, fail, req, str } from "@noc/supabase/actions";
import { PRIORITIES, oneOf } from "@/lib/constants";
import { isDateStr, isUuid } from "@/lib/data";

export async function createProject(formData: FormData) {
  const back = "/baru";
  const { supabase, auth } = await actionContext(back, "project.create");

  const name = req(formData, "name", back, "Nama project");
  const priority = oneOf(str(formData, "priority"), PRIORITIES) ?? "medium";
  const siteId = str(formData, "site_id");
  const start = str(formData, "start_date");
  const target = str(formData, "target_date");
  if ((start && !isDateStr(start)) || (target && !isDateStr(target))) fail(back, "Format tanggal tidak valid.");
  if (start && target && target < start) fail(back, "Target selesai tidak boleh sebelum tanggal mulai.");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      description: str(formData, "description"),
      category: str(formData, "category"),
      site_id: isUuid(siteId) ? siteId : null,
      priority,
      start_date: start,
      target_date: target,
      owner_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));

  // Pembuat otomatis menjadi lead project.
  const { error: memberError } = await supabase
    .from("project_members")
    .insert({ project_id: data.id, user_id: auth.userId, role: "lead" });

  revalidatePath("/");
  const msg = memberError ? "Project dibuat, tetapi gagal menambahkan Anda sebagai ketua project." : "Project dibuat.";
  redirect(`/${data.id}?${new URLSearchParams({ [memberError ? "error" : "success"]: msg })}`);
}
