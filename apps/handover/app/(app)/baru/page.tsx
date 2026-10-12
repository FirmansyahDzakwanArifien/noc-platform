import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Card, CardContent, Field, Flash, Forbidden, Input, PageHeader, Select, SubmitButton, Textarea, toDateInput } from "@noc/ui";
import { loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { createHandover } from "./actions";

export const metadata = { title: "Buat Handover" };

export default async function NewHandoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("handover.create")) return <Forbidden />;

  const supabase = await createClient();
  const [profiles, shifts, sites] = await Promise.all([loadProfiles(supabase), loadShifts(supabase), loadSites(supabase)]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Buat Handover" description="Handover dibuat sebagai draft; Anda tercatat sebagai penyerah." />
      <Flash searchParams={sp} />
      <Card>
        <CardContent>
          <form action={createHandover} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site" hint="Kosongkan jika berlaku umum.">
                <Select name="site_id" defaultValue="">
                  <option value="">— Umum —</option>
                  {sites.active.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tanggal shift" required>
                <Input type="date" name="shift_date" defaultValue={toDateInput()} required />
              </Field>
              <Field label="Dari shift" required>
                <Select name="from_shift_id" required defaultValue="">
                  <option value="" disabled>
                    Pilih shift
                  </option>
                  {shifts.working.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ke shift" required>
                <Select name="to_shift_id" required defaultValue="">
                  <option value="" disabled>
                    Pilih shift
                  </option>
                  {shifts.working.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Penerima" hint="Kosongkan untuk memakai leader shift tujuan dari jadwal (jika ada)." className="sm:col-span-2">
                <Select name="incoming_by" defaultValue="">
                  <option value="">— Belum ditentukan —</option>
                  {profiles.active
                    .filter((p) => p.id !== auth.userId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label="Ringkasan kondisi shift">
              <Textarea name="summary" rows={4} placeholder="Kondisi jaringan, kejadian penting, dll." />
            </Field>
            <Field label="Catatan">
              <Textarea name="notes" rows={3} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="carry_over" defaultChecked className="mt-0.5 size-4 rounded border-slate-300" />
              <span>Bawa item terbuka dari handover sebelumnya (site yang sama)</span>
            </label>
            <p className="text-xs text-slate-500">
              Anggota tim shift asal &amp; tujuan diisi otomatis dari jadwal shift yang sudah dipublikasikan.
            </p>
            <div className="flex justify-end">
              <SubmitButton>Buat draft</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
