"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext, dbError, fail, req } from "@noc/supabase/actions";

const back = "/admin/roles";

export async function togglePermission(formData: FormData) {
  const { supabase } = await actionContext(back, "role.manage");
  const roleId = req(formData, "role_id", back);
  const permissionKey = req(formData, "permission_key", back);
  const on = req(formData, "on", back) === "1";

  // Jangan sampai admin mencabut role.manage dari role admin (terkunci di luar).
  if (on && permissionKey === "role.manage") {
    const { data: role } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
    if (role?.key === "admin") fail(back, "Permission role.manage tidak boleh dicabut dari admin.");
  }

  const { error } = on
    ? await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permissionKey)
    : await supabase.from("role_permissions").insert({ role_id: roleId, permission_key: permissionKey });
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  // Bersihkan ?error= lama dari URL agar pesan gagal sebelumnya tidak terus tampil.
  redirect(back);
}
