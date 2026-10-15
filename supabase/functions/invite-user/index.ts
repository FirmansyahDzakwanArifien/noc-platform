// Undang user baru lewat email (Supabase Auth "Invite user").
// Dipanggil dari portal (server action) dengan JWT pemanggil; butuh permission user.manage.
// Body: { email, full_name?, role_id, team_id?, redirect_to }  atau  { email, resend: true, redirect_to }
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_REDIRECT = /^https:\/\/([a-z0-9-]+\.)*noc-app\.cyphera\.my\.id\/|^http:\/\/localhost:\d+\//;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Tidak terautentikasi." }, 401);

  // Klien atas nama pemanggil (RLS & auth.uid() berlaku).
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: "Sesi tidak valid, silakan masuk ulang." }, 401);

  const [{ data: canManage }, { data: myRank }] = await Promise.all([
    caller.rpc("has_permission", { p_perm: "user.manage" }),
    caller.rpc("my_max_rank"),
  ]);
  if (!canManage) return json({ error: "Anda tidak memiliki izin untuk mengundang user." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body tidak valid." }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const redirectTo = String(body.redirect_to ?? "");
  if (!EMAIL_RE.test(email)) return json({ error: "Format email tidak valid." }, 400);
  if (!ALLOWED_REDIRECT.test(redirectTo)) return json({ error: "Redirect tidak diizinkan." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- Kirim ulang undangan ----
  if (body.resend === true) {
    const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!prof) return json({ error: "User tidak ditemukan." }, 404);
    const { data: u } = await admin.auth.admin.getUserById(prof.id);
    if (u.user?.last_sign_in_at) return json({ error: "User ini sudah pernah masuk, undangan tidak perlu dikirim ulang." }, 409);
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, resent: true });
  }

  // ---- Undangan baru ----
  const fullName = String(body.full_name ?? "").trim().slice(0, 120);
  const roleId = String(body.role_id ?? "");
  const teamId = body.team_id ? String(body.team_id) : null;

  const { data: role } = await admin.from("roles").select("id, key, rank").eq("id", roleId).maybeSingle();
  if (!role) return json({ error: "Role tidak valid." }, 400);
  if (role.rank > ((myRank as number | null) ?? 0)) return json({ error: "Anda tidak bisa memberi role di atas role Anda." }, 403);
  if (teamId) {
    const { data: team } = await admin.from("teams").select("id").eq("id", teamId).maybeSingle();
    if (!team) return json({ error: "Tim tidak valid." }, 400);
  }

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return json({ error: "Email ini sudah terdaftar." }, 409);

  // Email di luar domain yang diizinkan → masukkan ke allowlist agar lolos pembatasan pendaftaran.
  const { data: allowed } = await admin.rpc("is_email_allowed", { p_email: email });
  if (!allowed) {
    const { error } = await admin
      .from("allowed_signup_emails")
      .insert({ email, default_role: role.key, note: `Diundang oleh ${who.user.email}` });
    if (error) return json({ error: `Gagal menambahkan ke allowlist: ${error.message}` }, 400);
  }

  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (invErr || !invited.user) {
    if (!allowed) await admin.from("allowed_signup_emails").delete().eq("email", email);
    return json({ error: invErr?.message ?? "Gagal mengirim undangan." }, 400);
  }

  // Role & tim sesuai pilihan pengundang (menggantikan role default dari trigger).
  const uid = invited.user.id;
  await admin.from("user_roles").delete().eq("user_id", uid);
  const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role_id: role.id, assigned_by: who.user.id });
  if (teamId) await admin.from("profiles").update({ team_id: teamId }).eq("id", uid);
  if (roleErr) return json({ ok: true, warning: `Undangan terkirim, tetapi role gagal diset: ${roleErr.message}` });

  return json({ ok: true, user_id: uid });
});
