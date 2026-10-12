"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, str } from "@noc/supabase/actions";
import { TASK_STATUSES, oneOf } from "@/lib/constants";
import { isUuid, safeBack } from "@/lib/data";

/**
 * Update cepat status + progress task. Dipakai di detail project dan Tugas Saya.
 * RLS: editor project atau assignee task.
 */
export async function quickUpdateTask(formData: FormData) {
  const back = safeBack(str(formData, "back"));
  const { supabase } = await actionContext(back, "project.view");
  const id = str(formData, "task_id");
  if (!isUuid(id)) fail(back, "Task tidak valid.");

  let status = oneOf(str(formData, "status"), TASK_STATUSES);
  if (!status) fail(back, "Status tidak valid.");
  let progress = num(formData, "progress_pct");
  if (progress !== null && (progress < 0 || progress > 100)) fail(back, "Progress harus 0–100.");

  // Pilih "Selesai" → 100%. Isi 100% pada task yang belum selesai → otomatis "Selesai"
  // (kecuali user sengaja membuka kembali task yang sebelumnya selesai).
  if (status === "done") progress = 100;
  else if (progress === 100 && str(formData, "prev_status") !== "done") status = "done";

  const patch: Record<string, unknown> = { status };
  if (status !== "done") patch.completed_at = null;
  else if (str(formData, "prev_status") !== "done") patch.completed_at = new Date().toISOString();
  if (progress !== null) patch.progress_pct = progress;

  const { data, error } = await supabase.from("project_tasks").update(patch).eq("id", id).select("id, project_id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, "Anda tidak memiliki izin untuk mengubah task ini.");

  revalidatePath("/", "layout");
  done(back, "Task diperbarui.");
}
