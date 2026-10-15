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

  // RLS profiles hanya mensyaratkan user.manage; cegah mengubah user dengan role lebih tinggi.
  if (userId !== auth.userId) {
    const [{ data: theirRoles }, { data: myRank }] = await Promise.all([
      supabase.from("user_roles").select("roles(rank)").eq("user_id", userId),
      supabase.rpc("my_max_rank"),
    ]);
    const theirRank = Math.max(0, ...((theirRoles ?? []) as unknown as { roles: { rank: number } | null }[]).map((r) => r.roles?.rank ?? 0));
    if (theirRank > ((myRank as number | null) ?? 0)) fail(back, "Anda tidak bisa mengubah user dengan role lebih tinggi dari role Anda.");
  }

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

// ---------------------------------------------------------------------------
// Hapus user (edge function delete-user memakai service role)
// ---------------------------------------------------------------------------
const BLOCKER_LABEL: Record<string, string> = {
  "handovers.outgoing_by": "handover",
  "handover_members.user_id": "keanggotaan handover",
  "incident_updates.created_by": "update incident",
  "permits.requested_by": "izin site",
  "permit_approvals.approver_id": "approval izin",
  "projects.owner_id": "project",
  "progress_updates.reported_by": "laporan progres",
  "comments.author_id": "komentar",
  "announcements.created_by": "pengumuman",
  "schedule_periods.created_by": "periode jadwal",
  "schedule_shares.created_by": "link jadwal",
  "directory_shares.created_by": "link daftar anggota",
};

export async function deleteUser(formData: FormData) {
  const back = backOf(formData);
  const { supabase, auth } = await actionContext(back, "user.manage");
  const userId = req(formData, "user_id", back);
  if (userId === auth.userId) fail(back, "Anda tidak bisa menghapus akun sendiri.");

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; name?: string }>("delete-user", { body: { user_id: userId } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const payload = (ctx ? await ctx.json().catch(() => null) : null) as { error?: string; blockers?: Record<string, number> } | null;
    if (payload?.blockers) {
      const list = Object.entries(payload.blockers)
        .map(([k, n]) => `${n} ${BLOCKER_LABEL[k] ?? k}`)
        .join(", ");
      fail(back, `User tidak bisa dihapus karena masih tercatat di riwayat (${list}). Nonaktifkan akunnya saja agar riwayat tetap utuh.`);
    }
    fail(back, payload?.error ?? "Gagal menghapus user.");
  }
  revalidatePath("/admin/users");
  done("/admin/users", `${data?.name ?? "User"} telah dihapus.`);
}
