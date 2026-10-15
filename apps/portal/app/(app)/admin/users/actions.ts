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

// ---------------------------------------------------------------------------
// Undangan via email (edge function invite-user memakai service role)
// ---------------------------------------------------------------------------
const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function callInvite(supabase: Awaited<ReturnType<typeof actionContext>>["supabase"], body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; warning?: string; error?: string }>("invite-user", {
    body: { ...body, redirect_to: `${PORTAL_URL}/undangan` },
  });
  if (error) {
    // FunctionsHttpError: pesan ada di body respons.
    const ctx = (error as { context?: Response }).context;
    const payload = ctx ? await ctx.json().catch(() => null) : null;
    return { error: (payload as { error?: string } | null)?.error ?? "Gagal menghubungi layanan undangan." };
  }
  return { warning: data?.warning };
}

export async function inviteUser(formData: FormData) {
  const back = "/admin/users/undang";
  const { supabase } = await actionContext(back, "user.manage");
  const email = req(formData, "email", back, "Email").toLowerCase();
  const res = await callInvite(supabase, {
    email,
    full_name: str(formData, "full_name"),
    role_id: req(formData, "role_id", back, "Role"),
    team_id: str(formData, "team_id"),
  });
  if (res.error) fail(back, res.error);
  revalidatePath("/admin/users");
  done("/admin/users?status=menunggu", res.warning ?? `Undangan terkirim ke ${email}.`);
}

export async function resendInvite(formData: FormData) {
  const back = backOf(formData);
  const { supabase } = await actionContext(back, "user.manage");
  const email = req(formData, "email", back, "Email");
  const res = await callInvite(supabase, { email, resend: true });
  if (res.error) fail(back, res.error);
  done(back, `Undangan dikirim ulang ke ${email}.`);
}
