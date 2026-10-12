import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { LeaveType } from "@noc/supabase/types";
import {
  Alert,
  buttonClass,
  Card,
  CardContent,
  cn,
  Field,
  Flash,
  Forbidden,
  formatDate,
  formatTime,
  Input,
  Label,
  PageHeader,
  Select,
  SubmitButton,
  Textarea,
  toDateInput,
} from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { isLeaveType, LEAVE_HINTS, LEAVE_TYPES } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/util";
import { createLeave } from "../actions";

export const metadata = { title: "Ajukan Cuti / Tukar Shift" };

type MySchedule = {
  id: string;
  work_date: string;
  shift_name: string;
  start_time: string | null;
  end_time: string | null;
  site_name: string | null;
};

export default async function NewLeavePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("leave.request")) return <Forbidden />;

  const jenis = first(sp.jenis);
  const type: LeaveType = isLeaveType(jenis) ? jenis : "cuti";
  const isSwap = type === "tukar_shift";
  const today = toDateInput();

  let schedules: MySchedule[] = [];
  let colleagues: { id: string; full_name: string }[] = [];
  if (isSwap) {
    const supabase = await createClient();
    const [s, p] = await Promise.all([
      supabase
        .from("v_my_schedule")
        .select("id, work_date, shift_name, start_time, end_time, site_name")
        .gte("work_date", today)
        .eq("is_working", true)
        .order("work_date")
        .limit(60),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .is("vendor_id", null)
        .neq("id", auth.userId)
        .order("full_name"),
    ]);
    schedules = (s.data ?? []) as MySchedule[];
    colleagues = (p.data ?? []) as { id: string; full_name: string }[];
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/cuti" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Cuti & tukar shift
      </Link>
      <PageHeader
        title={isSwap ? "Ajukan Tukar Shift" : `Ajukan ${LEAVE_TYPES[type]}`}
        description={
          isSwap
            ? "Minta rekan menggantikan salah satu jadwal shift Anda. Rekan menyetujui dulu, lalu atasan memutuskan."
            : "Permintaan dikirim ke atasan untuk disetujui. Status bisa dipantau di halaman Cuti & tukar shift."
        }
      />
      <Flash searchParams={sp} />

      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Jenis permintaan</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/cuti/baru?jenis=${k}`}
                  aria-current={k === type ? "page" : undefined}
                  className={cn(buttonClass(k === type ? "primary" : "secondary", "sm"))}
                >
                  {v}
                </Link>
              ))}
            </div>
            <p className="text-xs text-slate-500">{LEAVE_HINTS[type]}</p>
          </div>

          <form action={createLeave} className="space-y-4">
            <input type="hidden" name="leave_type" value={type} />

            {isSwap ? (
              schedules.length === 0 ? (
                <Alert tone="warning">
                  Anda tidak memiliki jadwal kerja mendatang yang bisa ditukar. Pastikan jadwal Anda sudah tersedia di
                  modul Jadwal.
                </Alert>
              ) : (
                <>
                  <Field label="Jadwal yang ingin digantikan" required hint="Hanya jadwal kerja Anda mulai hari ini.">
                    <Select name="swap_schedule_id" required defaultValue="">
                      <option value="" disabled>
                        Pilih jadwal…
                      </option>
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatDate(s.work_date)} · {s.shift_name} ({formatTime(s.start_time)}–{formatTime(s.end_time)})
                          {s.site_name ? ` · ${s.site_name}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Rekan pengganti" required hint="Rekan akan melihat permintaan ini dan harus menyatakan bersedia.">
                    <Select name="swap_with" required defaultValue="">
                      <option value="" disabled>
                        Pilih rekan…
                      </option>
                      {colleagues.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ol className="grid gap-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
                    <li>1. Anda kirim permintaan</li>
                    <li>2. Rekan menyatakan bersedia</li>
                    <li>3. Atasan menyetujui</li>
                  </ol>
                </>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tanggal mulai" required>
                  <Input type="date" name="start_date" required defaultValue={today} />
                </Field>
                <Field label="Tanggal selesai" required hint="Sama dengan tanggal mulai bila hanya 1 hari.">
                  <Input type="date" name="end_date" required defaultValue={today} />
                </Field>
              </div>
            )}

            <Field label="Alasan" required>
              <Textarea
                name="reason"
                required
                rows={3}
                placeholder={isSwap ? "mis. Ada keperluan keluarga di tanggal tersebut." : "Jelaskan singkat alasan permintaan."}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Link href="/cuti" className={buttonClass("ghost")}>
                Batal
              </Link>
              <SubmitButton disabled={isSwap && schedules.length === 0} pendingText="Mengirim…">
                Kirim permintaan
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
