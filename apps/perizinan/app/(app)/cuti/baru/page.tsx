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
import { isLeaveType, LEAVE_TYPES } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/util";
import { createLeave } from "../actions";

export const metadata = { title: "Ajukan Cuti / Izin" };

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
      <PageHeader title="Ajukan Cuti / Izin" description="Permintaan akan diteruskan ke atasan untuk disetujui." />
      <Flash searchParams={sp} />

      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <div className="flex flex-wrap gap-2" role="tablist">
              {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/cuti/baru?jenis=${k}`}
                  role="tab"
                  aria-selected={k === type}
                  className={cn(buttonClass(k === type ? "primary" : "secondary", "sm"))}
                >
                  {v}
                </Link>
              ))}
            </div>
          </div>

          <form action={createLeave} className="space-y-4">
            <input type="hidden" name="leave_type" value={type} />

            {isSwap ? (
              schedules.length === 0 ? (
                <Alert tone="warning">Anda tidak memiliki jadwal kerja mendatang yang bisa ditukar.</Alert>
              ) : (
                <>
                  <Field label="Jadwal yang ditukar" required hint="Tanggal permintaan mengikuti tanggal jadwal ini.">
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
                  <Field label="Rekan pengganti" required hint="Rekan harus menyetujui sebelum atasan memutuskan.">
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
                </>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tanggal mulai" required>
                  <Input type="date" name="start_date" required defaultValue={today} />
                </Field>
                <Field label="Tanggal selesai" required>
                  <Input type="date" name="end_date" required defaultValue={today} />
                </Field>
              </div>
            )}

            <Field label="Alasan" required>
              <Textarea name="reason" required rows={3} />
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
