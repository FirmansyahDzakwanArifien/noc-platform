# Konvensi Kode

## Struktur app

```
apps/<app>/
├── app/
│   ├── layout.tsx            # root <html>, sudah ada (force-dynamic)
│   ├── globals.css           # tailwind + theme bersama, sudah ada
│   ├── auth/signout/route.ts # sudah ada
│   └── (app)/
│       ├── layout.tsx        # requireAuth() + <AppShell app="..." nav={...}>
│       ├── page.tsx
│       └── <fitur>/
│           ├── page.tsx      # Server Component: ambil data via Supabase
│           └── actions.ts    # "use server" — semua mutasi
├── middleware.ts             # sudah ada — refresh session, redirect ke login portal
└── next.config.mjs           # sudah ada — membaca .env.local di root repo
```

## Aturan

- **Data dibaca di Server Component** dengan `const supabase = await createClient()` dari `@noc/supabase/server`. RLS di database adalah penegak akses yang utama.
- **Cek permission di UI** dengan `const auth = await requireAuth()` lalu `auth.can("schedule.manage")`. Sembunyikan tombol/halaman yang tidak boleh diakses; tampilkan `<Forbidden />` jika halaman dibuka langsung.
- **Mutasi lewat Server Action** (`actions.ts` dengan `"use server"`), pola:

  ```ts
  "use server";
  import { revalidatePath } from "next/cache";
  import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";

  export async function createThing(formData: FormData) {
    const back = "/things";
    const { supabase, auth } = await actionContext(back, "thing.create");
    const name = req(formData, "name", back, "Nama");
    const { error } = await supabase.from("things").insert({ name, created_by: auth.userId });
    if (error) fail(back, dbError(error));
    revalidatePath(back);
    done(back, "Data tersimpan.");
  }
  ```

  `fail()` / `done()` melakukan `redirect()` dengan `?error=` / `?success=`. **Jangan panggil di dalam `try/catch`** (redirect dilempar sebagai exception).
- Tampilkan pesan di halaman dengan `<Flash searchParams={await searchParams} />`.
- Form memakai `<form action={serverAction}>` + `<SubmitButton>`. Komponen client (`"use client"`) hanya bila benar-benar perlu interaktivitas.
- Next.js 15: `params` dan `searchParams` adalah **Promise** → `await`.
- Komponen UI dari `@noc/ui`: `Button, buttonClass, SubmitButton, Input, Textarea, Select, Label, Field, Card*, Badge, StatusBadge, Table/THead/TBody/TR/TH/TD, PageHeader, EmptyState, Forbidden, Alert, Flash, ProgressBar, formatDate, formatDateTime, formatTime, toDateInput, toDateTimeInput`.
- Ikon dari `lucide-react`.
- Tipe baris tabel ada di `@noc/supabase/types`. URL app lain: `appUrl("perizinan")` dari `@noc/supabase/apps`.
- Teks UI bahasa Indonesia. Tanggal/jam zona Asia/Jakarta.
- Layout harus rapi di layar HP (lebar 360px): tabel dibungkus `<Table>` (scroll horizontal), grid form `sm:grid-cols-2`.

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi kredensial Supabase
npm run dev                  # semua app: portal :3000, jadwal :3001, handover :3002, perizinan :3003, perkembangan :3004
npx turbo build --filter=@noc/jadwal   # build satu app
```
