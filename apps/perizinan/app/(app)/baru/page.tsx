import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Site, Vendor } from "@noc/supabase/types";
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
import { PERMIT_TYPES, RISK_LEVELS, ROW_COUNT } from "@/lib/labels";
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
      <PageHeader title="Ajukan Izin Kerja / Akses Site" description="Waktu dalam WIB (Asia/Jakarta)." />
      <Flash searchParams={sp} />

      <form action={saveDraft} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informasi izin</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis izin" required>
              <Select name="permit_type" required defaultValue="akses_site">
                {Object.entries(PERMIT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Site" required>
              <Select name="site_id" required defaultValue="">
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
            <Field label="Judul" required className="sm:col-span-2">
              <Input name="title" required maxLength={200} placeholder="mis. Penggantian modul optik router core" />
            </Field>
            <Field label="Tujuan / lingkup pekerjaan" required className="sm:col-span-2">
              <Textarea name="purpose" required rows={3} />
            </Field>
            <Field label="Vendor" hint="Kosongkan bila pekerjaan internal.">
              <Select name="vendor_id" defaultValue={myVendor}>
                <option value="">— Tidak ada —</option>
                {vendorRows.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIC internal (pendamping NOC)">
              <Select name="pic_internal" defaultValue="">
                <option value="">— Belum ditentukan —</option>
                {profileRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mulai (WIB)" required>
              <Input type="datetime-local" name="start_at" required defaultValue={toDateTimeInput(start)} />
            </Field>
            <Field label="Selesai (WIB)" required>
              <Input type="datetime-local" name="end_at" required defaultValue={toDateTimeInput(end)} />
            </Field>
            <Field label="Tingkat risiko">
              <Select name="risk_level" defaultValue="low">
                {Object.entries(RISK_LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="hidden sm:block" />
            <Field label="Dampak ke layanan">
              <Textarea name="impact" rows={3} />
            </Field>
            <Field label="Rollback plan" hint="Wajib untuk Change Request.">
              <Textarea name="rollback_plan" rows={3} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personel</CardTitle>
            <span className="text-xs text-slate-500">Baris tanpa nama diabaikan.</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <div key={i} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-5">
                <Input name={`p_full_name_${i}`} placeholder="Nama lengkap" aria-label={`Nama personel ${i + 1}`} />
                <Input name={`p_id_number_${i}`} placeholder="No. KTP / ID" aria-label={`No. ID personel ${i + 1}`} />
                <Input name={`p_company_${i}`} placeholder="Perusahaan" aria-label={`Perusahaan personel ${i + 1}`} />
                <Input name={`p_phone_${i}`} placeholder="No. HP" aria-label={`No. HP personel ${i + 1}`} />
                <Input name={`p_role_${i}`} placeholder="Peran (teknisi, dll)" aria-label={`Peran personel ${i + 1}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Barang / perangkat</CardTitle>
            <span className="text-xs text-slate-500">Baris tanpa nama barang diabaikan.</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <div key={i} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[8rem_1fr_1fr_1fr_6rem]">
                <Select name={`i_direction_${i}`} defaultValue="masuk" aria-label={`Arah barang ${i + 1}`}>
                  <option value="masuk">Masuk</option>
                  <option value="keluar">Keluar</option>
                </Select>
                <Input name={`i_name_${i}`} placeholder="Nama barang" aria-label={`Nama barang ${i + 1}`} />
                <Input name={`i_brand_model_${i}`} placeholder="Merk / model" aria-label={`Merk barang ${i + 1}`} />
                <Input name={`i_serial_number_${i}`} placeholder="Serial number" aria-label={`Serial number barang ${i + 1}`} />
                <Input type="number" min={1} name={`i_qty_${i}`} placeholder="Qty" defaultValue={1} aria-label={`Qty barang ${i + 1}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/" className={buttonClass("ghost")}>
            Batal
          </Link>
          <SubmitButton variant="secondary">Simpan draft</SubmitButton>
          <SubmitButton formAction={submitPermit} pendingText="Mengajukan…">
            Ajukan
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
