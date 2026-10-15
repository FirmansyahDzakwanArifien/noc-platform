// Hapus user secara permanen (akun Auth + profil, role, jadwal, notifikasi, penilaian).
// Dipanggil dari portal (server action) dengan JWT pemanggil; butuh permission user.manage.
// User yang masih tercatat di riwayat wajib (handover, izin, project, dst.) ditolak: nonaktifkan saja.
// Body: { user_id }
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Tidak terautentikasi." }, 401);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: "Sesi tidak valid, silakan masuk ulang." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body tidak valid." }, 400);
  }
  const userId = String(body.user_id ?? "");
  if (!UUID_RE.test(userId)) return json({ error: "User tidak valid." }, 400);
  if (userId === who.user.id) return json({ error: "Anda tidak bisa menghapus akun sendiri." }, 400);

  const [{ data: canManage }, { data: myRank }, { data: theirRank }] = await Promise.all([
    caller.rpc("has_permission", { p_perm: "user.manage" }),
    caller.rpc("my_max_rank"),
    caller.rpc("user_max_rank", { p_user: userId }),
  ]);
  if (!canManage) return json({ error: "Anda tidak memiliki izin untuk menghapus user." }, 403);
  if (((theirRank as number | null) ?? 0) > ((myRank as number | null) ?? 0)) {
    return json({ error: "Anda tidak bisa menghapus user dengan role lebih tinggi dari role Anda." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  if (!prof) return json({ error: "User tidak ditemukan." }, 404);

  const { data: blockers, error: blkErr } = await caller.rpc("user_delete_blockers", { p_user: userId });
  if (blkErr) return json({ error: blkErr.message }, 400);
  if (blockers && Object.keys(blockers as Record<string, number>).length > 0) return json({ error: "Masih punya riwayat.", blockers }, 409);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 400);

  // Email tidak lagi otomatis diizinkan mendaftar ulang.
  if (prof.email) await admin.from("allowed_signup_emails").delete().eq("email", prof.email.toLowerCase());

  return json({ ok: true, name: prof.full_name });
});
