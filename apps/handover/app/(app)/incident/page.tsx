import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import {
  buttonClass,
  Card,
  cn,
  EmptyState,
  Flash,
  Forbidden,
  formatDateTime,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { Plus } from "lucide-react";
import { DivisionBadge } from "@/components/division-badge";
import {
  INCIDENT_CATEGORIES,
  incidentCategoryLabel,
  INCIDENT_STATUSES,
  isOneOf,
  PRIORITIES,
  SEVERITY_COLOR,
  type Incident,
} from "@/lib/constants";
import { loadDivisions, loadProfiles, loadSites } from "@/lib/data";
import { first } from "@/lib/util";

export const metadata = { title: "Incident" };

type Row = Pick<
  Incident,
  | "id"
  | "ticket_no"
  | "title"
  | "severity"
  | "status"
  | "site_id"
  | "affected_service"
  | "started_at"
  | "assigned_to"
  | "division_id"
  | "category"
>;

export default async function IncidentListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("incident.view")) return <Forbidden />;

  const status = first(sp.status) ?? "";
  const severity = first(sp.severity) ?? "";
  const divisi = first(sp.divisi) ?? "";
  const kategori = first(sp.kategori) ?? "";
  const filtered = !!(status || severity || divisi || kategori);

  const supabase = await createClient();
  const divisions = await loadDivisions(supabase);
  let q = supabase
    .from("incidents")
    .select("id, ticket_no, title, severity, status, site_id, affected_service, started_at, assigned_to, division_id, category")
    .order("started_at", { ascending: false })
    .limit(200);
  if (status === "active") q = q.not("status", "in", "(resolved,closed)");
  else if (isOneOf(INCIDENT_STATUSES, status)) q = q.eq("status", status);
  if (isOneOf(PRIORITIES, severity)) q = q.eq("severity", severity);
  // ?divisi=<kode divisi> atau ?divisi=umum (tanpa divisi).
  const divisionFilter = divisions.byCode(divisi);
  if (divisi === "umum") q = q.is("division_id", null);
  else if (divisionFilter) q = q.eq("division_id", divisionFilter.id);
  if (isOneOf(INCIDENT_CATEGORIES, kategori)) q = q.eq("category", kategori);
  const [{ data }, profiles, sites] = await Promise.all([q, loadProfiles(supabase), loadSites(supabase)]);
  const rows = (data as Row[] | null) ?? [];
  const canManage = auth.can("incident.manage");
  const isDone = (s: string) => s === "resolved" || s === "closed";

  return (
    <div>
      <PageHeader
        title="Incident"
        description="Gangguan jaringan/layanan beserta perkembangan penanganannya, agar mudah dilanjutkan lintas shift."
        actions={
          canManage && (
            <Link href="/incident/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Laporkan incident
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-44">
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="">Semua status</option>
            <option value="active">Belum selesai</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select name="severity" defaultValue={severity} aria-label="Tingkat keparahan">
            <option value="">Semua severity</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select name="divisi" defaultValue={divisionFilter?.code ?? (divisi === "umum" ? "umum" : "")} aria-label="Divisi">
            <option value="">Semua divisi</option>
            {divisions.list.map((d) => (
              <option key={d.id} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
            <option value="umum">Umum</option>
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select name="kategori" defaultValue={kategori} aria-label="Kategori">
            <option value="">Semua kategori</option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Terapkan
        </button>
        {filtered && (
          <Link href="/incident" className={buttonClass("ghost")}>
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Tidak ada incident yang cocok"
            description="Coba ubah atau reset filter status, severity, divisi, dan kategori."
            action={
              <Link href="/incident" className={buttonClass("secondary")}>
                Reset filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Belum ada incident"
            description="Incident dicatat saat terjadi gangguan, lalu perkembangannya diperbarui sampai selesai."
            action={
              canManage && (
                <Link href="/incident/baru" className={buttonClass()}>
                  <Plus className="size-4" aria-hidden /> Laporkan incident
                </Link>
              )
            }
          />
        )
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Incident</TH>
                <TH className="hidden sm:table-cell">Severity</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Site</TH>
                <TH className="hidden md:table-cell">Mulai</TH>
                <TH className="hidden lg:table-cell">Ditangani oleh</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((i) => (
                <TR key={i.id} className={cn(isDone(i.status) && "text-slate-500")}>
                  <TD className="relative sm:min-w-64">
                    {/* Garis warna severity */}
                    <span className={cn("absolute inset-y-2 left-0 w-1 rounded-r", SEVERITY_COLOR[i.severity])} aria-hidden />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/incident/${i.id}`} className="font-medium text-brand-600 hover:underline">
                        {i.ticket_no ?? "INC"}
                      </Link>
                      <DivisionBadge code={divisions.code(i.division_id)} />
                      {i.category && (
                        <span className={cn("text-xs", i.category === "keamanan" ? "font-medium text-violet-700" : "text-slate-500")}>
                          {incidentCategoryLabel(i.category)}
                        </span>
                      )}
                    </div>
                    <p className={cn("break-words", isDone(i.status) ? "text-slate-500" : "text-slate-900")}>{i.title}</p>
                    {i.affected_service && <p className="text-xs text-slate-500">Terdampak: {i.affected_service}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 md:hidden">
                      <span className="sm:hidden">
                        <StatusBadge status={i.severity} />
                      </span>
                      <span>Mulai {formatDateTime(i.started_at)}</span>
                    </div>
                  </TD>
                  <TD className="hidden sm:table-cell">
                    <StatusBadge status={i.severity} />
                  </TD>
                  <TD>
                    <StatusBadge status={i.status} />
                  </TD>
                  <TD className="hidden lg:table-cell">{i.site_id ? sites.name(i.site_id) : "-"}</TD>
                  <TD className="hidden whitespace-nowrap md:table-cell">{formatDateTime(i.started_at)}</TD>
                  <TD className="hidden lg:table-cell">
                    {i.assigned_to ? (
                      profiles.name(i.assigned_to)
                    ) : (
                      <span className={isDone(i.status) ? "text-slate-400" : "text-amber-700"}>Belum ditugaskan</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {rows.length === 200 && (
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              Menampilkan 200 incident terbaru. Gunakan filter untuk mempersempit.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
