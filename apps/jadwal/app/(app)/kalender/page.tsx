import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { SchedulePeriod, Shift } from "@noc/supabase/types";
import { buttonClass, Card, cn, EmptyState, Flash, Forbidden, formatTime, PageHeader, Select, StatusBadge } from "@noc/ui";
import { Pencil, Star } from "lucide-react";
import { dateRange, dayLabel, dayNumber, isWeekend, MONTH_NAMES, rangeLabel, todayWib } from "@/lib/dates";
import { shiftStyle } from "@/lib/shift";

export const metadata = { title: "Kalender Tim" };

type CalRow = {
  id: string;
  period_id: string;
  work_date: string;
  is_leader: boolean;
  shift_code: string;
  shift_name: string;
  color: string | null;
  shift_order: number;
  user_id: string;
  full_name: string;
};

type PeriodLite = Pick<SchedulePeriod, "id" | "name" | "start_date" | "end_date" | "status">;
type SP = Promise<{ period?: string; error?: string; success?: string }>;

export default async function TeamCalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const canManage = auth.can("schedule.manage");
  if (!auth.can("schedule.view") && !canManage) return <Forbidden />;

  const supabase = await createClient();
  const today = todayWib();

  const [{ data: periodData }, { data: shiftData }] = await Promise.all([
    supabase
      .from("schedule_periods")
      .select("id, name, start_date, end_date, status")
      .neq("status", "archived")
      .order("start_date", { ascending: false })
      .limit(60),
    supabase.from("shifts").select("*").order("sort_order"),
  ]);
  const periods = (periodData as PeriodLite[] | null) ?? [];
  const shifts = (shiftData as Shift[] | null) ?? [];

  // Periode terpilih: ?period= → periode yang mencakup hari ini (published dulu) → terbaru.
  let period: PeriodLite | null = periods.find((p) => p.id === sp.period) ?? null;
  if (!period && sp.period) {
    // Bisa saja periode yang diarsipkan (tidak ada di daftar default).
    const { data } = await supabase
      .from("schedule_periods")
      .select("id, name, start_date, end_date, status")
      .eq("id", sp.period)
      .maybeSingle();
    period = (data as PeriodLite | null) ?? null;
    if (period) periods.unshift(period);
  }
  if (!period) {
    const current = periods.filter((p) => p.start_date <= today && p.end_date >= today);
    period = current.find((p) => p.status === "published") ?? current[0] ?? periods[0] ?? null;
  }

  if (!period) {
    return (
      <div>
        <PageHeader title="Kalender Tim" description="Siapa jaga shift apa per tanggal." />
        <Flash searchParams={sp} />
        <EmptyState
          title="Belum ada periode jadwal"
          description="Jadwal tim akan muncul di sini setelah dipublikasikan oleh supervisor."
          action={
            canManage ? (
              <Link href="/kelola" className={buttonClass()}>
                Kelola jadwal
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { data: calData, error } = await supabase
    .from("v_schedule_calendar")
    .select("*")
    .eq("period_id", period.id)
    .order("work_date")
    .order("shift_order");
  const rows = (calData as CalRow[] | null) ?? [];

  const days = dateRange(period.start_date, period.end_date);
  const users = new Map<string, string>();
  const cell = new Map<string, CalRow[]>();
  const usedShift = new Set<string>();
  for (const r of rows) {
    users.set(r.user_id, r.full_name);
    const k = `${r.user_id}|${r.work_date}`;
    const list = cell.get(k) ?? [];
    list.push(r);
    cell.set(k, list);
    usedShift.add(r.shift_code);
  }
  const userList = [...users.entries()].sort((a, b) => a[1].localeCompare(b[1], "id"));
  const legendShifts = shifts.filter((s) => s.is_active || usedShift.has(s.code));

  return (
    <div>
      <PageHeader
        title="Kalender Tim"
        description="Siapa jaga shift apa per tanggal."
        actions={
          canManage ? (
            <Link href={`/kelola/${period.id}`} className={buttonClass("secondary")}>
              <Pencil className="size-4" aria-hidden /> Edit periode ini
            </Link>
          ) : undefined
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor="period" className="mb-1.5 block text-sm font-medium text-slate-700">
            Periode
          </label>
          <Select id="period" name="period" defaultValue={period.id}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({rangeLabel(p.start_date, p.end_date)})
                {p.status !== "published" ? ` — ${p.status === "draft" ? "Draft" : "Diarsipkan"}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Tampilkan
        </button>
      </form>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{period.name}</h2>
          <StatusBadge status={period.status} />
          <span className="text-sm text-slate-500">{rangeLabel(period.start_date, period.end_date)}</span>
          <span className="ml-auto text-xs text-slate-500">{userList.length} orang</span>
        </div>

        {error && <p className="px-4 py-3 text-sm text-red-600">Gagal memuat jadwal: {error.message}</p>}

        {userList.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Belum ada jadwal pada periode ini.</p>
        ) : (
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
                {userList.map(([uid, name]) => (
                  <tr key={uid} className={cn(uid === auth.userId && "font-semibold")}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-44 truncate border-b border-r border-slate-200 bg-white px-3 py-1.5 text-left font-medium text-slate-800"
                      title={name}
                    >
                      {name}
                      {uid === auth.userId && <span className="ml-1 text-[10px] font-normal text-brand-600">(Anda)</span>}
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
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
