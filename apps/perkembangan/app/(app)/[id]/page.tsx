import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Project, ProgressUpdate, ProjectMember, ProjectMilestone, ProjectTask, Site } from "@noc/supabase/types";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Flash,
  formatDate,
  formatDateTime,
  Input,
  ProgressBar,
  Select,
  StatusBadge,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from "@noc/ui";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CornerDownRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { PriorityBadge, TaskStatusBadge } from "@/components/badges";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ProjectFields } from "@/components/project-fields";
import { TaskQuickForm } from "@/components/task-quick-form";
import { MEMBER_ROLES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/constants";
import { daysBetween, formatLongDate, isUuid, loadProfiles, todayWIB } from "@/lib/data";
import {
  addMilestone,
  addProgress,
  addTask,
  deleteMilestone,
  deleteProgress,
  deleteProject,
  deleteTask,
  removeMember,
  toggleMilestone,
  updateProject,
  upsertMember,
} from "./actions";

export const metadata = { title: "Detail project" };

type ProjectRow = Omit<Project, "created_at"> & { sites: Pick<Site, "code" | "name"> | null };
type MemberRow = Pick<ProjectMember, "user_id" | "role">;
type MilestoneRow = Pick<ProjectMilestone, "id" | "name" | "due_date" | "completed_at">;
type Task = Pick<
  ProjectTask,
  "id" | "parent_id" | "milestone_id" | "title" | "description" | "assignee_id" | "status" | "priority" | "weight" | "progress_pct" | "due_date"
>;
type TaskRow = Task & { depth: number };
type UpdateRow = Pick<
  ProgressUpdate,
  "id" | "task_id" | "reported_by" | "report_date" | "progress_pct" | "content" | "blockers" | "next_plan" | "created_at"
>;

const UPDATE_LIMIT = 100;

const summaryClass =
  "flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline [&::-webkit-details-marker]:hidden";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();

  const auth = await requireAuth();
  const supabase = await createClient();

  const [projRes, membersRes, msRes, tasksRes, updatesRes, profiles, canEditRes, sitesRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, code, name, description, category, site_id, owner_id, status, priority, start_date, target_date, finished_date, progress_pct, sites(code, name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("project_members").select("user_id, role").eq("project_id", id),
    supabase.from("project_milestones").select("id, name, due_date, completed_at").eq("project_id", id).order("sort_order").order("due_date"),
    supabase
      .from("project_tasks")
      .select("id, parent_id, milestone_id, title, description, assignee_id, status, priority, weight, progress_pct, due_date")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("progress_updates")
      .select("id, task_id, reported_by, report_date, progress_pct, content, blockers, next_plan, created_at")
      .eq("project_id", id)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(UPDATE_LIMIT),
    loadProfiles(supabase),
    supabase.rpc("can_edit_project", { p_project: id }),
    supabase.from("sites").select("id, code, name").eq("is_active", true).order("code"),
  ]);

  const project = projRes.data as unknown as ProjectRow | null;
  if (!project) notFound();

  const members = (membersRes.data ?? []) as MemberRow[];
  const milestones = (msRes.data ?? []) as MilestoneRow[];
  const tasks = (tasksRes.data ?? []) as Task[];
  const updates = (updatesRes.data ?? []) as UpdateRow[];
  const sites = (sitesRes.data ?? []) as Pick<Site, "id" | "code" | "name">[];

  const me = auth.userId;
  const isMember = members.some((m) => m.user_id === me);
  // Sama dengan fungsi DB can_edit_project; fallback lokal bila RPC gagal.
  const canEdit = canEditRes.error
    ? auth.can("project.manage") || project.owner_id === me || members.some((m) => m.user_id === me && m.role === "lead")
    : canEditRes.data === true;
  const canManage = auth.can("project.manage");
  const canReport = auth.can("progress.report") && (isMember || canEdit);
  const today = todayWIB();
  const back = `/${id}`;

  // ---- Task tree, dikelompokkan per milestone (subtask ikut kelompok parent) ----
  const taskIds = new Set(tasks.map((t) => t.id));
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id && taskIds.has(t.parent_id)) {
      children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t]);
    }
  }
  const roots = tasks.filter((t) => !t.parent_id || !taskIds.has(t.parent_id));
  const flatten = (t: Task, depth: number, out: TaskRow[], seen: Set<string>) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push({ ...t, depth });
    for (const c of children.get(t.id) ?? []) flatten(c, depth + 1, out, seen);
  };
  const msIds = new Set(milestones.map((m) => m.id));
  const groups = [
    ...milestones.map((m) => ({ key: m.id, title: m.name, milestone: m as MilestoneRow | null })),
    { key: "none", title: milestones.length ? "Tanpa milestone" : "Semua task", milestone: null },
  ]
    .map((g) => {
      const rows: TaskRow[] = [];
      const seen = new Set<string>();
      roots
        .filter((t) => (g.milestone ? t.milestone_id === g.milestone.id : !t.milestone_id || !msIds.has(t.milestone_id)))
        .forEach((t) => flatten(t, 0, rows, seen));
      return { ...g, rows };
    })
    .filter((g) => g.rows.length > 0 || g.milestone);

  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const orderedTasks = groups.flatMap((g) => g.rows);
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const blockedCount = tasks.filter((t) => t.status === "blocked").length;
  const lateTaskCount = tasks.filter((t) => isLate(t, today)).length;
  const isOverdue = !!project.target_date && project.target_date < today && project.status !== "done" && project.status !== "cancelled";
  const daysLeft = project.target_date ? daysBetween(today, project.target_date) : null;
  // Kolom "Ubah" hanya ditampilkan bila user bisa memperbarui minimal satu task.
  const showUpdateCol = canEdit || tasks.some((t) => t.assignee_id === me);

  const msStats = (msId: string) => {
    const ts = tasks.filter((t) => t.milestone_id === msId);
    return { total: ts.length, done: ts.filter((t) => t.status === "done").length };
  };

  // Laporan dikelompokkan per tanggal (urutan sudah terbaru dulu).
  const updatesByDate = new Map<string, UpdateRow[]>();
  for (const u of updates) updatesByDate.set(u.report_date, [...(updatesByDate.get(u.report_date) ?? []), u]);

  const taskOptions = orderedTasks.map((t) => (
    <option key={t.id} value={t.id}>
      {"  ".repeat(t.depth)}
      {t.depth > 0 ? "↳ " : ""}
      {t.title}
    </option>
  ));

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua project
      </Link>
      <Flash searchParams={sp} />

      {/* ------------------------------------------------------------------ Ringkasan */}
      <Card>
        <CardContent className="space-y-5">
          <div className="min-w-0">
            {project.code && <p className="text-xs font-medium text-slate-400">{project.code}</p>}
            <h1 className="mt-0.5 break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} prefix />
              {project.category && <Badge tone="purple">{project.category}</Badge>}
            </div>
          </div>

          {isOverdue && (
            <Alert tone="error" className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Project melewati target selesai ({formatDate(project.target_date)}) sejak {-(daysLeft ?? 0)} hari lalu.
                {canEdit && " Perbarui target atau status project bila rencananya berubah."}
              </span>
            </Alert>
          )}
          {!isOverdue && blockedCount > 0 && (
            <Alert tone="warning" className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{blockedCount} task berstatus Terhambat. Cek kendala di laporan progress.</span>
            </Alert>
          )}

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Progress project</p>
              <p className="text-xs text-slate-500">dihitung otomatis dari task utama sesuai bobotnya</p>
            </div>
            <ProgressBar value={Number(project.progress_pct)} className="[&>div:first-child]:h-3" />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Info label="Pemilik" value={profiles.name(project.owner_id)} />
            <Info label="Site" value={project.sites ? `${project.sites.code} · ${project.sites.name}` : "—"} />
            <Info label="Mulai" value={formatDate(project.start_date)} />
            <Info
              label="Target selesai"
              value={formatDate(project.target_date)}
              sub={
                project.status === "done" || project.status === "cancelled" || daysLeft === null
                  ? undefined
                  : isOverdue
                    ? `terlambat ${-daysLeft} hari`
                    : daysLeft === 0
                      ? "hari ini"
                      : `${daysLeft} hari lagi`
              }
              danger={isOverdue}
            />
            {project.finished_date ? (
              <Info label="Selesai pada" value={formatDate(project.finished_date)} />
            ) : (
              <Info label="Anggota" value={`${members.length} orang`} />
            )}
            <Info
              label="Task selesai"
              value={`${doneCount} dari ${tasks.length}`}
              sub={[blockedCount && `${blockedCount} terhambat`, lateTaskCount && `${lateTaskCount} lewat tenggat`].filter(Boolean).join(" · ") || undefined}
              danger={blockedCount + lateTaskCount > 0}
            />
          </dl>

          {project.description && <p className="whitespace-pre-line break-words text-sm text-slate-600">{project.description}</p>}

          {(canEdit || canManage) && (
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
              {canEdit && (
                <details className="group w-full">
                  <summary className={summaryClass}>
                    <Pencil className="size-4" aria-hidden /> Edit data &amp; status project
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <form action={updateProject.bind(null, id)} className="mt-4 space-y-6">
                    <ProjectFields sites={sites} project={project} />
                    <fieldset className="grid gap-4 sm:grid-cols-2">
                      <legend className="mb-3 text-sm font-semibold text-slate-900">Status</legend>
                      <Field label="Status project">
                        <Select name="status" defaultValue={project.status}>
                          {PROJECT_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tanggal selesai" hint="Hanya dipakai bila status Selesai. Kosongkan untuk mengisi otomatis hari ini.">
                        <Input type="date" name="finished_date" defaultValue={project.finished_date ?? ""} />
                      </Field>
                    </fieldset>
                    <div className="flex justify-end">
                      <SubmitButton>Simpan perubahan</SubmitButton>
                    </div>
                  </form>
                </details>
              )}
              {canManage && (
                <form action={deleteProject.bind(null, id)}>
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    className="px-0 text-red-600 hover:bg-transparent hover:underline"
                    pendingText="Menghapus…"
                    confirm={`Hapus project "${project.name}"?\n\nSemua milestone, task, dan laporan progress di dalamnya ikut terhapus permanen.`}
                  >
                    <Trash2 className="size-4" aria-hidden /> Hapus project
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ Task */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Task</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              {tasks.length === 0
                ? "Pekerjaan yang perlu diselesaikan dalam project ini."
                : `${doneCount} dari ${tasks.length} task selesai${milestones.length ? " · dikelompokkan per milestone" : ""}`}
            </p>
          </div>
          {canEdit && tasks.length > 0 && (
            <a href="#tambah-task" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              <Plus className="size-4" aria-hidden /> Tambah task
            </a>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="font-medium text-slate-900">Belum ada task</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                {canEdit
                  ? "Pecah project menjadi task agar progress bisa dihitung. Isi form di bawah untuk menambahkan task pertama."
                  : "Progress project akan terhitung setelah ketua project menambahkan task."}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Task</TH>
                  <TH className="hidden md:table-cell">PIC</TH>
                  <TH className="hidden sm:table-cell">Status</TH>
                  <TH className="hidden lg:table-cell">Prioritas</TH>
                  <TH className="hidden text-right lg:table-cell" title="Pengaruh task utama terhadap % project">
                    Bobot
                  </TH>
                  <TH className="hidden sm:table-cell">Tenggat</TH>
                  <TH className={cn("min-w-36", showUpdateCol && "hidden xl:table-cell")}>Progress</TH>
                  {showUpdateCol && <TH>Ubah status &amp; progress</TH>}
                </tr>
              </THead>
              <TBody>
                {groups.map((g) => (
                  <GroupRows key={g.key} title={g.title} milestone={g.milestone} count={g.rows.length} showTitle={milestones.length > 0}>
                    {g.rows.map((t) => {
                      const late = isLate(t, today);
                      const canUpdate = canEdit || t.assignee_id === me;
                      return (
                        <TR key={t.id} className={cn(late && "bg-red-50/60", t.status === "done" && "opacity-70")}>
                          <TD className="min-w-44">
                            <div className="flex items-start gap-1.5" style={{ paddingLeft: `${Math.min(t.depth, 4) * 1.25}rem` }}>
                              {t.depth > 0 && <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-label="Subtask" />}
                              <div className="min-w-0">
                                <p className={cn("break-words font-medium text-slate-900", t.status === "done" && "line-through")}>{t.title}</p>
                                {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                                {/* Info ringkas untuk layar kecil (kolom lain disembunyikan) */}
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 md:hidden">
                                  <span className="sm:hidden">
                                    <TaskStatusBadge status={t.status} />
                                  </span>
                                  <span>PIC: {profiles.name(t.assignee_id)}</span>
                                  {t.due_date && (
                                    <span className={cn("sm:hidden", late && "font-semibold text-red-600")}>
                                      Tenggat {formatDate(t.due_date)}
                                      {late && " · terlambat"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TD>
                          <TD className="hidden whitespace-nowrap md:table-cell">{profiles.name(t.assignee_id)}</TD>
                          <TD className="hidden sm:table-cell">
                            <TaskStatusBadge status={t.status} />
                          </TD>
                          <TD className="hidden lg:table-cell">
                            <PriorityBadge priority={t.priority} />
                          </TD>
                          <TD className="hidden text-right tabular-nums lg:table-cell">
                            {t.depth === 0 ? Number(t.weight) : <span className="text-slate-300">—</span>}
                          </TD>
                          <TD className={cn("hidden whitespace-nowrap sm:table-cell", late && "font-medium text-red-600")}>
                            {formatDate(t.due_date)}
                            {late && <p className="text-xs font-normal">Terlambat</p>}
                          </TD>
                          <TD className={cn(showUpdateCol && "hidden xl:table-cell")}>
                            <ProgressBar value={Number(t.progress_pct)} />
                          </TD>
                          {showUpdateCol && (
                            <TD>
                              <div className="flex items-center gap-1">
                                {canUpdate ? (
                                  <TaskQuickForm task={t} back={back} />
                                ) : (
                                  <span className="text-xs tabular-nums text-slate-500">{Number(t.progress_pct).toFixed(0)}%</span>
                                )}
                                {canEdit && (
                                  <form action={deleteTask.bind(null, id)}>
                                    <input type="hidden" name="task_id" value={t.id} />
                                    <ConfirmSubmit
                                      variant="ghost"
                                      size="sm"
                                      pendingText="…"
                                      aria-label={`Hapus task ${t.title}`}
                                      title="Hapus task"
                                      confirm={`Hapus task "${t.title}"?\n\nSubtask dan laporan progress yang terkait ikut terhapus.`}
                                    >
                                      <Trash2 className="size-4 text-red-500" aria-hidden />
                                    </ConfirmSubmit>
                                  </form>
                                )}
                              </div>
                            </TD>
                          )}
                        </TR>
                      );
                    })}
                  </GroupRows>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>

        {canEdit && (
          <div id="tambah-task" className="scroll-mt-20 border-t border-slate-100 px-5 py-4">
            <details className="group" open={tasks.length === 0}>
              <summary className={summaryClass}>
                <Plus className="size-4" aria-hidden /> Tambah task
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <form action={addTask.bind(null, id)} className="mt-4 space-y-6">
                <fieldset className="grid gap-4 sm:grid-cols-2">
                  <legend className="mb-3 text-sm font-semibold text-slate-900">Pekerjaan</legend>
                  <Field label="Judul task" required className="sm:col-span-2">
                    <Input name="title" required maxLength={200} placeholder="mis. Konfigurasi BGP di router baru" />
                  </Field>
                  <Field label="Deskripsi" className="sm:col-span-2">
                    <Textarea name="description" rows={2} placeholder="Detail pekerjaan, langkah, atau referensi (opsional)" />
                  </Field>
                  <Field label="PIC (penanggung jawab)" hint="Otomatis ditambahkan sebagai anggota project.">
                    <Select name="assignee_id" defaultValue="">
                      <option value="">— Belum ditentukan —</option>
                      {profiles.active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Bagian dari task" hint="Pilih task induk untuk membuat subtask.">
                    <Select name="parent_id" defaultValue="">
                      <option value="">— Task utama (bukan subtask) —</option>
                      {taskOptions}
                    </Select>
                  </Field>
                  <Field label="Milestone" hint={milestones.length ? "Subtask otomatis ikut milestone induknya." : "Belum ada milestone di project ini."}>
                    <Select name="milestone_id" defaultValue="" disabled={milestones.length === 0}>
                      <option value="">— Tanpa milestone —</option>
                      {milestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Status awal">
                    <Select name="status" defaultValue="todo">
                      {TASK_STATUSES.filter((s) => s.value !== "done").map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </fieldset>
                <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <legend className="mb-3 text-sm font-semibold text-slate-900">Prioritas &amp; jadwal</legend>
                  <Field label="Prioritas">
                    <Select name="priority" defaultValue="medium">
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Bobot"
                    hint="Seberapa besar task utama ini memengaruhi % project. Bobot 2 = dua kali bobot 1. Tidak berlaku untuk subtask."
                  >
                    <Input type="number" name="weight" min={0.01} max={9999} step={0.01} defaultValue={1} />
                  </Field>
                  <Field label="Tanggal mulai">
                    <Input type="date" name="start_date" />
                  </Field>
                  <Field label="Tenggat">
                    <Input type="date" name="due_date" />
                  </Field>
                </fieldset>
                <div className="flex justify-end">
                  <SubmitButton>Tambah task</SubmitButton>
                </div>
              </form>
            </details>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- Laporan progress */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Laporan progress</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Catatan pekerjaan harian tim, terbaru di atas.</p>
            </div>
          </CardHeader>
          {canReport ? (
            <div className="border-b border-slate-100 px-5 py-4">
              <details className="group" open={updates.length === 0}>
                <summary className={summaryClass}>
                  <Plus className="size-4" aria-hidden /> Kirim laporan progress
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <form action={addProgress.bind(null, id)} className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Yang dikerjakan" required className="sm:col-span-2">
                      <Textarea name="content" rows={3} required placeholder="mis. Instalasi perangkat di rak B2 selesai, tinggal uji koneksi." />
                    </Field>
                    <Field label="Task terkait" hint="Opsional. Kosongkan bila laporan untuk project secara umum.">
                      <Select name="task_id" defaultValue="">
                        <option value="">— Umum (tidak terkait task) —</option>
                        {orderedTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {"  ".repeat(t.depth)}
                            {t.depth > 0 ? "↳ " : ""}
                            {t.title} ({Number(t.progress_pct).toFixed(0)}%)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Progress task (%)" hint="Isi bila memilih task. 100% = selesai.">
                        <Input type="number" name="progress_pct" min={0} max={100} step={1} placeholder="0–100" />
                      </Field>
                      <Field label="Tanggal" required>
                        <Input type="date" name="report_date" defaultValue={today} max={today} required />
                      </Field>
                    </div>
                    <Field label="Kendala" hint="Opsional. Hal yang menghambat pekerjaan.">
                      <Textarea name="blockers" rows={2} />
                    </Field>
                    <Field label="Rencana berikutnya" hint="Opsional.">
                      <Textarea name="next_plan" rows={2} />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton pendingText="Mengirim…">Kirim laporan</SubmitButton>
                  </div>
                </form>
              </details>
            </div>
          ) : (
            auth.can("progress.report") && (
              <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
                Hanya anggota project yang dapat mengirim laporan. Minta ketua project menambahkan Anda sebagai anggota.
              </p>
            )
          )}
          <CardContent className="p-0">
            {updates.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                Belum ada laporan progress. Laporan yang dikirim anggota akan tampil di sini sebagai linimasa.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...updatesByDate.entries()].map(([date, items]) => (
                  <section key={date} className="px-5 py-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {date === today ? "Hari ini · " : ""}
                      {formatLongDate(date)}
                    </h3>
                    <ol className="space-y-4 border-l-2 border-slate-100 pl-4">
                      {items.map((u) => (
                        <li key={u.id} className="relative min-w-0">
                          <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="font-medium text-slate-900">{profiles.name(u.reported_by)}</span>
                            <span className="text-xs text-slate-400">dikirim {formatDateTime(u.created_at)}</span>
                            {(u.reported_by === me || canManage) && (
                              <form action={deleteProgress.bind(null, id)} className="ml-auto">
                                <input type="hidden" name="update_id" value={u.id} />
                                <ConfirmSubmit
                                  variant="ghost"
                                  size="sm"
                                  pendingText="…"
                                  aria-label="Hapus laporan"
                                  title="Hapus laporan"
                                  confirm="Hapus laporan progress ini? Progress task yang sudah diperbarui tidak ikut dikembalikan."
                                >
                                  <Trash2 className="size-4 text-slate-400" aria-hidden />
                                </ConfirmSubmit>
                              </form>
                            )}
                          </div>
                          {(u.task_id || u.progress_pct !== null) && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {u.task_id && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 [overflow-wrap:anywhere]">
                                  Task: {taskTitle.get(u.task_id) ?? "—"}
                                </span>
                              )}
                              {u.progress_pct !== null && <Badge tone="green">Progress {Number(u.progress_pct).toFixed(0)}%</Badge>}
                            </div>
                          )}
                          <p className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-700">{u.content}</p>
                          {u.blockers && (
                            <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                              <span className="font-medium">Kendala: </span>
                              {u.blockers}
                            </p>
                          )}
                          {u.next_plan && (
                            <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-600">
                              <span className="font-medium text-slate-700">Rencana berikutnya: </span>
                              {u.next_plan}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
                {updates.length >= UPDATE_LIMIT && (
                  <p className="px-5 py-3 text-xs text-slate-500">
                    Menampilkan {UPDATE_LIMIT} laporan terbaru.{" "}
                    <Link href={`/laporan?project=${id}`} className="font-medium text-brand-600 hover:underline">
                      Lihat laporan lain di halaman Laporan
                    </Link>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {/* -------------------------------------------------------------- Anggota */}
          <Card>
            <CardHeader>
              <CardTitle>Anggota ({members.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  Belum ada anggota. {canEdit ? "Tambahkan orang yang terlibat agar mereka bisa mengirim laporan." : ""}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {members
                    .slice()
                    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || profiles.name(a.user_id).localeCompare(profiles.name(b.user_id)))
                    .map((m) => (
                      <li key={m.user_id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate text-slate-800">
                          {profiles.name(m.user_id)}
                          {m.user_id === project.owner_id && <span className="ml-1 text-xs text-slate-400">(pemilik)</span>}
                        </span>
                        <Badge tone={m.role === "lead" ? "blue" : m.role === "reviewer" ? "purple" : "gray"}>
                          {MEMBER_ROLES.find((r) => r.value === m.role)?.label ?? m.role}
                        </Badge>
                        {canEdit && (
                          <form action={removeMember.bind(null, id)}>
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <ConfirmSubmit
                              variant="ghost"
                              size="sm"
                              pendingText="…"
                              aria-label={`Keluarkan ${profiles.name(m.user_id)}`}
                              title="Keluarkan dari project"
                              confirm={`Keluarkan ${profiles.name(m.user_id)} dari project ini?`}
                            >
                              <Trash2 className="size-4 text-slate-400" aria-hidden />
                            </ConfirmSubmit>
                          </form>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
            {canEdit && (
              <form action={upsertMember.bind(null, id)} className="space-y-3 border-t border-slate-100 px-5 py-4">
                <p className="text-sm font-medium text-slate-900">Tambah / ubah peran anggota</p>
                <Field label="Orang">
                  <Select name="user_id" required defaultValue="">
                    <option value="" disabled>
                      Pilih orang…
                    </option>
                    {profiles.active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Peran" hint={MEMBER_ROLES.map((r) => `${r.label}: ${r.hint}`).join(". ") + "."}>
                  <Select name="role" defaultValue="member">
                    {MEMBER_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton variant="secondary" className="w-full">
                  Simpan anggota
                </SubmitButton>
              </form>
            )}
          </Card>

          {/* -------------------------------------------------------------- Milestone */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Milestone ({milestones.length})</CardTitle>
                <p className="mt-0.5 text-xs text-slate-500">Tahapan penting project, mis. &ldquo;Instalasi selesai&rdquo;.</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {milestones.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  Belum ada milestone.{canEdit ? " Opsional — tambahkan bila project punya beberapa tahapan." : ""}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {milestones.map((m) => {
                    const st = msStats(m.id);
                    const late = !m.completed_at && !!m.due_date && m.due_date < today;
                    return (
                      <li key={m.id} className="flex items-start gap-2 px-5 py-3 text-sm">
                        <CheckCircle2
                          className={cn("mt-0.5 size-4 shrink-0", m.completed_at ? "text-emerald-500" : "text-slate-300")}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn("break-words font-medium text-slate-900", m.completed_at && "text-slate-500 line-through")}>{m.name}</p>
                          <p className={cn("text-xs", late ? "font-medium text-red-600" : "text-slate-500")}>
                            {m.completed_at
                              ? `Selesai ${formatDate(m.completed_at)}`
                              : m.due_date
                                ? `Tenggat ${formatDate(m.due_date)}${late ? " · terlambat" : ""}`
                                : "Tanpa tenggat"}
                            {st.total > 0 && ` · ${st.done}/${st.total} task selesai`}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 items-center">
                            <form action={toggleMilestone.bind(null, id)}>
                              <input type="hidden" name="milestone_id" value={m.id} />
                              <input type="hidden" name="complete" value={m.completed_at ? "0" : "1"} />
                              <SubmitButton
                                variant="ghost"
                                size="sm"
                                pendingText="…"
                                title={m.completed_at ? "Buka kembali" : "Tandai selesai"}
                                aria-label={m.completed_at ? "Buka kembali milestone" : "Tandai milestone selesai"}
                              >
                                {m.completed_at ? (
                                  <RotateCcw className="size-4 text-slate-500" aria-hidden />
                                ) : (
                                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                                )}
                              </SubmitButton>
                            </form>
                            <form action={deleteMilestone.bind(null, id)}>
                              <input type="hidden" name="milestone_id" value={m.id} />
                              <ConfirmSubmit
                                variant="ghost"
                                size="sm"
                                pendingText="…"
                                title="Hapus milestone"
                                aria-label="Hapus milestone"
                                confirm={`Hapus milestone "${m.name}"?\n\nTask di dalamnya tidak ikut terhapus, hanya dipindah ke "Tanpa milestone".`}
                              >
                                <Trash2 className="size-4 text-slate-400" aria-hidden />
                              </ConfirmSubmit>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
            {canEdit && (
              <form action={addMilestone.bind(null, id)} className="space-y-3 border-t border-slate-100 px-5 py-4">
                <p className="text-sm font-medium text-slate-900">Tambah milestone</p>
                <Field label="Nama milestone" required>
                  <Input name="name" required maxLength={200} placeholder="mis. Uji coba selesai" />
                </Field>
                <Field label="Tenggat">
                  <Input type="date" name="due_date" />
                </Field>
                <SubmitButton variant="secondary" className="w-full">
                  Tambah milestone
                </SubmitButton>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function isLate(t: Pick<Task, "due_date" | "status">, today: string) {
  return !!t.due_date && t.due_date < today && t.status !== "done";
}

function roleRank(role: ProjectMember["role"]) {
  return role === "lead" ? 0 : role === "reviewer" ? 1 : 2;
}

function Info({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn("truncate font-medium", danger ? "text-red-600" : "text-slate-900")}>{value}</dd>
      {sub && <dd className={cn("text-xs", danger ? "text-red-600" : "text-slate-500")}>{sub}</dd>}
    </div>
  );
}

function GroupRows({
  title,
  milestone,
  count,
  showTitle,
  children,
}: {
  title: string;
  milestone: MilestoneRow | null;
  count: number;
  showTitle: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {showTitle && (
        <tr className="bg-slate-50/80">
          <td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {milestone ? `Milestone: ${title}` : title}
            {milestone?.due_date && <span className="ml-2 font-normal normal-case text-slate-400">tenggat {formatDate(milestone.due_date)}</span>}
            {milestone?.completed_at && (
              <Badge tone="green" className="ml-2 normal-case">
                Selesai
              </Badge>
            )}
          </td>
        </tr>
      )}
      {count === 0 ? (
        <tr>
          <td colSpan={8} className="px-4 py-3 text-xs text-slate-400">
            Belum ada task di milestone ini.
          </td>
        </tr>
      ) : (
        children
      )}
    </>
  );
}
