import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import {
  Alert,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Flash,
  Forbidden,
  formatTime,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Textarea,
} from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { guessHandoverShift } from "@/lib/util";
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
  // Default: shift yang sedang berjalan → shift berikutnya.
  const guess = guessHandoverShift(shifts.working);

  const shiftOptions = shifts.working.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name} ({formatTime(s.start_time)}–{formatTime(s.end_time)})
    </option>
  ));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Buat Handover"
        description="Serahkan kondisi shift Anda ke shift berikutnya. Anda tercatat sebagai penyerah."
        actions={
          <Link href="/" className={buttonClass("secondary")}>
            <ArrowLeft className="size-4" aria-hidden /> Kembali
          </Link>
        }
      />
      <Flash searchParams={sp} />

      {shifts.working.length === 0 && (
        <Alert tone="warning" className="mb-4">
          Belum ada data shift kerja aktif. Minta admin menambahkan shift (mis. Pagi, Siang, Malam) terlebih dahulu.
        </Alert>
      )}

      <form action={createHandover} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Shift yang diserahterimakan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal shift" required hint="Tanggal shift Anda dimulai (untuk shift malam: tanggal sebelum tengah malam).">
              <Input type="date" name="shift_date" defaultValue={guess.date} required />
            </Field>
            <Field label="Site" hint="Pilih “Umum” jika handover berlaku untuk seluruh ruang operasional.">
              <Select name="site_id" defaultValue="">
                <option value="">Umum (semua site)</option>
                {sites.active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dari shift (shift Anda)" required>
              <Select name="from_shift_id" required defaultValue={guess.fromId}>
                <option value="" disabled>
                  Pilih shift
                </option>
                {shiftOptions}
              </Select>
            </Field>
            <Field label="Ke shift (penerima)" required>
              <Select name="to_shift_id" required defaultValue={guess.toId}>
                <option value="" disabled>
                  Pilih shift
                </option>
                {shiftOptions}
              </Select>
            </Field>
            <Field
              label="Penerima"
              hint="Biarkan kosong untuk otomatis memakai leader shift tujuan dari jadwal. Penerima wajib ada sebelum handover diajukan."
              className="sm:col-span-2"
            >
              <Select name="incoming_by" defaultValue="">
                <option value="">Otomatis dari jadwal / tentukan nanti</option>
                {profiles.active
                  .filter((p) => p.id !== auth.userId)
                  .map((p) => (
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
            <CardTitle>2. Kondisi shift</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Ringkasan kondisi shift" hint="Bisa dilengkapi nanti sebelum handover diajukan.">
              <Textarea
                name="summary"
                rows={4}
                placeholder="mis. Semua link normal. Link ISP A sempat flapping 14:10–14:25, sudah stabil. Genset diuji pukul 10:00, OK."
              />
            </Field>
            <Field label="Catatan tambahan">
              <Textarea name="notes" rows={2} placeholder="Opsional: pesan untuk shift berikutnya." />
            </Field>
            <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" name="carry_over" defaultChecked className="mt-0.5 size-4 shrink-0 rounded border-slate-300" />
              <span>
                <span className="font-medium text-slate-900">Bawa item yang belum selesai</span>
                <span className="block text-xs text-slate-500">
                  Item berstatus Open / Dikerjakan dari handover terakhir di site yang sama akan disalin ke handover ini.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Handover disimpan sebagai <strong>draft</strong>. Anggota tim kedua shift diisi otomatis dari jadwal yang sudah
            dipublikasikan. Item & checklist ditambahkan di langkah berikutnya.
          </p>
          <SubmitButton pendingText="Membuat draft…" className="shrink-0">
            Buat draft handover
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
