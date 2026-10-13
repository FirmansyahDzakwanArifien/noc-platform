import { supabaseEnv } from "@noc/supabase/env";

// Dipanggil berkala (pg_cron di Supabase) agar fungsi server tetap "hangat" → tidak ada cold start saat pindah app.
// Sekalian membuka koneksi ke Supabase dan memuat kode halaman utama (tanpa sesi → hanya redirect ke login).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { url, key } = supabaseEnv();
  const t = Date.now();
  const [health, home] = await Promise.all([
    fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" }).catch(() => null),
    fetch(new URL("/", request.url), { headers: { "x-noc-warm": "1" }, redirect: "manual", cache: "no-store" }).catch(() => null),
  ]);
  return new Response(`ok ${health?.status ?? "-"} ${home?.status ?? "-"} ${Date.now() - t}ms`, {
    headers: { "cache-control": "no-store" },
  });
}
