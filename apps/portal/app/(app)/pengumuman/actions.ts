"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";

const back = "/pengumuman";
const wib = (v: string | null) => (v ? `${v}:00+07:00` : null);

/** Buat (tanpa id) atau ubah (dengan id) pengumuman. */
export async function saveAnnouncement(formData: FormData) {
  const id = str(formData, "id");
  const self = id ? `${back}?edit=${id}` : back;
  const { supabase, auth } = await actionContext(self, "announcement.manage");
  const publish = wib(str(formData, "publish_at"));
  const expire = wib(str(formData, "expire_at"));
  if (publish && expire && expire <= publish) fail(self, "Waktu berakhir harus setelah waktu tayang.");

  const values = {
    title: req(formData, "title", self, "Judul"),
    body: req(formData, "body", self, "Isi"),
    priority: str(formData, "priority") ?? "low",
    division_id: str(formData, "division_id"),
    expire_at: expire,
    ...(publish ? { publish_at: publish } : id ? {} : { publish_at: new Date().toISOString() }),
  };
  const { error } = id
    ? await supabase.from("announcements").update(values).eq("id", id)
    : await supabase.from("announcements").insert({ ...values, created_by: auth.userId });
  if (error) fail(self, dbError(error));
  revalidatePath("/", "layout");
  done(back, id ? "Pengumuman diperbarui." : "Pengumuman dipublikasikan.");
}

export async function deleteAnnouncement(formData: FormData) {
  const { supabase } = await actionContext(back, "announcement.manage");
  const { error } = await supabase.from("announcements").delete().eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath("/", "layout");
  done(back, "Pengumuman dihapus.");
}
