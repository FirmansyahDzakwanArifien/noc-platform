import Link from "next/link";
import { APPS, appUrl } from "@noc/supabase/apps";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Announcement } from "@noc/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, formatDate, formatDateTime, formatTime, ProgressBar, StatusBadge, toDateInput } from "@noc/ui";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardPlus,
  FileCheck2,
  FilePlus2,
  ListTodo,
  Megaphone,
  Siren,
  TrendingUp,
  Users,
} from "lucide-react";
import { LiveClock } from "../../components/live-clock";
import { ActivityChart, type ActivityPoint } from "../../components/dashboard/activity-chart";
import { CountUp } from "../../components/dashboard/count-up";
import { DonutChart, type DonutSlice } from "../../components/dashboard/donut-chart";

export const metadata = { title: "Dashboard" };

const APP_META = {
  jadwal: { icon: CalendarDays, gradient: "from-amber-500 to-orange-600" },
  handover: { icon: ArrowLeftRight, gradient: "from-sky-500 to-blue-700" },
  perizinan: { icon: FileCheck2, gradient: "from-emerald-500 to-teal-700" },
  perkembangan: { icon: TrendingUp, gradient: "from-violet-500 to-purple-700" },
} as const;

const PERMIT_COLORS: Record<string, [string, string]> = {
  submitted: ["Diajukan", "#f59e0b"],
  in_review: ["Direview", "#3b82f6"],
  approved: ["Disetujui", "#10b981"],
  active: ["Berlangsung", "#dc2626"],
  completed: ["Selesai", "#64748b"],
};

type MySchedule = {
  id: string;
  work_date: string;
  shift_name: string;
  shift_code: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  is_working: boolean;
  site_name: string | null;
};

type ProjectRow = { id: string; code: string; name: string; status: string; progress_pct: number; target_date: string | null; is_overdue: boolean };
type IncidentRow = { id: string; ticket_no: string; title: string; severity: string; status: string; started_at: string };

const wibDate = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(d));
const empty = Promise.resolve({ data: null, count: null });

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }).format(new Date()));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function DashboardPage() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const today = toDateInput();
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 13 * 86_400_000);
  const sinceDate = wibDate(since);

  const [schedule, announcements, unread, openItems, pendingLeave, activePermits, myTasks, incidents, handovers, permits, projects, recentIncidents] =
    await Promise.all([
      auth.can("schedule.view")
        ? supabase.from("v_my_schedule").select("*").gte("work_date", today).order("work_date").limit(7)
        : empty,
      auth.can("portal.access")
        ? supabase
            .from("announcements")
            .select("*")
            .lte("publish_at", nowIso)
            .or(`expire_at.is.null,expire_at.gt.${nowIso}`)
            .order("publish_at", { ascending: false })
            .limit(4)
        : empty,
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      auth.can("handover.view") ? supabase.from("v_open_handover_items").select("id", { count: "exact", head: true }) : empty,
      auth.can("leave.approve")
        ? supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : empty,
      auth.can("permit.view") ? supabase.from("v_active_permits").select("id", { count: "exact", head: true }) : empty,
      auth.can("project.view")
        ? supabase.from("project_tasks").select("id", { count: "exact", head: true }).eq("assignee_id", auth.userId).neq("status", "done")
        : empty,
      auth.can("incident.view")
        ? supabase.from("incidents").select("started_at").gte("started_at", `${sinceDate}T00:00:00+07:00`)
        : empty,
      auth.can("handover.view") ? supabase.from("handovers").select("shift_date").gte("shift_date", sinceDate) : empty,
      auth.can("permit.view")
        ? supabase
            .from("permits")
            .select("status")
            .in("status", Object.keys(PERMIT_COLORS))
            .gte("created_at", new Date(now.getTime() - 90 * 86_400_000).toISOString())
        : empty,
      auth.can("project.view")
        ? supabase
            .from("v_project_overview")
            .select("id, code, name, status, progress_pct, target_date, is_overdue")
            .in("status", ["planning", "on_going", "on_hold"])
            .order("target_date", { ascending: true, nullsFirst: false })
            .limit(5)
        : empty,
      auth.can("incident.view")
        ? supabase
            .from("incidents")
            .select("id, ticket_no, title, severity, status, started_at")
            .in("status", ["open", "investigating", "mitigated"])
            .order("started_at", { ascending: false })
            .limit(5)
        : empty,
    ]);

  const firstName = (auth.profile?.full_name ?? auth.email).split(" ")[0];
  const mySchedule = (schedule.data as MySchedule[] | null) ?? [];
  const todayShift = mySchedule.find((s) => s.work_date === today);

  // Aktivitas 14 hari (WIB)
  const activity: ActivityPoint[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000);
    return {
      date: wibDate(d),
      label: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(d),
      incidents: 0,
      handovers: 0,
    };
  });
  const byDate = new Map(activity.map((a) => [a.date, a]));
  for (const r of (incidents.data as { started_at: string }[] | null) ?? []) {
    const p = byDate.get(wibDate(r.started_at));
    if (p) p.incidents++;
  }
  for (const r of (handovers.data as { shift_date: string }[] | null) ?? []) {
    const p = byDate.get(r.shift_date);
    if (p) p.handovers++;
  }

  const permitSlices: DonutSlice[] = Object.entries(PERMIT_COLORS).map(([key, [label, color]]) => ({
    key,
    label,
    color,
    value: ((permits.data as { status: string }[] | null) ?? []).filter((p) => p.status === key).length,
  }));

  const stats = [
    { label: "Notifikasi baru", value: unread.count, href: "/notifikasi", icon: Bell, accent: "text-brand-600 bg-brand-50" },
    { label: "Item handover terbuka", value: openItems.count, href: `${appUrl("handover")}/item-terbuka`, icon: ArrowLeftRight, accent: "text-sky-600 bg-sky-50" },
    { label: "Cuti menunggu approval", value: pendingLeave.count, href: `${appUrl("perizinan")}/cuti`, icon: CalendarClock, accent: "text-amber-600 bg-amber-50" },
    { label: "Izin kerja aktif", value: activePermits.count, href: appUrl("perizinan"), icon: FileCheck2, accent: "text-emerald-600 bg-emerald-50" },
    { label: "Task saya", value: myTasks.count, href: `${appUrl("perkembangan")}/tugas-saya`, icon: ListTodo, accent: "text-violet-600 bg-violet-50" },
  ].filter((s) => s.value !== null && s.value !== undefined);

  const actions = [
    { label: "Buat handover", href: `${appUrl("handover")}/baru`, icon: ClipboardPlus, perm: "handover.create" },
    { label: "Lapor incident", href: `${appUrl("handover")}/incident`, icon: Siren, perm: "incident.manage" },
    { label: "Ajukan izin kerja", href: `${appUrl("perizinan")}/baru`, icon: FilePlus2, perm: "permit.create" },
    { label: "Ajukan cuti", href: `${appUrl("perizinan")}/cuti/baru`, icon: CalendarClock, perm: "leave.request" },
    { label: "Kelola jadwal", href: `${appUrl("jadwal")}/kelola`, icon: CalendarDays, perm: "schedule.manage" },
    { label: "Kelola user", href: "/admin/users", icon: Users, perm: "user.manage" },
  ].filter((a) => auth.can(a.perm));

  const apps = APPS.filter((a) => a.key !== "portal" && (!a.permission || auth.can(a.permission)));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 left-1/3 size-72 rounded-full bg-brand-900/50 blur-3xl" aria-hidden />
        <svg viewBox="0 0 600 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-20 w-full opacity-40" aria-hidden>
          <path
            d="M0 50 H200 L215 50 L228 20 L245 72 L262 35 L272 50 H420 L432 50 L442 30 L456 66 L466 50 H600"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="200 200"
            className="animate-pulse-line"
          />
        </svg>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="animate-fade-up">
            <p className="text-sm text-slate-400">{greeting()},</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{firstName} 👋</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {todayShift ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 backdrop-blur">
                  <span className="size-2 rounded-full" style={{ background: todayShift.color ?? "#94a3b8" }} />
                  Hari ini: <b className="font-semibold">{todayShift.shift_name}</b>
                  {todayShift.is_working && (
                    <span className="text-slate-300">
                      {formatTime(todayShift.start_time)}–{formatTime(todayShift.end_time)}
                    </span>
                  )}
                </span>
              ) : (
                auth.can("schedule.view") && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">Tidak ada jadwal hari ini</span>
                )
              )}
              {auth.roles.map((r) => (
                <span key={r} className="rounded-full bg-brand-600/90 px-2.5 py-1 text-xs font-semibold capitalize">
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div className="animate-fade-up text-left lg:text-right [animation-delay:120ms]">
            <LiveClock showDate className="font-display text-4xl font-bold tracking-tight sm:text-5xl" />
          </div>
        </div>

        {actions.length > 0 && (
          <div className="relative mt-6 flex flex-wrap gap-2">
            {actions.map((a) => (
              <a
                key={a.label}
                href={a.href}
                className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-500/60 hover:bg-brand-600/20"
              >
                <a.icon className="size-4 text-brand-400" aria-hidden />
                {a.label}
              </a>
            ))}
          </div>
        )}
      </section>

      {auth.permissions.length === 0 && (
        <Card>
          <CardContent className="text-sm text-slate-600">
            Akun Anda belum memiliki role. Hubungi admin atau supervisor untuk mendapatkan akses.
          </CardContent>
        </Card>
      )}

      {/* Statistik */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stats.map((s, i) => (
            <a
              key={s.label}
              href={s.href}
              className="group animate-fade-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <span className={`grid size-9 place-items-center rounded-lg ${s.accent}`}>
                  <s.icon className="size-4.5" aria-hidden />
                </span>
                <ArrowUpRight className="size-4 text-slate-300 transition group-hover:text-brand-500" aria-hidden />
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                <CountUp value={s.value ?? 0} />
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
            </a>
          ))}
        </div>
      )}

      {/* Aplikasi */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {apps.map((a) => {
          const meta = APP_META[a.key as keyof typeof APP_META];
          return (
            <a
              key={a.key}
              href={a.url}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className={`absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br opacity-10 transition-transform duration-500 group-hover:scale-150 ${meta?.gradient}`}
                aria-hidden
              />
              <span className={`grid size-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md ${meta?.gradient}`}>
                {meta && <meta.icon className="size-5" aria-hidden />}
              </span>
              <p className="mt-4 flex items-center gap-1 font-semibold text-slate-900">
                {a.name}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{a.description}</p>
            </a>
          );
        })}
      </div>

      {/* Grafik */}
      {(auth.can("incident.view") || auth.can("handover.view") || auth.can("permit.view")) && (
        <div className="grid gap-6 lg:grid-cols-5">
          {(auth.can("incident.view") || auth.can("handover.view")) && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Aktivitas 14 hari terakhir</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityChart data={activity} />
              </CardContent>
            </Card>
          )}
          {auth.can("permit.view") && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Status izin kerja (90 hari)</CardTitle>
                <a href={appUrl("perizinan")} className="text-sm font-medium text-brand-600 hover:underline">
                  Buka
                </a>
              </CardHeader>
              <CardContent>
                <DonutChart data={permitSlices} centerLabel="Total izin" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Jadwal minggu ini */}
      {auth.can("schedule.view") && (
        <Card>
          <CardHeader>
            <CardTitle>Jadwal saya 7 hari ke depan</CardTitle>
            <a href={appUrl("jadwal")} className="text-sm font-medium text-brand-600 hover:underline">
              Kalender
            </a>
          </CardHeader>
          <CardContent>
            {mySchedule.length ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {mySchedule.map((s) => {
                  const d = new Date(`${s.work_date}T00:00:00+07:00`);
                  const isToday = s.work_date === today;
                  return (
                    <div
                      key={s.id}
                      className={`min-w-28 flex-1 rounded-xl border p-3 transition hover:shadow-md ${
                        isToday ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-xs font-medium uppercase text-slate-500">
                        {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d)}
                      </p>
                      <p className="text-2xl font-semibold text-slate-900">
                        {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric" }).format(d)}
                      </p>
                      <span
                        className="mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ background: s.color ?? "#94a3b8" }}
                      >
                        {s.shift_name}
                      </span>
                      {s.is_working && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {formatTime(s.start_time)}–{formatTime(s.end_time)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Belum ada jadwal yang dipublikasikan.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {auth.can("incident.view") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-brand-600" aria-hidden /> Incident berjalan
              </CardTitle>
              <a href={`${appUrl("handover")}/incident`} className="text-sm font-medium text-brand-600 hover:underline">
                Semua
              </a>
            </CardHeader>
            <CardContent className="p-0">
              {(recentIncidents.data as IncidentRow[] | null)?.length ? (
                <ul className="divide-y divide-slate-100">
                  {(recentIncidents.data as IncidentRow[]).map((i) => (
                    <li key={i.id}>
                      <a href={`${appUrl("handover")}/incident/${i.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                        <span
                          className={`size-2.5 shrink-0 rounded-full ${
                            i.severity === "critical" ? "animate-pulse bg-brand-600" : i.severity === "high" ? "bg-orange-500" : "bg-amber-400"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{i.title}</p>
                          <p className="text-xs text-slate-500">
                            {i.ticket_no} · {formatDateTime(i.started_at)}
                          </p>
                        </div>
                        <StatusBadge status={i.status} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-500">Tidak ada incident yang sedang berjalan. 🎉</p>
              )}
            </CardContent>
          </Card>
        )}

        {auth.can("project.view") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-brand-600" aria-hidden /> Project berjalan
              </CardTitle>
              <a href={appUrl("perkembangan")} className="text-sm font-medium text-brand-600 hover:underline">
                Semua
              </a>
            </CardHeader>
            <CardContent className="p-0">
              {(projects.data as ProjectRow[] | null)?.length ? (
                <ul className="divide-y divide-slate-100">
                  {(projects.data as ProjectRow[]).map((p) => (
                    <li key={p.id}>
                      <a href={`${appUrl("perkembangan")}/${p.id}`} className="block px-5 py-3 transition hover:bg-slate-50">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                          {p.is_overdue && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">TERLAMBAT</span>}
                          <span className="ml-auto text-xs font-semibold tabular-nums text-slate-700">{Math.round(p.progress_pct)}%</span>
                        </div>
                        <ProgressBar value={p.progress_pct} className="mt-2" />
                        <p className="mt-1 text-xs text-slate-500">
                          {p.code}
                          {p.target_date && ` · target ${formatDate(p.target_date)}`}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-500">Belum ada project yang berjalan.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {auth.can("portal.access") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-brand-600" aria-hidden /> Pengumuman
            </CardTitle>
            <Link href="/pengumuman" className="text-sm font-medium text-brand-600 hover:underline">
              Semua
            </Link>
          </CardHeader>
          <CardContent>
            {(announcements.data as Announcement[] | null)?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {(announcements.data as Announcement[]).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl border p-4 ${a.priority === "critical" || a.priority === "high" ? "border-brand-200 bg-brand-50/50" : "border-slate-200"}`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{a.title}</p>
                      {a.priority !== "low" && <StatusBadge status={a.priority} />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                    <p className="mt-2 text-xs text-slate-400">{formatDate(a.publish_at)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Tidak ada pengumuman aktif.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
