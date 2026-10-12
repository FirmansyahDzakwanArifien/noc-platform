import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import {
  buttonClass,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  Forbidden,
  formatDateTime,
  Input,
  PageHeader,
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
  toDateTimeInput,
} from "@noc/ui";
import { INCIDENT_STATUSES, isOneOf, PRIORITIES, type Incident } from "@/lib/constants";
import { loadProfiles, loadSites } from "@/lib/data";
import { first } from "@/lib/util";
import { createIncident } from "./actions";

export const metadata = { title: "Incident" };

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

  const supabase = await createClient();
  let q = supabase.from("incidents").select("*").order("started_at", { ascending: false }).limit(200);
  if (status === "active") q = q.not("status", "in", "(resolved,closed)");
  else if (isOneOf(INCIDENT_STATUSES, status)) q = q.eq("status", status);
  if (isOneOf(PRIORITIES, severity)) q = q.eq("severity", severity);
  const [{ data }, profiles, sites] = await Promise.all([q, loadProfiles(supabase), loadSites(supabase)]);
  const rows = (data as Incident[] | null) ?? [];
  const canManage = auth.can("incident.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Incident" description="Gangguan dan penanganannya." />
      <Flash searchParams={sp} />

      {canManage && (
        <Card>
          <details>
            <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
              <CardTitle className="inline">+ Laporkan incident baru</CardTitle>
            </summary>
            <CardContent className="border-t border-slate-100">
              <form action={createIncident} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Judul" required className="sm:col-span-2">
                    <Input name="title" required placeholder="mis. Link uplink ISP A down" />
                  </Field>
                  <Field label="Site">
                    <Select name="site_id" defaultValue="">
                      <option value="">— Tidak spesifik —</option>
                      {sites.active.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Severity">
                    <Select name="severity" defaultValue="medium">
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Layanan terdampak">
                    <Input name="affected_service" />
                  </Field>
                  <Field label="Mulai (WIB)">
                    <Input type="datetime-local" name="started_at" defaultValue={toDateTimeInput()} />
                  </Field>
                  <Field label="Tiket eksternal">
                    <Input name="external_ticket" placeholder="Tiket ISP/vendor" />
                  </Field>
                  <Field label="Ditangani oleh">
                    <Select name="assigned_to" defaultValue="">
                      <option value="">— Belum ditugaskan —</option>
                      {profiles.active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Deskripsi" className="sm:col-span-2">
                    <Textarea name="description" rows={3} />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton>Simpan incident</SubmitButton>
                </div>
              </form>
            </CardContent>
          </details>
        </Card>
      )}

      <div>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div className="w-44">
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
          <div className="w-40">
            <Select name="severity" defaultValue={severity} aria-label="Severity">
              <option value="">Semua severity</option>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
          {(status || severity) && (
            <Link href="/incident" className={buttonClass("ghost")}>
              Reset
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <EmptyState title="Tidak ada incident" />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Tiket</TH>
                  <TH>Judul</TH>
                  <TH>Severity</TH>
                  <TH>Status</TH>
                  <TH>Site</TH>
                  <TH>Mulai</TH>
                  <TH>PIC</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((i) => (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={`/incident/${i.id}`} className="font-medium text-brand-600 hover:underline">
                        {i.ticket_no ?? "INC"}
                      </Link>
                    </TD>
                    <TD className="min-w-56">
                      <p className="text-slate-900">{i.title}</p>
                      {i.affected_service && <p className="text-xs text-slate-500">{i.affected_service}</p>}
                    </TD>
                    <TD>
                      <StatusBadge status={i.severity} />
                    </TD>
                    <TD>
                      <StatusBadge status={i.status} />
                    </TD>
                    <TD>{i.site_id ? sites.name(i.site_id) : "-"}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(i.started_at)}</TD>
                    <TD>{profiles.name(i.assigned_to)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
