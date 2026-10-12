import Link from "next/link";
import { APPS } from "@noc/supabase/apps";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Announcement } from "@noc/supabase/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, formatDate, formatTime, StatusBadge, toDateInput } from "@noc/ui";
import { ArrowLeftRight, ArrowRight, CalendarDays, FileCheck2, TrendingUp } from "lucide-react";

export const metadata = { title: "Dashboard" };

const APP_ICONS = {
  jadwal: CalendarDays,
  handover: ArrowLeftRight,
  perizinan: FileCheck2,
  perkembangan: TrendingUp,
} as const;

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

export default async function DashboardPage() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const today = toDateInput();
  const nowIso = new Date().toISOString();

  const [schedule, announcements, unread, openItems, pendingLeave, activePermits, myTasks] = await Promise.all([
    auth.can("schedule.view")
      ? supabase.from("v_my_schedule").select("*").gte("work_date", today).order("work_date").limit(7)
      : Promise.resolve({ data: [] }),
    auth.can("portal.access")
      ? supabase
          .from("announcements")
          .select("*")
          .lte("publish_at", nowIso)
          .or(`expire_at.is.null,expire_at.gt.${nowIso}`)
          .order("publish_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    auth.can("handover.view")
      ? supabase.from("v_open_handover_items").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    auth.can("leave.approve")
      ? supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: null }),
    auth.can("permit.view")
      ? supabase.from("v_active_permits").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    auth.can("project.view")
      ? supabase
          .from("project_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", auth.userId)
          .neq("status", "done")
      : Promise.resolve({ count: null }),
  ]);

  const firstName = (auth.profile?.full_name ?? auth.email).split(" ")[0];
  const apps = APPS.filter((a) => a.key !== "portal" && (!a.permission || auth.can(a.permission)));
  const stats = [
    { label: "Notifikasi belum dibaca", value: unread.count, href: "/notifikasi" },
    { label: "Item handover terbuka", value: openItems.count, href: APPS.find((a) => a.key === "handover")!.url },
    { label: "Cuti/izin menunggu approval", value: pendingLeave.count, href: `${APPS.find((a) => a.key === "perizinan")!.url}/cuti` },
    { label: "Izin kerja aktif", value: activePermits.count, href: APPS.find((a) => a.key === "perizinan")!.url },
    { label: "Task saya belum selesai", value: myTasks.count, href: `${APPS.find((a) => a.key === "perkembangan")!.url}/tugas-saya` },
  ].filter((s) => s.value !== null && s.value !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Halo, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">{formatDate(new Date())}</p>
      </div>

      {auth.permissions.length === 0 && (
        <Card>
          <CardContent className="text-sm text-slate-600">
            Akun Anda belum memiliki role. Hubungi admin atau supervisor untuk mendapatkan akses.
          </CardContent>
        </Card>
      )}

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((s) => (
            <a key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-200">
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{s.value ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">{s.label}</p>
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {apps.map((a) => {
          const Icon = APP_ICONS[a.key as keyof typeof APP_ICONS];
          return (
            <a
              key={a.key}
              href={a.url}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                {Icon && <Icon className="size-5" aria-hidden />}
              </span>
              <p className="mt-3 flex items-center gap-1 font-medium text-slate-900">
                {a.name}
                <ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" aria-hidden />
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{a.description}</p>
            </a>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {auth.can("schedule.view") && (
          <Card>
            <CardHeader>
              <CardTitle>Jadwal saya 7 hari ke depan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(schedule.data as MySchedule[] | null)?.length ? (
                <ul className="divide-y divide-slate-100">
                  {(schedule.data as MySchedule[]).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? "#94a3b8" }} />
                      <span className="w-28 shrink-0 text-slate-500">{formatDate(s.work_date)}</span>
                      <span className="font-medium text-slate-900">{s.shift_name}</span>
                      {s.is_working && (
                        <span className="text-slate-500">
                          {formatTime(s.start_time)}–{formatTime(s.end_time)}
                        </span>
                      )}
                      {s.site_name && <span className="ml-auto truncate text-xs text-slate-400">{s.site_name}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-500">Belum ada jadwal yang dipublikasikan.</p>
              )}
            </CardContent>
          </Card>
        )}

        {auth.can("portal.access") && (
          <Card>
            <CardHeader>
              <CardTitle>Pengumuman</CardTitle>
              <Link href="/pengumuman" className="text-sm font-medium text-brand-600 hover:underline">
                Semua
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {(announcements.data as Announcement[] | null)?.length ? (
                <ul className="divide-y divide-slate-100">
                  {(announcements.data as Announcement[]).map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{a.title}</p>
                        {a.priority !== "low" && <StatusBadge status={a.priority} />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(a.publish_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-500">Tidak ada pengumuman aktif.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {auth.roles.length > 0 && (
        <p className="text-xs text-slate-400">
          Role: {auth.roles.map((r) => <Badge key={r} className="ml-1">{r}</Badge>)}
        </p>
      )}
    </div>
  );
}
