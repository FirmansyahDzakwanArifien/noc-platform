import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Priority, ProjectStatus } from "@noc/supabase/types";
import {
  Badge,
  buttonClass,
  cn,
  EmptyState,
  Flash,
  formatDate,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@noc/ui";
import { AlertTriangle, CalendarClock, Plus } from "lucide-react";
import { PriorityBadge } from "@/components/badges";
import { PROJECT_STATUSES } from "@/lib/constants";
import { first } from "@/lib/data";

export const metadata = { title: "Project" };

type Overview = {
  id: string;
  code: string | null;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  progress_pct: number;
  target_date: string | null;
  owner_name: string;
  total_tasks: number;
  done_tasks: number;
  blocked_tasks: number;
  is_overdue: boolean | null;
};

const STATUS_ORDER: Record<ProjectStatus, number> = { on_going: 0, planning: 1, on_hold: 2, done: 3, cancelled: 4 };
const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function ProjectListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_project_overview")
    .select("id, code, name, status, priority, progress_pct, target_date, owner_name, total_tasks, done_tasks, blocked_tasks, is_overdue")
    .limit(1000);
  const all = ((data ?? []) as Overview[]).slice().sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"),
  );

  const status = first(sp.status) ?? "";
  const filtered =
    status === "aktif"
      ? all.filter((p) => p.status === "planning" || p.status === "on_going" || p.status === "on_hold")
      : status === "terlambat"
        ? all.filter((p) => p.is_overdue)
        : status
          ? all.filter((p) => p.status === status)
          : all;

  const stats = [
    { key: "aktif", label: "Project aktif", value: all.filter((p) => p.status === "on_going" || p.status === "planning" || p.status === "on_hold").length },
    { key: "done", label: "Selesai", value: all.filter((p) => p.status === "done").length },
    { key: "terlambat", label: "Terlambat", value: all.filter((p) => p.is_overdue).length, danger: true },
    { key: "", label: "Total project", value: all.length },
  ];

  const filters = [
    { value: "", label: "Semua" },
    { value: "aktif", label: "Aktif" },
    ...PROJECT_STATUSES,
    { value: "terlambat", label: "Terlambat" },
  ];
  const filterLabel = filters.find((f) => f.value === status)?.label.toLowerCase();

  return (
    <div>
      <PageHeader
        title="Project"
        description="Daftar project tim beserta progress, target, dan task yang terhambat. Klik project untuk detailnya."
        actions={
          auth.can("project.create") && (
            <Link href="/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Project baru
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.key ? `/?status=${s.key}` : "/"}
            aria-current={status === s.key ? "page" : undefined}
            className={cn(
              "rounded-xl border bg-white p-4 shadow-soft hover:border-brand-200",
              status === s.key ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200",
            )}
          >
            <p className={cn("text-2xl font-semibold tabular-nums", s.danger && s.value > 0 ? "text-red-600" : "text-slate-900")}>
              {s.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filter status">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/?status=${f.value}` : "/"}
            aria-current={status === f.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-medium",
              status === f.value ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error ? (
        <EmptyState
          title="Gagal memuat project"
          description={`Muat ulang halaman ini. Bila masih gagal, hubungi admin. (${error.message})`}
        />
      ) : filtered.length === 0 ? (
        status ? (
          <EmptyState
            title={`Tidak ada project ${filterLabel}`}
            description="Coba filter lain atau tampilkan semua project."
            action={
              <Link href="/" className={buttonClass("secondary")}>
                Tampilkan semua project
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Belum ada project"
            description={
              auth.can("project.create")
                ? "Buat project pertama untuk mulai mencatat task, milestone, dan laporan progress tim."
                : "Project akan tampil di sini setelah dibuat oleh lead atau supervisor."
            }
            action={
              auth.can("project.create") ? (
                <Link href="/baru" className={buttonClass()}>
                  <Plus className="size-4" aria-hidden /> Buat project
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/${p.id}`}
              className="flex flex-col rounded-xl border border-slate-200/70 bg-white p-4 shadow-soft transition hover:border-brand-300 hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {p.code && <p className="text-xs font-medium text-slate-400">{p.code}</p>}
                  <p className="mt-0.5 line-clamp-2 font-semibold text-slate-900">{p.name}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={p.priority} prefix />
                {p.is_overdue && <Badge tone="red">Terlambat</Badge>}
                {Number(p.blocked_tasks) > 0 && (
                  <Badge tone="red">
                    <AlertTriangle className="mr-1 size-3" aria-hidden /> {p.blocked_tasks} terhambat
                  </Badge>
                )}
              </div>
              <ProgressBar value={Number(p.progress_pct)} className="mt-4" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="min-w-0 truncate">Pemilik: {p.owner_name ?? "—"}</span>
                <span className="tabular-nums">
                  {Number(p.total_tasks) === 0 ? "Belum ada task" : `${p.done_tasks}/${p.total_tasks} task selesai`}
                </span>
              </div>
              <p className={cn("mt-1 flex items-center gap-1 text-xs", p.is_overdue ? "font-medium text-red-600" : "text-slate-500")}>
                <CalendarClock className="size-3.5" aria-hidden />
                {p.target_date ? `Target ${formatDate(p.target_date)}` : "Belum ada target selesai"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
