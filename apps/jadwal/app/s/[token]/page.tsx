import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@noc/supabase/server";
import { cn, formatDateTime, formatTime, Logo } from "@noc/ui";
import { CalendarRange, Clock, Star, Users } from "lucide-react";
import { dateRange, dayLabel, dayNumber, isWeekend, MONTH_NAMES, rangeLabel, shortDate, todayWib } from "@/lib/dates";
import { shiftStyle, UUID_RE } from "@/lib/shift";

type Shared = {
  title: string;
  start_date: string;
  end_date: string;
  team_name: string | null;
  expires_at: string | null;
  rows: { work_date: string; user_key: string; full_name: string | null; shift_code: string; is_leader: boolean }[];
  shifts: { code: string; name: string; color: string | null; start_time: string | null; end_time: string | null; is_working: boolean }[];
};

/** Satu panggilan RPC per request (dipakai metadata + halaman). */
const load = cache(async (token: string): Promise<Shared | null> => {
  if (!UUID_RE.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_schedule", { p_token: token });
  return (data as Shared | null) ?? null;
});

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `${data.title} (${rangeLabel(data.start_date, data.end_date)})` : "Link tidak berlaku",
    robots: { index: false, follow: false },
  };
}

export default async function SharedSchedulePage({ params }: Props) {
  const data = await load((await params).token);
  if (!data) return <Invalid />;

  const today = todayWib();
  const days = dateRange(data.start_date, data.end_date);
  const shiftMap = new Map(data.shifts.map((s) => [s.code, s]));

  const people = new Map<string, string>();
  const cell = new Map<string, Shared["rows"]>();
  const byDay = new Map<string, Map<string, Shared["rows"]>>();
  const used = new Set<string>();
  for (const r of data.rows) {
    people.set(r.user_key, r.full_name ?? "—");
    const k = `${r.user_key}|${r.work_date}`;
    cell.set(k, [...(cell.get(k) ?? []), r]);
    const day = byDay.get(r.work_date) ?? new Map<string, Shared["rows"]>();
    day.set(r.shift_code, [...(day.get(r.shift_code) ?? []), r]);
    byDay.set(r.work_date, day);
    used.add(r.shift_code);
  }
  const personList = [...people.entries()].sort((a, b) => a[1].localeCompare(b[1], "id"));
  const legend = data.shifts.filter((s) => used.has(s.code));
  const order = new Map(data.shifts.map((s, i) => [s.code, i]));
  const inRange = today >= data.start_date && today <= data.end_date;

  return (
    <div className="min-h-dvh">
      <header className="relative overflow-hidden border-b border-slate-200/60 bg-gradient-to-br from-brand-50 via-white to-amber-50/60">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-200/50 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -bottom-32 left-10 size-72 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Logo />
          <h1 className="mt-6 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{data.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            <Chip icon={<CalendarRange className="size-4" />}>{rangeLabel(data.start_date, data.end_date)}</Chip>
            <Chip icon={<Users className="size-4" />}>
              {data.team_name ?? "Semua tim"} · {personList.length} orang
            </Chip>
            {data.expires_at && (
              <Chip icon={<Clock className="size-4" />}>Link berlaku s/d {formatDateTime(data.expires_at)}</Chip>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        {personList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-semibold text-slate-800">Belum ada jadwal yang dipublikasikan untuk rentang ini.</p>
            <p className="mt-1 text-sm text-slate-500">Halaman ini otomatis menampilkan jadwal begitu roster dipublikasikan.</p>
          </div>
        ) : (
          <>
            {/* Mobile: per hari */}
            <div className="space-y-3 md:hidden">
              {days.map((d) => {
                const groups = [...(byDay.get(d)?.entries() ?? [])].sort(
                  (a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99),
                );
                const isToday = d === today;
                return (
                  <section
                    key={d}
                    className={cn(
                      "rounded-2xl border bg-white p-4 shadow-soft",
                      isToday ? "border-brand-300 ring-2 ring-brand-100" : "border-slate-200",
                    )}
                  >
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className={cn(isWeekend(d) && "text-rose-600")}>{shortDate(d)}</span>
                      {isToday && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] text-white">Hari ini</span>}
                    </h2>
                    {groups.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-400">Tidak ada jadwal.</p>
                    ) : (
                      <ul className="mt-3 space-y-2.5">
                        {groups.map(([code, list]) => {
                          const sh = shiftMap.get(code);
                          return (
                            <li key={code} className="flex gap-3">
                              <span
                                className="mt-0.5 inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-bold"
                                style={shiftStyle(sh?.color)}
                              >
                                {code}
                              </span>
                              <div className="min-w-0 text-sm">
                                <p className="text-xs text-slate-500">
                                  {sh?.name ?? code}
                                  {sh?.is_working && sh.start_time && ` · ${formatTime(sh.start_time)}–${formatTime(sh.end_time)}`}
                                </p>
                                <p className="text-slate-800">
                                  {list.map((r, i) => (
                                    <span key={r.user_key}>
                                      {i > 0 && ", "}
                                      {r.full_name ?? "—"}
                                      {r.is_leader && <Star className="ml-0.5 inline size-3 fill-amber-400 text-amber-500" aria-label="Leader" />}
                                    </span>
                                  ))}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            {/* Tablet/desktop: matriks orang × tanggal */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft md:block">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500">
                        Nama
                      </th>
                      {days.map((d) => (
                        <th
                          key={d}
                          title={`${dayLabel(d)}, ${dayNumber(d)} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]}`}
                          className={cn(
                            "min-w-10 border-b border-r border-slate-100 px-1 py-1.5 text-center font-medium",
                            isWeekend(d) ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500",
                            d === today && "bg-brand-600 text-white",
                          )}
                        >
                          <div className="text-[10px] font-normal">{dayLabel(d)}</div>
                          <div>{dayNumber(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {personList.map(([key, name]) => (
                      <tr key={key} className="hover:[&>*]:bg-slate-50">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 max-w-52 truncate border-b border-r border-slate-200 bg-white px-3 py-1.5 text-left font-medium text-slate-800"
                          title={name}
                        >
                          {name}
                        </th>
                        {days.map((d) => (
                          <td
                            key={d}
                            className={cn(
                              "border-b border-r border-slate-100 p-0.5 text-center",
                              isWeekend(d) && "bg-rose-50/50",
                              d === today && "bg-brand-50",
                            )}
                          >
                            {(cell.get(`${key}|${d}`) ?? []).map((s) => (
                              <div
                                key={s.shift_code}
                                className="relative rounded px-1 py-1 font-semibold leading-none"
                                style={shiftStyle(shiftMap.get(s.shift_code)?.color)}
                                title={`${name} · ${shiftMap.get(s.shift_code)?.name ?? s.shift_code}${s.is_leader ? " · Leader" : ""}`}
                              >
                                {s.shift_code}
                                {s.is_leader && (
                                  <Star className="absolute -right-0.5 -top-1 size-2.5 fill-amber-400 text-amber-500" aria-label="Leader" />
                                )}
                              </div>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-slate-600 shadow-soft">
              <span className="font-medium text-slate-700">Keterangan:</span>
              {legend.map((s) => (
                <span key={s.code} className="inline-flex items-center gap-1.5">
                  <span className="rounded px-1.5 py-0.5 font-semibold" style={shiftStyle(s.color)}>
                    {s.code}
                  </span>
                  {s.name}
                  {s.is_working && s.start_time && (
                    <span className="text-slate-400">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                    </span>
                  )}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <Star className="size-3 fill-amber-400 text-amber-500" aria-hidden /> Leader shift
              </span>
              {inRange && (
                <span className="inline-flex items-center gap-1">
                  <span className="size-3 rounded-sm bg-brand-600" aria-hidden /> Hari ini
                </span>
              )}
            </div>
          </>
        )}
        <p className="pt-2 text-center text-xs text-slate-400">
          Jadwal resmi NOC · hanya menampilkan roster yang sudah dipublikasikan · halaman ini selalu menampilkan data terbaru
        </p>
      </main>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-soft ring-1 ring-slate-200/70">
      <span className="text-brand-500" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function Invalid() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="max-w-sm">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Link jadwal tidak berlaku</h1>
        <p className="mt-2 text-sm text-slate-500">
          Link ini sudah kedaluwarsa, dinonaktifkan, atau salah ketik. Minta link terbaru ke supervisor / lead NOC.
        </p>
      </div>
    </div>
  );
}
