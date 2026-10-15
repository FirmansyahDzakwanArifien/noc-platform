"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, req, str } from "@noc/supabase/actions";

const back = "/admin/divisi";

export async function saveDivision(formData: FormData) {
  const { supabase } = await actionContext(back, "settings.manage");
  const id = str(formData, "id");
  const code = req(formData, "code", back, "Kode").toUpperCase();
  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) fail(back, "Kode 2–12 karakter: huruf, angka, - atau _.");
  const row = { code, name: req(formData, "name", back, "Nama"), description: str(formData, "description") };
  const { error } = id ? await supabase.from("divisions").update(row).eq("id", id) : await supabase.from("divisions").insert(row);
  if (error) fail(id ? `${back}?edit=${id}` : back, dbError(error));
  revalidatePath(back);
  done(back, id ? "Divisi diperbarui." : `Divisi ${code} ditambahkan.`);
}

export async function setIsolation(formData: FormData) {
  const { supabase, auth } = await actionContext(back, "settings.manage");
  const isolated = bool(formData, "isolated");
  const { error } = await supabase
    .from("app_settings")
    .update({ value: isolated, updated_by: auth.userId, updated_at: new Date().toISOString() })
    .eq("key", "division_isolation");
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(
    back,
    isolated
      ? "Data antar divisi sekarang dipisah. Staff hanya melihat data divisinya + data umum."
      : "Data antar divisi sekarang digabung. Semua divisi saling melihat.",
  );
}
