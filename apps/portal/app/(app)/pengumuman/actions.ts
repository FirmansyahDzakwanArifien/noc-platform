"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";

const back = "/pengumuman";

export async function createAnnouncement(formData: FormData) {
  const { supabase, auth } = await actionContext(back, "announcement.manage");
  const expire = str(formData, "expire_at");
  const { error } = await supabase.from("announcements").insert({
    title: req(formData, "title", back, "Judul"),
    body: req(formData, "body", back, "Isi"),
    priority: str(formData, "priority") ?? "low",
    expire_at: expire ? `${expire}:00+07:00` : null,
    created_by: auth.userId,
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/", "layout");
  done(back, "Pengumuman dipublikasikan.");
}

export async function deleteAnnouncement(formData: FormData) {
  const { supabase } = await actionContext(back, "announcement.manage");
  const { error } = await supabase.from("announcements").delete().eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath("/", "layout");
  done(back, "Pengumuman dihapus.");
}
