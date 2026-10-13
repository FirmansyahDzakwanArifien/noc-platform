import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Project, ProjectTask } from "@noc/supabase/types";
import { buttonClass, cn, EmptyState, Flash, formatDate, PageHeader, ProgressBar, Table, TBody, TD, TH, THead, TR } from "@noc/ui";
import { PriorityBadge, TaskStatusBadge } from "@/components/badges";
import { TaskQuickForm } from "@/components/task-quick-form";
import { first, todayWIB } from "@/lib/data";

export const metadata = { title: "Tugas Saya" };

type MyTask = Pick<ProjectTask, "id" | "project_id" | "title" | "description" | "status" | "priority" | "progress_pct" | "due_date"> & {
  projects: Pick<Project, "code" | "name"> | null;
};

const STATUS_ORDER: Record<string, number> = { blocked: 0, in_progress: 1, review: 2, todo: 3, done: 4 };

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tampil?: string; error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();
  const showDone = first(sp.tampil) === "semua";
  const today = todayWIB();

  let query = supabase
    .from("project_tasks")
    .select("id, project_id, title, description, status, priority, progress_pct, due_date, projects(code, name)")
    .eq("assignee_id", auth.userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(300);
  if (!showDone) query = query.neq("status", "done");
  const { data, error } = await query;

  const tasks = ((data ?? []) as unknown as MyTask[]).slice().sort((a, b) => {
    const doneA = a.status === "done" ? 1 : 0;
    const doneB = b.status === "done" ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const odA = isOverdue(a, today) ? 0 : 1;
    const odB = isOverdue(b, today) ? 0 : 1;
    return (
      odA - odB ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    );
  });
  const back = showDone ? "/tugas-saya?tampil=semua" : "/tugas-saya";
  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length;

  return (
    <div>
      <PageHeader
        title="Tugas Saya"
        description={
          <>
            Semua task yang ditugaskan ke Anda dari seluruh project. Perbarui status &amp; progress langsung di sini.
            {overdueCount > 0 && <span className="font-medium text-red-600"> {overdueCount} task lewat tenggat.</span>}
          </>
        }
        actions={
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200" aria-label="Tampilkan">
            <Link
              href="/tugas-saya"
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", !showDone ? "bg-brand-600 text-white" : "text-slate-600")}
            >
              Belum selesai
            </Link>
            <Link
              href="/tugas-saya?tampil=semua"
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", showDone ? "bg-brand-600 text-white" : "text-slate-600")}
            >
              Semua
            </Link>
          </div>
        }
      />
      <Flash searchParams={sp} />

      {error ? (
        <EmptyState
          title="Gagal memuat task"
          description={`Muat ulang halaman ini. Bila masih gagal, hubungi admin. (${error.message})`}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={showDone ? "Belum ada task untuk Anda" : "Semua task Anda sudah selesai"}
          description={
            showDone
              ? "Task akan muncul di sini setelah ketua project menugaskannya kepada Anda."
              : "Tidak ada task yang perlu dikerjakan. Pilih \"Semua\" untuk melihat task yang sudah selesai."
          }
          action={
            <Link href="/" className={buttonClass("secondary")}>
              Lihat daftar project
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200/70 bg-white shadow-soft">
          <Table>
            <THead>
              <tr>
                <TH>Task</TH>
                <TH className="hidden md:table-cell">Project</TH>
                <TH className="hidden sm:table-cell">Status</TH>
                <TH className="hidden lg:table-cell">Prioritas</TH>
                <TH className="hidden sm:table-cell">Tenggat</TH>
                <TH className="hidden min-w-40 lg:table-cell">Progress</TH>
                <TH>Ubah status &amp; progress</TH>
              </tr>
            </THead>
            <TBody>
              {tasks.map((t) => {
                const overdue = isOverdue(t, today);
                return (
                  <TR key={t.id} className={cn(overdue && "bg-red-50/60", t.status === "done" && "opacity-70")}>
                    <TD className="min-w-44">
                      <p className="font-medium text-slate-900">{t.title}</p>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                      {/* Info ringkas untuk layar kecil (kolom lain disembunyikan) */}
                      <div className="mt-1.5 space-y-1 text-xs md:hidden">
                        {t.projects && (
                          <Link href={`/${t.project_id}`} className="block text-brand-600 hover:underline">
                            {t.projects.name}
                          </Link>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
                          <TaskStatusBadge status={t.status} />
                          <span className={cn(overdue ? "font-semibold text-red-600" : "text-slate-500")}>
                            {t.due_date ? `Tenggat ${formatDate(t.due_date)}` : "Tanpa tenggat"}
                            {overdue && " · terlambat"}
                          </span>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden min-w-40 md:table-cell">
                      {t.projects ? (
                        <Link href={`/${t.project_id}`} className="text-brand-600 hover:underline">
                          {t.projects.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {t.projects?.code && <p className="text-xs text-slate-400">{t.projects.code}</p>}
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <TaskStatusBadge status={t.status} />
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <PriorityBadge priority={t.priority} />
                    </TD>
                    <TD className={cn("hidden whitespace-nowrap sm:table-cell", overdue && "font-semibold text-red-600")}>
                      {formatDate(t.due_date)}
                      {overdue && <p className="text-xs font-normal">Terlambat</p>}
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <ProgressBar value={Number(t.progress_pct)} />
                    </TD>
                    <TD>
                      <TaskQuickForm task={t} back={back} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Mengisi progress 100% otomatis menandai task Selesai. Untuk laporan lengkap (kendala, rencana berikutnya), buka project
        lalu gunakan &ldquo;Kirim laporan progress&rdquo;.
      </p>
    </div>
  );
}

function isOverdue(t: Pick<ProjectTask, "due_date" | "status">, today: string) {
  return !!t.due_date && t.due_date < today && t.status !== "done";
}
