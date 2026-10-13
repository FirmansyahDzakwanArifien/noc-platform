-- =============================================================================
-- Keep-warm: ping /api/warm tiap app setiap 4 menit agar fungsi Vercel tidak cold start
-- (pindah antar app tetap cepat walau app itu sedang jarang dipakai).
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'noc-keep-warm',
  '*/4 * * * *',
  $$
  select net.http_get(url := u, timeout_milliseconds := 10000)
    from unnest(array[
      'https://noc-app.cyphera.my.id/api/warm',
      'https://jadwal.noc-app.cyphera.my.id/api/warm',
      'https://handover.noc-app.cyphera.my.id/api/warm',
      'https://izin.noc-app.cyphera.my.id/api/warm',
      'https://progress.noc-app.cyphera.my.id/api/warm'
    ]) as u;
  $$
);
