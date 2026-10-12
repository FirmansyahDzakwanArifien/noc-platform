import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { PermitType, Site, Vendor } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Flash,
  Forbidden,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Textarea,
  toDateTimeInput,
} from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { PERMIT_TYPE_HINTS, PERMIT_TYPES, RISK_LEVELS, ROW_COUNT } from "@/lib/labels";
import type { SearchParams } from "@/lib/util";
import { saveDraft, submitPermit } from "./actions";

export const metadata = { title: "Ajukan Izin" };

export default async function NewPermitPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("permit.create")) return <Forbidden />;
  const supabase = await createClient();

  const [sites, vendors, profiles] = await Promise.all([
    supabase.from("sites").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).is("vendor_id", null).order("full_name"),
  ]);
  const siteRows = (sites.data ?? []) as Pick<Site, "id" | "code" | "name">[];
  const vendorRows = (vendors.data ?? []) as Pick<Vendor, "id" | "name">[];
  const profileRows = (profiles.data ?? []) as { id: string; full_name: string }[];
  const myVendor = auth.profile?.vendor_id ?? "";

  const now = new Date();
  const start = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const end = new Date(start.getTime() + 4 * 3_600_000);

  return (
    <div>
      <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Daftar izin
      </Link>
      <PageHeader
        title="Ajukan Izin Kerja / Akses Site"
        description="Isi data izin, lalu ajukan agar diproses persetujuannya. Semua waktu dalam WIB."
      />
      <Flash searchParams={sp} />

      <form action={saveDraft} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Informasi izin</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Jenis izin"
              required
              className="sm:col-span-2"
              hint={
                <span className="grid gap-0.5 sm:grid-cols-2 sm:gap-x-6">
                  {(Object.entries(PERMIT_TYPE_HINTS) as [PermitType, string][]).map(([k, v]) => (
                    <span key={k}>
                      <b className="font-medium text-slate-600">{PERMIT_TYPES[k]}:</b> {v}
                    </span>
                  ))}
                </span>
              }
            >
              <Select name="permit_type" required defaultValue="akses_site" className="sm:max-w-sm">
                {Object.entries(PERMIT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Judul" required hint="Singkat dan spesifik, agar mudah dikenali approver.">
              <Input name="title" required maxLength={200} placeholder="mis. Penggantian modul optik router core" />
            </Field>
            <Field label="Site / lokasi" required>
              <Select name="site_id" required defaultValue={siteRows.length === 1 ? siteRows[0].id : ""}>
                <option value="" disabled>
                  Pilih site…
                </option>
                {siteRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tujuan / lingkup pekerjaan" required className="sm:col-span-2">
              <Textarea name="purpose" required rows={3} placeholder="Apa yang akan dikerjakan, di perangkat/ruang mana." />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Jadwal & penanggung jawab</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Mulai (WIB)" required>
              <Input type="datetime-local" name="start_at" required defaultValue={toDateTimeInput(start)} />
            </Field>
            <Field label="Selesai (WIB)" required hint="Harus setelah waktu mulai.">
              <Input type="datetime-local" name="end_at" required defaultValue={toDateTimeInput(end)} />
            </Field>
            <Field label="Vendor" hint="Pilih “Internal” bila dikerjakan tim sendiri.">
              <Select name="vendor_id" defaultValue={myVendor}>
                <option value="">Internal (tanpa vendor)</option>
                {vendorRows.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIC internal" hint="Staf NOC yang mendampingi di lokasi. Boleh ditentukan nanti.">
              <Select name="pic_internal" defaultValue="">
                <option value="">Belum ditentukan</option>
                {profileRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Risiko & dampak</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tingkat risiko"
              required
              className="sm:col-span-2"
              hint="Rendah: tidak berdampak ke layanan · Sedang: mungkin ada gangguan singkat · Tinggi: dapat mengganggu layanan pelanggan · Kritis: menyentuh perangkat inti / berisiko gangguan luas."
            >
              <Select name="risk_level" required defaultValue="low" className="sm:max-w-xs">
                {Object.entries(RISK_LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dampak ke layanan" hint="Layanan/pelanggan yang terdampak dan perkiraan durasinya. Tulis “Tidak ada” bila tidak berdampak.">
              <Textarea name="impact" rows={3} />
            </Field>
            <Field label="Rencana rollback" hint="Langkah mengembalikan kondisi semula bila pekerjaan gagal. Wajib untuk Change Request.">
              <Textarea name="rollback_plan" rows={3} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Personel yang masuk</CardTitle>
            <span className="text-xs text-slate-500">Baris tanpa nama diabaikan.</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <div key={i} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-5">
                <p className="text-xs font-medium text-slate-500 sm:hidden">Personel {i + 1}</p>
                <Input name={`p_full_name_${i}`} placeholder="Nama lengkap" aria-label={`Nama personel ${i + 1}`} />
                <Input name={`p_id_number_${i}`} placeholder="No. KTP / ID" aria-label={`No. ID personel ${i + 1}`} />
                <Input name={`p_company_${i}`} placeholder="Perusahaan" aria-label={`Perusahaan personel ${i + 1}`} />
                <Input name={`p_phone_${i}`} type="tel" placeholder="No. HP" aria-label={`No. HP personel ${i + 1}`} />
                <Input name={`p_role_${i}`} placeholder="Peran (teknisi, dll)" aria-label={`Peran personel ${i + 1}`} />
              </div>
            ))}
            <p className="text-xs text-slate-500">Butuh lebih banyak? Tambahkan di halaman detail selama izin masih draft.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Barang / perangkat (opsional)</CardTitle>
            <span className="text-xs text-slate-500">Isi bila membawa barang masuk/keluar lokasi.</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <div key={i} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[8rem_1fr_1fr_1fr_6rem]">
                <p className="text-xs font-medium text-slate-500 sm:hidden">Barang {i + 1}</p>
                <Select name={`i_direction_${i}`} defaultValue="masuk" aria-label={`Arah barang ${i + 1}`}>
                  <option value="masuk">Masuk</option>
                  <option value="keluar">Keluar</option>
                </Select>
                <Input name={`i_name_${i}`} placeholder="Nama barang" aria-label={`Nama barang ${i + 1}`} />
                <Input name={`i_brand_model_${i}`} placeholder="Merk / model" aria-label={`Merk barang ${i + 1}`} />
                <Input name={`i_serial_number_${i}`} placeholder="Nomor seri" aria-label={`Nomor seri barang ${i + 1}`} />
                <Input type="number" min={1} name={`i_qty_${i}`} placeholder="Jumlah" defaultValue={1} aria-label={`Jumlah barang ${i + 1}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            <b className="font-medium text-slate-600">Simpan draft</b> bila data belum lengkap (belum diproses siapa pun).{" "}
            <b className="font-medium text-slate-600">Ajukan</b> untuk meneruskan ke pengelola izin.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/" className={buttonClass("ghost")}>
              Batal
            </Link>
            <SubmitButton variant="secondary">Simpan draft</SubmitButton>
            <SubmitButton formAction={submitPermit} pendingText="Mengajukan…">
              Ajukan
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
