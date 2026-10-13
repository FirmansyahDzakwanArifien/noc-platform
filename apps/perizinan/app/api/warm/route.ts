import { supabaseEnv } from "@noc/supabase/env";

// Dipanggil berkala (pg_cron di Supabase) agar fungsi server tetap "hangat" → tidak ada cold start saat pindah app.
// Sekalian membuka koneksi ke Supabase (dipakai ulang oleh request berikutnya).
export const dynamic = "force-dynamic";

export async function GET() {
  const { url, key } = supabaseEnv();
  const t = Date.now();
  const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" }).catch(() => null);
  return new Response(`ok ${res?.status ?? "-"} ${Date.now() - t}ms`, { headers: { "cache-control": "no-store" } });
}
