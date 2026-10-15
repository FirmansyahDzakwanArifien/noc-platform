"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, req, str } from "@noc/supabase/actions";

const back = "/admin/users/bagikan";

/** Buat link publik daftar anggota tim. */
export async function createDirectoryShare(formData: FormData) {
  const { supabase, auth } = await actionContext(back, "user.manage");
  const validity = str(formData, "validity");
  const expires = validity && /^\d+$/.test(validity) ? new Date(Date.now() + Number(validity) * 86_400_000).toISOString() : null;

  const { data, error } = await supabase
    .from("directory_shares")
    .insert({
      title: req(formData, "title", back, "Judul"),
      team_id: str(formData, "team_id"),
      show_email: bool(formData, "show_email"),
      show_phone: bool(formData, "show_phone"),
      expires_at: expires,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));
  revalidatePath(back);
  done(`${back}?baru=${data.id}`, "Link dibuat. Siapa pun yang punya link bisa melihat daftar anggota tanpa login.");
}

export async function revokeDirectoryShare(formData: FormData) {
  const { supabase } = await actionContext(back, "user.manage");
  const { error } = await supabase
    .from("directory_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Link dinonaktifkan.");
}

export async function deleteDirectoryShare(formData: FormData) {
  const { supabase } = await actionContext(back, "user.manage");
  const { error } = await supabase.from("directory_shares").delete().eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Link dihapus.");
}
