import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Project, ProjectTask } from "@noc/supabase/types";
import { cn, EmptyState, Flash, formatDate, PageHeader, ProgressBar, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@noc/ui";
import { TaskQuickForm } from "@/components/task-quick-form";
import { first, todayWIB } from "@/lib/data";

export const metadata = { title: "Tugas Saya" };

type MyTask = ProjectTask & { projects: Pick<Project, "id" | "code" | "name" | "status"> | null };

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
    .select("*, projects(id, code, name, status)")
    .eq("assignee_id", auth.userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(300);
  if (!showDone) query = query.neq("status", "done");
  const { data, error } = await query;

  const tasks = ((data ?? []) as MyTask[]).slice().sort((a, b) => {
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
          overdueCount > 0 ? (
            <span>
              Task yang ditugaskan ke Anda · <span className="font-medium text-red-600">{overdueCount} lewat tenggat</span>
            </span>
          ) : (
            "Task yang ditugaskan ke Anda."
          )
        }
        actions={
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
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
        <EmptyState title="Gagal memuat task" description={error.message} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={showDone ? "Belum ada task untuk Anda" : "Tidak ada task terbuka"}
          description="Task yang ditugaskan kepada Anda di project mana pun akan tampil di sini."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <THead>
              <tr>
                <TH>Task</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Prioritas</TH>
                <TH>Tenggat</TH>
                <TH className="min-w-40">Progress</TH>
                <TH>Update</TH>
              </tr>
            </THead>
            <TBody>
              {tasks.map((t) => {
                const overdue = isOverdue(t, today);
                return (
                  <TR key={t.id} className={cn(overdue && "bg-red-50/60", t.status === "done" && "opacity-70")}>
                    <TD className="min-w-52">
                      <p className="font-medium text-slate-900">{t.title}</p>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                    </TD>
                    <TD className="min-w-40">
                      {t.projects ? (
                        <Link href={`/${t.project_id}`} className="text-brand-600 hover:underline">
                          {t.projects.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {t.projects?.code && <p className="text-xs text-slate-400">{t.projects.code}</p>}
                    </TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                    <TD>
                      <StatusBadge status={t.priority} />
                    </TD>
                    <TD className={cn("whitespace-nowrap", overdue && "font-semibold text-red-600")}>
                      {formatDate(t.due_date)}
                      {overdue && <p className="text-xs font-normal">Terlambat</p>}
                    </TD>
                    <TD>
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
        Untuk laporan lengkap (kendala, rencana berikutnya), buka project lalu gunakan &ldquo;Laporkan progress&rdquo;.
      </p>
    </div>
  );
}

function isOverdue(t: ProjectTask, today: string) {
  return !!t.due_date && t.due_date < today && t.status !== "done";
}
