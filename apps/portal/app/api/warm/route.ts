// Dipanggil berkala (pg_cron di Supabase) agar fungsi server tetap "hangat" → tidak ada cold start saat pindah app.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
