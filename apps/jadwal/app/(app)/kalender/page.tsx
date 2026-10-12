import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { SchedulePeriod, Shift } from "@noc/supabase/types";
import { Alert, buttonClass, Card, cn, EmptyState, Flash, Forbidden, formatTime, PageHeader, Select, StatusBadge } from "@noc/ui";
import { Pencil, Star } from "lucide-react";
import { dateRange, dayLabel, dayNumber, isWeekend, MONTH_NAMES, rangeLabel, todayWib } from "@/lib/dates";
import { shiftStyle, UUID_RE } from "@/lib/shift";

export const metadata = { title: "Kalender Tim" };

type CalRow = {
  id: string;
  work_date: string;
  is_leader: boolean;
  shift_code: string;
  shift_name: string;
  color: string | null;
  user_id: string;
  full_name: string | null;
};

type PeriodLite = Pick<SchedulePeriod, "id" | "name" | "start_date" | "end_date" | "status">;
type ShiftLite = Pick<Shift, "id" | "code" | "name" | "color" | "start_time" | "end_time" | "is_working" | "is_active">;
type SP = Promise<{ period?: string; error?: string; success?: string }>;
type Supa = Awaited<ReturnType<typeof createClient>>;

const PERIOD_COLS = "id, name, start_date, end_date, status";
const STATUS_LABEL: Record<string, string> = { draft: "Draft", archived: "Diarsipkan" };

/** Semua baris kalender satu periode (dipaginasi — PostgREST membatasi ~1000 baris per request). */
async function fetchCalendar(supabase: Supa, periodId: string) {
  const out: CalRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("v_schedule_calendar")
      .select("id, work_date, is_leader, shift_code, shift_name, color, user_id, full_name")
      .eq("period_id", periodId)
      .order("work_date")
      .order("shift_order")
      .order("id")
      .range(from, from + page - 1);
    if (error) return { rows: out, error };
    const rows = (data as CalRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return { rows: out, error: null };
}

export default async function TeamCalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const canManage = auth.can("schedule.manage");
  if (!auth.can("schedule.view") && !canManage) return <Forbidden />;

  const supabase = await createClient();
  const today = todayWib();
  const requested = sp.period && UUID_RE.test(sp.period) ? sp.period : null;

  // Jika periode diminta lewat URL, ambil sekaligus detail & isi kalendernya secara paralel.
  const [{ data: periodData }, { data: shiftData }, requestedRes, requestedCal] = await Promise.all([
    supabase
      .from("schedule_periods")
      .select(PERIOD_COLS)
      .neq("status", "archived")
      .order("start_date", { ascending: false })
      .limit(60),
    supabase.from("shifts").select("id, code, name, color, start_time, end_time, is_working, is_active").order("sort_order"),
    // Bisa saja periode yang diarsipkan (tidak ada di daftar default).
    requested ? supabase.from("schedule_periods").select(PERIOD_COLS).eq("id", requested).maybeSingle() : null,
    requested ? fetchCalendar(supabase, requested) : null,
  ]);
  const periods = (periodData as PeriodLite[] | null) ?? [];
  const shifts = (shiftData as ShiftLite[] | null) ?? [];

  // Periode terpilih: ?period= → periode yang mencakup hari ini (published dulu) → terbaru.
  let period = (requestedRes?.data as PeriodLite | null | undefined) ?? null;
  if (period && !periods.some((p) => p.id === period!.id)) periods.unshift(period);
  if (!period) {
    const current = periods.filter((p) => p.start_date <= today && p.end_date >= today);
    period = current.find((p) => p.status === "published") ?? current[0] ?? periods[0] ?? null;
  }

  if (!period) {
    return (
      <div>
        <PageHeader title="Kalender Tim" description="Lihat siapa bertugas di shift apa pada setiap tanggal." />
        <Flash searchParams={sp} />
        <EmptyState
          title="Belum ada jadwal tim"
          description={
            canManage
              ? "Belum ada periode roster. Buat periode baru, isi jadwalnya, lalu publikasikan agar tim bisa melihat."
              : "Jadwal tim akan muncul di sini setelah roster dipublikasikan oleh supervisor."
          }
          action={
            canManage ? (
              <Link href="/kelola#periode-baru" className={buttonClass()}>
                Buat periode jadwal
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { rows, error } = requestedCal && period.id === requested ? requestedCal : await fetchCalendar(supabase, period.id);

  const days = dateRange(period.start_date, period.end_date);
  const users = new Map<string, string>();
  const cell = new Map<string, CalRow[]>();
  const usedShift = new Set<string>();
  for (const r of rows) {
    users.set(r.user_id, r.full_name ?? "(Pengguna tidak dikenal)");
    const k = `${r.user_id}|${r.work_date}`;
    const list = cell.get(k) ?? [];
    list.push(r);
    cell.set(k, list);
    usedShift.add(r.shift_code);
  }
  // Baris Anda selalu paling atas agar mudah ditemukan.
  const userList = [...users.entries()].sort((a, b) =>
    a[0] === auth.userId ? -1 : b[0] === auth.userId ? 1 : a[1].localeCompare(b[1], "id"),
  );
  const legendShifts = shifts.filter((s) => s.is_active || usedShift.has(s.code));

  return (
    <div>
      <PageHeader
        title="Kalender Tim"
        description="Lihat siapa bertugas di shift apa pada setiap tanggal."
        actions={
          canManage ? (
            <Link href={`/kelola/${period.id}`} className={buttonClass("secondary")}>
              <Pencil className="size-4" aria-hidden /> Ubah jadwal periode ini
            </Link>
          ) : undefined
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor="period" className="mb-1.5 block text-sm font-medium text-slate-700">
            Pilih periode
          </label>
          <Select id="period" name="period" defaultValue={period.id}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({rangeLabel(p.start_date, p.end_date)})
                {STATUS_LABEL[p.status] ? ` — ${STATUS_LABEL[p.status]}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Tampilkan
        </button>
      </form>

      {period.status === "draft" && (
        <Alert tone="warning" className="mb-4">
          Periode ini masih <strong>draft</strong> — hanya pengelola jadwal yang bisa melihatnya. Publikasikan dari halaman Kelola
          Jadwal agar tim bisa melihat.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{period.name}</h2>
          <StatusBadge status={period.status} />
          <span className="text-sm text-slate-500">{rangeLabel(period.start_date, period.end_date)}</span>
          <span className="ml-auto text-xs text-slate-500">{userList.length} orang terjadwal</span>
        </div>

        {error && <p className="px-4 py-3 text-sm text-red-600">Gagal memuat jadwal: {error.message}</p>}

        {userList.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Belum ada yang dijadwalkan pada periode ini.</p>
            {canManage ? (
              <Link href={`/kelola/${period.id}`} className={cn(buttonClass(), "mt-4")}>
                Isi jadwal
              </Link>
            ) : (
              <p className="mt-1">Coba pilih periode lain di atas.</p>
            )}
          </div>
        ) : (
          <>
            <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:hidden">
              Geser tabel ke samping untuk melihat tanggal lainnya.
            </p>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-28 sm:min-w-36 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500">
                      Nama
                    </th>
                    {days.map((d) => (
                      <th
                        key={d}
                        title={`${dayLabel(d)}, ${dayNumber(d)} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]}`}
                        className={cn(
                          "min-w-10 border-b border-r border-slate-100 px-1 py-1.5 text-center font-medium",
                          isWeekend(d) ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500",
                          d === today && "bg-brand-100 text-brand-700",
                        )}
                      >
                        <div className="text-[10px] font-normal">{dayLabel(d)}</div>
                        <div>{dayNumber(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userList.map(([uid, name]) => {
                    const isMe = uid === auth.userId;
                    return (
                      <tr key={uid} className={cn(isMe && "font-semibold")}>
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 max-w-44 truncate border-b border-r border-slate-200 px-3 py-1.5 text-left font-medium text-slate-800",
                            isMe ? "bg-brand-50" : "bg-white",
                          )}
                          title={name}
                        >
                          {name}
                          {isMe && <span className="ml-1 text-[10px] font-normal text-brand-600">(Anda)</span>}
                        </th>
                        {days.map((d) => {
                          const items = cell.get(`${uid}|${d}`) ?? [];
                          return (
                            <td
                              key={d}
                              className={cn(
                                "border-b border-r border-slate-100 p-0.5 text-center",
                                isWeekend(d) && "bg-rose-50/50",
                                d === today && "bg-brand-50",
                              )}
                            >
                              {items.map((s) => (
                                <div
                                  key={s.id}
                                  className="relative rounded px-1 py-1 font-semibold leading-none"
                                  style={shiftStyle(s.color)}
                                  title={`${name} · ${s.shift_name}${s.is_leader ? " · Leader" : ""}`}
                                >
                                  {s.shift_code}
                                  {s.is_leader && (
                                    <Star
                                      className="absolute -right-0.5 -top-1 size-2.5 fill-amber-400 text-amber-500"
                                      aria-label="Leader"
                                    />
                                  )}
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">Keterangan:</span>
          {legendShifts.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="rounded px-1.5 py-0.5 font-semibold" style={shiftStyle(s.color)}>
                {s.code}
              </span>
              {s.name}
              {s.is_working && (
                <span className="text-slate-400">
                  {formatTime(s.start_time)}–{formatTime(s.end_time)}
                </span>
              )}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-amber-400 text-amber-500" aria-hidden /> Leader shift
          </span>
        </div>
      </Card>
    </div>
  );
}
