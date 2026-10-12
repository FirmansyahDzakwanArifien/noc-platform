# NOC Platform

Kumpulan aplikasi internal NOC dalam satu monorepo:

| App | Port dev | Isi |
|---|---|---|
| `apps/portal` | 3000 | Login/daftar, dashboard, pengumuman, notifikasi, profil, admin (user & role, allowlist email, master data, audit log) |
| `apps/jadwal` | 3001 | Jadwal saya, kalender tim, kelola & publish roster, isi pola rotasi |
| `apps/handover` | 3002 | Serah terima shift, item terbuka & carry-over, checklist rutin, incident |
| `apps/perizinan` | 3003 | Izin kerja/akses site, approval berjenjang, check-in/out, cuti & tukar shift |
| `apps/perkembangan` | 3004 | Project, milestone, task, laporan progress |

Akses berbasis role (RBAC) yang ditegakkan di database (RLS). Pendaftaran akun hanya untuk `@corp.jarvis.biz.id`, `@jarvis.biz.id`, dan email yang di-allowlist.

Stack: Next.js 15 · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Turborepo · Vercel / Cloudflare.

## Mulai

```bash
npm install
cp .env.example .env.local   # isi NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # jalankan semua app
npm run build                # build semua app
```

## Dokumen

- [docs/SCHEMA.md](docs/SCHEMA.md) — skema database, RBAC, alur tiap modul
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — pola kode
- [docs/DEPLOY.md](docs/DEPLOY.md) — setup Supabase, Vercel, Cloudflare
- [supabase/migrations](supabase/migrations) — migration SQL

## Catatan / pekerjaan lanjutan

- Aturan alur handover (siapa boleh submit/terima, transisi status) baru ditegakkan di aplikasi; RLS hanya mengecek `handover.create`.
- Simpan jadwal di editor tidak atomik (beberapa request); RPC transaksional bisa ditambahkan.
- Progress subtask belum digulung ke task induknya; menghapus laporan progress tidak mengembalikan % task.
- Belum ada form edit lengkap task (judul/assignee/tanggal) — baru status & progress.
- Tipe TypeScript tabel ditulis manual (`packages/supabase/src/types.ts`); ganti dengan `supabase gen types` setelah database tersambung.
