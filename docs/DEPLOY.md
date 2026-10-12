# Deploy

## 1. Supabase

1. Buat project baru (region `ap-southeast-1` Singapore paling dekat).
2. Jalankan migration:
   - via CLI: `npx supabase link --project-ref <ref>` lalu `npx supabase db push`, atau
   - salin isi `supabase/migrations/*.sql` ke SQL Editor lalu Run.
3. **Authentication → Hooks → Before User Created** → aktifkan, pilih Postgres function `public.hook_before_user_created`.
4. **Authentication → URL Configuration**
   - Site URL: URL portal, mis. `https://noc-app.cyphera.my.id`
   - Redirect URLs: `https://noc-app.cyphera.my.id/auth/callback` (+ `http://localhost:3000/auth/callback` untuk dev)
5. (Opsional) **Authentication → Providers → Google** untuk tombol "Masuk dengan Google". Allowlist email tetap berlaku.
6. Daftar dengan `dzakwan.corp@gmail.com` → otomatis menjadi admin.
7. Ambil URL & publishable key dari **Project Settings → API**.

## 2. Vercel (disarankan)

Buat **5 project Vercel** dari repo yang sama, masing-masing:

| Project | Root Directory | Domain contoh |
|---|---|---|
| noc-portal | `apps/portal` | `noc-app.cyphera.my.id` |
| noc-jadwal | `apps/jadwal` | `jadwal.noc-app.cyphera.my.id` |
| noc-handover | `apps/handover` | `handover.noc-app.cyphera.my.id` |
| noc-perizinan | `apps/perizinan` | `izin.noc-app.cyphera.my.id` |
| noc-perkembangan | `apps/perkembangan` | `progress.noc-app.cyphera.my.id` |

Project di atas sudah dibuat di tim Vercel `cyphera`. DNS dikelola di Cloudflare: CNAME tiap host ke target `*.vercel-dns-017.com` dari Vercel, **Proxy status: DNS only** (Universal SSL Cloudflare tidak mencakup subdomain tingkat dua seperti `jadwal.noc-app.cyphera.my.id`).

Framework preset: Next.js (otomatis). Install/build command default — Vercel mendeteksi npm workspaces dan Turborepo; aktifkan "Skip deployment when there are no changes" agar hanya app yang berubah yang di-build.

Environment variables (sama untuk kelima project):

```
NEXT_PUBLIC_SUPABASE_URL=https://glsdpnxckibzhyahqxxj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_COOKIE_DOMAIN=.noc-app.cyphera.my.id
NEXT_PUBLIC_PORTAL_URL=https://noc-app.cyphera.my.id
NEXT_PUBLIC_JADWAL_URL=https://jadwal.noc-app.cyphera.my.id
NEXT_PUBLIC_HANDOVER_URL=https://handover.noc-app.cyphera.my.id
NEXT_PUBLIC_PERIZINAN_URL=https://izin.noc-app.cyphera.my.id
NEXT_PUBLIC_PERKEMBANGAN_URL=https://progress.noc-app.cyphera.my.id
```

`NEXT_PUBLIC_COOKIE_DOMAIN` wajib diisi di production agar sekali login berlaku di semua subdomain. Semua app harus berada di bawah domain yang sama — domain bawaan `*.vercel.app` **tidak** bisa berbagi cookie.

## 3. Cloudflare (alternatif)

Pakai adapter OpenNext: `npm i -D @opennextjs/cloudflare wrangler` di tiap app, tambahkan `wrangler.jsonc` + `open-next.config.ts`, lalu `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`. Environment variable sama seperti di atas. Belum disiapkan di repo ini.

## 4. Development lokal

```bash
npm install
cp .env.example .env.local    # isi URL & key Supabase
npm run dev                   # portal :3000, jadwal :3001, handover :3002, perizinan :3003, perkembangan :3004
```

Di localhost semua port berbagi cookie, jadi login sekali di `http://localhost:3000` berlaku untuk semua app.
