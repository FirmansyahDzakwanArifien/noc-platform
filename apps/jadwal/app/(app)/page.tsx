import Link from "next/link";
import { appUrl } from "@noc/supabase/apps";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { buttonClass, Card, CardContent, cn, EmptyState, Flash, Forbidden, formatTime, PageHeader } from "@noc/ui";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Star } from "lucide-react";
import {
  addMonths,
  dateRange,
  dayNumber,
  dayOfWeek,
  isValidMonth,
  isWeekend,
  monthEnd,
  monthLabel,
  monthOf,
  monthStart,
  shortDate,
  todayWib,
  WEEK_HEADER,
} from "@/lib/dates";
import { shiftStyle } from "@/lib/shift";

export const metadata = { title: "Jadwal Saya" };

type MySchedule = {
  id: string;
  work_date: string;
  is_leader: boolean;
  note: string | null;
  shift_code: string;
  shift_name: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  is_working: boolean;
  site_code: string | null;
  site_name: string | null;
  period_id: string;
  period_name: string;
};

type SP = Promise<{ bulan?: string; error?: string; success?: string }>;

export default async function MySchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("schedule.view") && !auth.can("schedule.manage")) return <Forbidden />;

  const today = todayWib();
  const month = isValidMonth(sp.bulan) ? sp.bulan : monthOf(today);
  const first = monthStart(month);
  const last = monthEnd(month);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_my_schedule")
    .select("*")
    .gte("work_date", first)
    .lte("work_date", last)
    .order("work_date")
    .order("start_time", { nullsFirst: false });
  const rows = (data as MySchedule[] | null) ?? [];

  const byDate = new Map<string, MySchedule[]>();
  for (const r of rows) {
    const list = byDate.get(r.work_date) ?? [];
    list.push(r);
    byDate.set(r.work_date, list);
  }

  const days = dateRange(first, last);
  const leading = (dayOfWeek(first) + 6) % 7; // grid dimulai Senin
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const legend = new Map<string, { name: string; color: string | null; count: number }>();
  let workDays = 0;
  for (const r of rows) {
    const l = legend.get(r.shift_code) ?? { name: r.shift_name, color: r.color, count: 0 };
    l.count++;
    legend.set(r.shift_code, l);
    if (r.is_working) workDays++;
  }

  const swapUrl = `${appUrl("perizinan")}/cuti/baru?jenis=tukar_shift`;

  return (
    <div>
      <PageHeader
        title="Jadwal Saya"
        description="Jadwal shift Anda dari periode yang sudah dipublikasikan."
        actions={
          <a href={swapUrl} className={buttonClass("secondary")}>
            <ArrowLeftRight className="size-4" aria-hidden /> Ajukan tukar shift
          </a>
        }
      />
      <Flash searchParams={sp} />

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-5">
          <Link
            href={`/?bulan=${addMonths(month, -1)}`}
            className={buttonClass("ghost", "sm")}
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">{monthLabel(addMonths(month, -1))}</span>
          </Link>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">{monthLabel(month)}</h2>
            {month !== monthOf(today) && (
              <Link href="/" className="text-xs font-medium text-brand-600 hover:underline">
                Bulan ini
              </Link>
            )}
          </div>
          <Link href={`/?bulan=${addMonths(month, 1)}`} className={buttonClass("ghost", "sm")} aria-label="Bulan berikutnya">
            <span className="hidden sm:inline">{monthLabel(addMonths(month, 1))}</span>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>

        {error && <p className="px-5 py-3 text-sm text-red-600">Gagal memuat jadwal: {error.message}</p>}

        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {WEEK_HEADER.map((d, i) => (
            <div key={d} className={cn("py-2", i >= 5 && "text-rose-500")}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} className="min-h-14 border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-24" />;
            const items = byDate.get(d) ?? [];
            const isToday = d === today;
            return (
              <div
                key={d}
                className={cn(
                  "min-h-14 border-b border-r border-slate-100 p-1 sm:min-h-24 sm:p-1.5",
                  isWeekend(d) && "bg-rose-50/40",
                )}
              >
                <span
                  className={cn(
                    "inline-grid size-6 place-items-center rounded-full text-xs",
                    isToday ? "bg-brand-600 font-semibold text-white" : isWeekend(d) ? "text-rose-500" : "text-slate-600",
                  )}
                >
                  {dayNumber(d)}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight sm:px-1.5 sm:text-xs"
                      style={shiftStyle(s.color)}
                      title={`${s.shift_name}${s.is_working ? ` ${formatTime(s.start_time)}–${formatTime(s.end_time)}` : ""}${s.site_name ? ` · ${s.site_name}` : ""}${s.is_leader ? " · Leader" : ""}`}
                    >
                      {s.is_leader && <Star className="mr-0.5 inline size-2.5 fill-current align-[-1px]" aria-label="Leader" />}
                      <span className="sm:hidden">{s.shift_code}</span>
                      <span className="hidden sm:inline">
                        {s.shift_code}
                        {s.is_working && (
                          <span className="font-normal opacity-90">
                            {" "}
                            {formatTime(s.start_time)}–{formatTime(s.end_time)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {legend.size > 0 && (
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            {[...legend.entries()].map(([code, l]) => (
              <span key={code} className="inline-flex items-center gap-1.5">
                <span className="rounded px-1.5 py-0.5 font-semibold" style={shiftStyle(l.color)}>
                  {code}
                </span>
                {l.name} <span className="text-slate-400">×{l.count}</span>
              </span>
            ))}
            <span className="ml-auto text-slate-500">{workDays} hari kerja</span>
          </CardContent>
        )}
      </Card>

      {/* Daftar ringkas untuk HP */}
      <div className="mt-6 sm:hidden">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Daftar jadwal</h2>
        {rows.length === 0 ? (
          <EmptyState title="Belum ada jadwal" description="Tidak ada jadwal yang dipublikasikan untuk bulan ini." />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {rows.map((s) => (
              <li key={s.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", s.work_date === today && "bg-brand-50")}>
                <span className="w-24 shrink-0 text-slate-500">{shortDate(s.work_date)}</span>
                <span className="w-10 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold" style={shiftStyle(s.color)}>
                  {s.shift_code}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-900">{s.shift_name}</span>
                  {s.is_working && (
                    <span className="text-slate-500">
                      {" "}
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                    </span>
                  )}
                  {s.is_leader && <span className="ml-1 text-xs text-amber-600">★ Leader</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rows.length === 0 && (
        <p className="mt-4 hidden text-sm text-slate-500 sm:block">Tidak ada jadwal yang dipublikasikan untuk bulan ini.</p>
      )}
    </div>
  );
}
