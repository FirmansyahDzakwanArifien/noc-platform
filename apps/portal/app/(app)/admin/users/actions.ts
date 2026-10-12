"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, req, str } from "@noc/supabase/actions";

function backOf(formData: FormData) {
  const b = str(formData, "back");
  return b && b.startsWith("/admin/users") ? b : "/admin/users";
}

export async function updateUser(formData: FormData) {
  const back = backOf(formData);
  const { supabase, auth } = await actionContext(back, "user.manage");
  const userId = req(formData, "user_id", back);
  const isActive = bool(formData, "is_active");
  if (userId === auth.userId && !isActive) fail(back, "Anda tidak bisa menonaktifkan akun sendiri.");

  const { error } = await supabase
    .from("profiles")
    .update({ team_id: str(formData, "team_id"), is_active: isActive })
    .eq("id", userId);
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/users");
  done(back, "Data user tersimpan.");
}

export async function addRole(formData: FormData) {
  const back = backOf(formData);
  const { supabase, auth } = await actionContext(back, "user.manage");
  const { error } = await supabase.from("user_roles").insert({
    user_id: req(formData, "user_id", back),
    role_id: req(formData, "role_id", back, "Role"),
    assigned_by: auth.userId,
  });
  if (error) fail(back, dbError(error));
  revalidatePath("/admin/users");
  done(back, "Role ditambahkan.");
}

export async function removeRole(formData: FormData) {
  const back = backOf(formData);
  const { supabase, auth } = await actionContext(back, "user.manage");
  const userId = req(formData, "user_id", back);
  const roleId = req(formData, "role_id", back);

  // Cegah admin mencabut role admin miliknya sendiri (bisa terkunci di luar).
  if (userId === auth.userId) {
    const { data: role } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
    if (role?.key === "admin") fail(back, "Anda tidak bisa mencabut role admin milik sendiri.");
  }

  const { data, error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleId)
    .select("role_id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, "Role tidak bisa dicabut (rank role lebih tinggi dari milik Anda).");
  revalidatePath("/admin/users");
  done(back, "Role dicabut.");
}
