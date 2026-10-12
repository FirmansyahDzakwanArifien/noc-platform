import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Project, ProgressUpdate, ProjectMember, ProjectMilestone, ProjectTask, Site } from "@noc/supabase/types";
import {
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
import { ArrowLeft, CheckCircle2, ChevronDown, CornerDownRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { ProjectFields } from "@/components/project-fields";
import { TaskQuickForm } from "@/components/task-quick-form";
import { MEMBER_ROLES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/constants";
import { isUuid, loadProfiles, todayWIB } from "@/lib/data";
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

type ProjectRow = Project & { sites: Pick<Site, "code" | "name"> | null };
type TaskRow = ProjectTask & { depth: number };

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
    supabase.from("projects").select("*, sites(code, name)").eq("id", id).maybeSingle(),
    supabase.from("project_members").select("*").eq("project_id", id),
    supabase.from("project_milestones").select("*").eq("project_id", id).order("sort_order").order("due_date"),
    supabase.from("project_tasks").select("*").eq("project_id", id).order("sort_order").order("created_at"),
    supabase
      .from("progress_updates")
      .select("*")
      .eq("project_id", id)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    loadProfiles(supabase),
    supabase.rpc("can_edit_project", { p_project: id }),
    supabase.from("sites").select("id, code, name").eq("is_active", true).order("code"),
  ]);

  const project = projRes.data as ProjectRow | null;
  if (!project) notFound();

  const members = (membersRes.data ?? []) as ProjectMember[];
  const milestones = (msRes.data ?? []) as ProjectMilestone[];
  const tasks = (tasksRes.data ?? []) as ProjectTask[];
  const updates = (updatesRes.data ?? []) as ProgressUpdate[];
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
  const children = new Map<string, ProjectTask[]>();
  for (const t of tasks) {
    if (t.parent_id && taskIds.has(t.parent_id)) {
      children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t]);
    }
  }
  const roots = tasks.filter((t) => !t.parent_id || !taskIds.has(t.parent_id));
  const flatten = (t: ProjectTask, depth: number, out: TaskRow[], seen: Set<string>) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push({ ...t, depth });
    for (const c of children.get(t.id) ?? []) flatten(c, depth + 1, out, seen);
  };
  const msIds = new Set(milestones.map((m) => m.id));
  const groups = [
    ...milestones.map((m) => ({ key: m.id, title: m.name, milestone: m as ProjectMilestone | null })),
    { key: "none", title: "Tanpa milestone", milestone: null },
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
  const isOverdue = !!project.target_date && project.target_date < today && project.status !== "done" && project.status !== "cancelled";

  const msStats = (msId: string) => {
    const ts = tasks.filter((t) => t.milestone_id === msId);
    return { total: ts.length, done: ts.filter((t) => t.status === "done").length };
  };

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua project
      </Link>
      <Flash searchParams={sp} />

      {/* ------------------------------------------------------------------ Header */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-400">{project.code ?? "—"}</p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{project.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={project.status} />
                <StatusBadge status={project.priority} />
                {project.category && <Badge tone="purple">{project.category}</Badge>}
                {isOverdue && <Badge tone="red">Terlambat</Badge>}
                {blockedCount > 0 && <Badge tone="red">{blockedCount} task terhambat</Badge>}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Info label="Pemilik" value={profiles.name(project.owner_id)} />
            <Info label="Site" value={project.sites ? `${project.sites.code} · ${project.sites.name}` : "—"} />
            <Info label="Mulai" value={formatDate(project.start_date)} />
            <Info label="Target" value={formatDate(project.target_date)} danger={isOverdue} />
            <Info label="Selesai" value={formatDate(project.finished_date)} />
            <Info label="Task selesai" value={`${doneCount}/${tasks.length}`} />
          </dl>

          {project.description && <p className="whitespace-pre-line text-sm text-slate-600">{project.description}</p>}

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Progress project</p>
            <ProgressBar value={Number(project.progress_pct)} className="[&>div:first-child]:h-3" />
          </div>

          {(canEdit || canManage) && (
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
              {canEdit && (
                <details className="group w-full">
                  <summary className={summaryClass}>
                    <Pencil className="size-4" aria-hidden /> Edit project
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <form action={updateProject.bind(null, id)} className="mt-4 space-y-4">
                    <ProjectFields sites={sites} project={project} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Status">
                        <Select name="status" defaultValue={project.status}>
                          {PROJECT_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tanggal selesai" hint="Terisi otomatis (hari ini) saat status Selesai.">
                        <Input type="date" name="finished_date" defaultValue={project.finished_date ?? ""} />
                      </Field>
                    </div>
                    <div className="flex justify-end">
                      <SubmitButton>Simpan perubahan</SubmitButton>
                    </div>
                  </form>
                </details>
              )}
              {canManage && (
                <details className="group">
                  <summary className={cn(summaryClass, "text-red-600")}>
                    <Trash2 className="size-4" aria-hidden /> Hapus project
                  </summary>
                  <form action={deleteProject.bind(null, id)} className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">
                      Semua milestone, task, dan laporan progress project ini akan ikut terhapus permanen.
                    </p>
                    <SubmitButton variant="danger" size="sm" className="mt-3" pendingText="Menghapus…">
                      Ya, hapus project
                    </SubmitButton>
                  </form>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Task ({tasks.length})</CardTitle>
          {canEdit && (
            <a href="#tambah-task" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              <Plus className="size-4" aria-hidden /> Tambah task
            </a>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Belum ada task.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Task</TH>
                  <TH>Assignee</TH>
                  <TH>Status</TH>
                  <TH>Prioritas</TH>
                  <TH className="text-right">Bobot</TH>
                  <TH>Tenggat</TH>
                  <TH className="min-w-40">Progress</TH>
                  <TH>Update</TH>
                </tr>
              </THead>
              <TBody>
                {groups.map((g) => (
                  <GroupRows key={g.key} title={g.title} milestone={g.milestone} count={g.rows.length}>
                    {g.rows.map((t) => {
                      const overdue = !!t.due_date && t.due_date < today && t.status !== "done";
                      const canUpdate = canEdit || t.assignee_id === me;
                      return (
                        <TR key={t.id} className={cn(t.status === "done" && "opacity-70")}>
                          <TD className="min-w-56">
                            <div className="flex items-start gap-1.5" style={{ paddingLeft: `${Math.min(t.depth, 4) * 1.25}rem` }}>
                              {t.depth > 0 && <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />}
                              <div className="min-w-0">
                                <p className={cn("font-medium text-slate-900", t.status === "done" && "line-through")}>{t.title}</p>
                                {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                              </div>
                            </div>
                          </TD>
                          <TD className="whitespace-nowrap">{profiles.name(t.assignee_id)}</TD>
                          <TD>
                            <StatusBadge status={t.status} />
                          </TD>
                          <TD>
                            <StatusBadge status={t.priority} />
                          </TD>
                          <TD className="text-right tabular-nums">{Number(t.weight)}</TD>
                          <TD className={cn("whitespace-nowrap", overdue && "font-medium text-red-600")}>{formatDate(t.due_date)}</TD>
                          <TD>
                            <ProgressBar value={Number(t.progress_pct)} />
                          </TD>
                          <TD>
                            <div className="flex items-center gap-1">
                              {canUpdate ? <TaskQuickForm task={t} back={back} /> : <span className="text-xs text-slate-400">—</span>}
                              {canEdit && (
                                <form action={deleteTask.bind(null, id)}>
                                  <input type="hidden" name="task_id" value={t.id} />
                                  <SubmitButton variant="ghost" size="sm" pendingText="…" aria-label={`Hapus task ${t.title}`} title="Hapus task">
                                    <Trash2 className="size-4 text-red-500" aria-hidden />
                                  </SubmitButton>
                                </form>
                              )}
                            </div>
                          </TD>
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
          <div id="tambah-task" className="border-t border-slate-100 px-5 py-4">
            <details className="group" open={tasks.length === 0}>
              <summary className={summaryClass}>
                <Plus className="size-4" aria-hidden /> Tambah task
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <form action={addTask.bind(null, id)} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Judul task" required className="sm:col-span-2">
                    <Input name="title" required maxLength={200} />
                  </Field>
                  <Field label="Deskripsi" className="sm:col-span-2">
                    <Textarea name="description" rows={2} />
                  </Field>
                  <Field label="Assignee" hint="Otomatis ditambahkan sebagai anggota project.">
                    <Select name="assignee_id" defaultValue="">
                      <option value="">— Belum ditentukan —</option>
                      {profiles.active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Milestone">
                    <Select name="milestone_id" defaultValue="">
                      <option value="">— Tanpa milestone / ikut parent —</option>
                      {milestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Parent task" hint="Isi untuk membuat subtask.">
                    <Select name="parent_id" defaultValue="">
                      <option value="">— Task utama —</option>
                      {orderedTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {"  ".repeat(t.depth)}
                          {t.depth > 0 ? "↳ " : ""}
                          {t.title}
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
                  <Field label="Prioritas">
                    <Select name="priority" defaultValue="medium">
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Bobot" hint="Kontribusi task utama terhadap % project.">
                    <Input type="number" name="weight" min={0.01} step={0.01} defaultValue={1} />
                  </Field>
                  <Field label="Tanggal mulai">
                    <Input type="date" name="start_date" />
                  </Field>
                  <Field label="Tenggat">
                    <Input type="date" name="due_date" />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton>Tambah task</SubmitButton>
                </div>
              </form>
            </details>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- Progress */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Laporan progress</CardTitle>
          </CardHeader>
          {canReport && (
            <div className="border-b border-slate-100 px-5 py-4">
              <details className="group" open={updates.length === 0}>
                <summary className={summaryClass}>
                  <Plus className="size-4" aria-hidden /> Laporkan progress
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <form action={addProgress.bind(null, id)} className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Task" hint="Opsional. Progress % akan diterapkan ke task ini.">
                      <Select name="task_id" defaultValue="">
                        <option value="">— Umum (project) —</option>
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
                      <Field label="Progress %">
                        <Input type="number" name="progress_pct" min={0} max={100} step={1} placeholder="0–100" />
                      </Field>
                      <Field label="Tanggal" required>
                        <Input type="date" name="report_date" defaultValue={today} max={today} required />
                      </Field>
                    </div>
                    <Field label="Yang dikerjakan" required className="sm:col-span-2">
                      <Textarea name="content" rows={3} required />
                    </Field>
                    <Field label="Kendala">
                      <Textarea name="blockers" rows={2} />
                    </Field>
                    <Field label="Rencana berikutnya">
                      <Textarea name="next_plan" rows={2} />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton pendingText="Mengirim…">Kirim laporan</SubmitButton>
                  </div>
                </form>
              </details>
            </div>
          )}
          <CardContent className="p-0">
            {updates.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Belum ada laporan progress.</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {updates.map((u) => (
                  <li key={u.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium text-slate-900">{formatDate(u.report_date)}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-700">{profiles.name(u.reported_by)}</span>
                      {u.task_id && <Badge tone="blue">{taskTitle.get(u.task_id) ?? "Task"}</Badge>}
                      {u.progress_pct !== null && <Badge tone="green">{Number(u.progress_pct).toFixed(0)}%</Badge>}
                      {(u.reported_by === me || canManage) && (
                        <form action={deleteProgress.bind(null, id)} className="ml-auto">
                          <input type="hidden" name="update_id" value={u.id} />
                          <SubmitButton variant="ghost" size="sm" pendingText="…" aria-label="Hapus laporan" title="Hapus laporan">
                            <Trash2 className="size-4 text-slate-400" aria-hidden />
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{u.content}</p>
                    {u.blockers && (
                      <p className="mt-2 whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                        <span className="font-medium">Kendala: </span>
                        {u.blockers}
                      </p>
                    )}
                    {u.next_plan && (
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Rencana: </span>
                        {u.next_plan}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-slate-400">Dikirim {formatDateTime(u.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* -------------------------------------------------------------- Anggota */}
          <Card>
            <CardHeader>
              <CardTitle>Anggota ({members.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">Belum ada anggota.</p>
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
                            <SubmitButton variant="ghost" size="sm" pendingText="…" aria-label="Hapus anggota" title="Hapus anggota">
                              <Trash2 className="size-4 text-slate-400" aria-hidden />
                            </SubmitButton>
                          </form>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
            {canEdit && (
              <form action={upsertMember.bind(null, id)} className="space-y-2 border-t border-slate-100 px-5 py-4">
                <p className="text-xs text-slate-500">Tambah anggota atau ubah role anggota yang sudah ada.</p>
                <Select name="user_id" required defaultValue="" aria-label="Anggota">
                  <option value="" disabled>
                    Pilih orang…
                  </option>
                  {profiles.active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <Select name="role" defaultValue="member" aria-label="Role" className="flex-1">
                    {MEMBER_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary">Simpan</SubmitButton>
                </div>
              </form>
            )}
          </Card>

          {/* -------------------------------------------------------------- Milestone */}
          <Card>
            <CardHeader>
              <CardTitle>Milestone ({milestones.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {milestones.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">Belum ada milestone.</p>
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
                          <p className={cn("font-medium text-slate-900", m.completed_at && "text-slate-500 line-through")}>{m.name}</p>
                          <p className={cn("text-xs", late ? "font-medium text-red-600" : "text-slate-500")}>
                            {m.completed_at
                              ? `Selesai ${formatDate(m.completed_at)}`
                              : `Tenggat ${formatDate(m.due_date)}${late ? " · terlambat" : ""}`}
                            {st.total > 0 && ` · ${st.done}/${st.total} task`}
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
                              <SubmitButton variant="ghost" size="sm" pendingText="…" title="Hapus milestone" aria-label="Hapus milestone">
                                <Trash2 className="size-4 text-slate-400" aria-hidden />
                              </SubmitButton>
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
              <form action={addMilestone.bind(null, id)} className="space-y-2 border-t border-slate-100 px-5 py-4">
                <Input name="name" required maxLength={200} placeholder="Nama milestone" aria-label="Nama milestone" />
                <div className="flex gap-2">
                  <Input type="date" name="due_date" aria-label="Tenggat milestone" className="flex-1" />
                  <SubmitButton variant="secondary">Tambah</SubmitButton>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function roleRank(role: ProjectMember["role"]) {
  return role === "lead" ? 0 : role === "reviewer" ? 1 : 2;
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn("truncate font-medium", danger ? "text-red-600" : "text-slate-900")}>{value}</dd>
    </div>
  );
}

function GroupRows({
  title,
  milestone,
  count,
  children,
}: {
  title: string;
  milestone: ProjectMilestone | null;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {title}
          {milestone?.due_date && <span className="ml-2 font-normal normal-case text-slate-400">tenggat {formatDate(milestone.due_date)}</span>}
          {milestone?.completed_at && (
            <Badge tone="green" className="ml-2 normal-case">
              Selesai
            </Badge>
          )}
        </td>
      </tr>
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
