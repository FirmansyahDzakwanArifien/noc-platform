import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Project, ProgressUpdate, ProjectTask } from "@noc/supabase/types";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  formatDate,
  Input,
  PageHeader,
  Select,
} from "@noc/ui";
import { addDays, first, isDateStr, isUuid, loadProfiles, todayWIB } from "@/lib/data";

export const metadata = { title: "Laporan" };

type UpdateRow = ProgressUpdate & {
  projects: Pick<Project, "id" | "code" | "name"> | null;
  project_tasks: Pick<ProjectTask, "title"> | null;
};

const LIMIT = 500;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string; project?: string; error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  await requireAuth();
  const supabase = await createClient();

  const today = todayWIB();
  const toParam = first(sp.sampai);
  const fromParam = first(sp.dari);
  let to = isDateStr(toParam) ? toParam : today;
  let from = isDateStr(fromParam) ? fromParam : addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  const projectParam = first(sp.project);
  const projectId = isUuid(projectParam) ? projectParam : "";

  let query = supabase
    .from("progress_updates")
    .select("*, projects(id, code, name), project_tasks(title)")
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (projectId) query = query.eq("project_id", projectId);

  const [{ data, error }, { data: projectData }, profiles] = await Promise.all([
    query,
    supabase.from("projects").select("id, code, name").order("name"),
    loadProfiles(supabase),
  ]);
  const rows = (data ?? []) as UpdateRow[];
  const projects = (projectData ?? []) as Pick<Project, "id" | "code" | "name">[];

  // Kelompokkan per tanggal laporan (urutan sudah terbaru dulu).
  const byDate = new Map<string, UpdateRow[]>();
  for (const r of rows) byDate.set(r.report_date, [...(byDate.get(r.report_date) ?? []), r]);

  const reporters = new Set(rows.map((r) => r.reported_by)).size;
  const projectCount = new Set(rows.map((r) => r.project_id)).size;
  const withBlockers = rows.filter((r) => r.blockers).length;

  const presets = [
    { label: "Hari ini", from: today, to: today },
    { label: "7 hari", from: addDays(today, -6), to: today },
    { label: "30 hari", from: addDays(today, -29), to: today },
  ];
  const presetHref = (f: string, t: string) =>
    `/laporan?${new URLSearchParams({ dari: f, sampai: t, ...(projectId ? { project: projectId } : {}) })}`;

  return (
    <div>
      <PageHeader title="Laporan" description="Rekap laporan progress semua project untuk laporan harian / mingguan." />
      <Flash searchParams={sp} />

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
            <Field label="Dari">
              <Input type="date" name="dari" defaultValue={from} max={today} />
            </Field>
            <Field label="Sampai">
              <Input type="date" name="sampai" defaultValue={to} />
            </Field>
            <Field label="Project">
              <Select name="project" defaultValue={projectId}>
                <option value="">Semua project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ` : ""}
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Tampilkan</Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <Link
                key={p.label}
                href={presetHref(p.from, p.to)}
                className={buttonClass(from === p.from && to === p.to ? "primary" : "secondary", "sm")}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Laporan" value={rows.length} />
        <Stat label="Project dilaporkan" value={projectCount} />
        <Stat label="Pelapor" value={reporters} />
        <Stat label="Dengan kendala" value={withBlockers} danger />
      </div>

      {error ? (
        <EmptyState title="Gagal memuat laporan" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada laporan" description={`Belum ada laporan progress pada ${formatDate(from)} – ${formatDate(to)}.`} />
      ) : (
        <div className="space-y-6">
          {rows.length >= LIMIT && (
            <p className="text-xs text-amber-700">Menampilkan {LIMIT} laporan terbaru. Persempit rentang tanggal untuk melihat semuanya.</p>
          )}
          {[...byDate.entries()].map(([date, items]) => (
            <Card key={date}>
              <CardHeader>
                <CardTitle>{formatLongDate(date)}</CardTitle>
                <span className="text-xs text-slate-500">{items.length} laporan</span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">
                  {items.map((u) => (
                    <li key={u.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {u.projects ? (
                          <Link href={`/${u.project_id}`} className="font-medium text-brand-600 hover:underline">
                            {u.projects.code ? `${u.projects.code} · ` : ""}
                            {u.projects.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">Project</span>
                        )}
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-700">{profiles.name(u.reported_by)}</span>
                        {u.project_tasks && <Badge tone="blue">{u.project_tasks.title}</Badge>}
                        {u.progress_pct !== null && <Badge tone="green">{Number(u.progress_pct).toFixed(0)}%</Badge>}
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
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-semibold tabular-nums ${danger && value > 0 ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

/** "2026-10-12" → "Senin, 12 Oktober 2026" */
function formatLongDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
