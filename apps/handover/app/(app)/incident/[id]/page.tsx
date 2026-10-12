import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { HandoverItem } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Flash,
  Forbidden,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  Textarea,
} from "@noc/ui";
import { ArrowLeft, Trash2 } from "lucide-react";
import { INCIDENT_STATUSES, PRIORITIES, type Incident, type IncidentUpdate } from "@/lib/constants";
import { loadProfiles, loadSites } from "@/lib/data";
import { isUuid } from "@/lib/util";
import { addIncidentUpdate, deleteIncident, updateIncident } from "../actions";

export const metadata = { title: "Detail Incident" };

export default async function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("incident.view")) return <Forbidden />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [{ data: row }, { data: updRows }, related, profiles, sites] = await Promise.all([
    supabase.from("incidents").select("*").eq("id", id).maybeSingle(),
    supabase.from("incident_updates").select("*").eq("incident_id", id).order("created_at", { ascending: false }),
    auth.can("handover.view")
      ? supabase.from("handover_items").select("*, handovers(handover_no, shift_date)").eq("incident_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    loadProfiles(supabase),
    loadSites(supabase),
  ]);
  if (!row) notFound();
  const inc = row as Incident;
  const updates = (updRows as IncidentUpdate[] | null) ?? [];
  const relatedItems = (related.data as (HandoverItem & { handovers: { handover_no: string | null; shift_date: string } | null })[] | null) ?? [];
  const canManage = auth.can("incident.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inc.ticket_no ?? "Incident"} <StatusBadge status={inc.severity} /> <StatusBadge status={inc.status} />
          </span>
        }
        description={inc.title}
        actions={
          <>
            {auth.can("incident.delete") && (
              <form action={deleteIncident}>
                <input type="hidden" name="id" value={inc.id} />
                <SubmitButton variant="danger" pendingText="Menghapus…">
                  <Trash2 className="size-4" aria-hidden /> Hapus
                </SubmitButton>
              </form>
            )}
            <Link href="/incident" className={buttonClass("secondary")}>
              <ArrowLeft className="size-4" aria-hidden /> Kembali
            </Link>
          </>
        }
      />
      <Flash searchParams={sp} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Info label="Site">{inc.site_id ? sites.name(inc.site_id) : "-"}</Info>
                <Info label="Layanan terdampak">{inc.affected_service ?? "-"}</Info>
                <Info label="Mulai">{formatDateTime(inc.started_at)}</Info>
                <Info label="Terdeteksi">{formatDateTime(inc.detected_at)}</Info>
                <Info label="Resolved">{formatDateTime(inc.resolved_at)}</Info>
                <Info label="Tiket eksternal">{inc.external_ticket ?? "-"}</Info>
                <Info label="Pelapor">{profiles.name(inc.reported_by)}</Info>
                <Info label="Ditangani oleh">{profiles.name(inc.assigned_to)}</Info>
              </div>
              {inc.description && (
                <Info label="Deskripsi">
                  <span className="whitespace-pre-line">{inc.description}</span>
                </Info>
              )}
              {!canManage && (
                <>
                  <Info label="Akar masalah">
                    <span className="whitespace-pre-line">{inc.root_cause ?? "-"}</span>
                  </Info>
                  <Info label="Penyelesaian">
                    <span className="whitespace-pre-line">{inc.resolution ?? "-"}</span>
                  </Info>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage && (
                <form action={addIncidentUpdate} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
                  <input type="hidden" name="incident_id" value={inc.id} />
                  <Field label="Update" required>
                    <Textarea name="content" rows={3} required placeholder="Perkembangan penanganan…" />
                  </Field>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <Field label="Ubah status" className="w-48">
                      <Select name="status" defaultValue="">
                        <option value="">— Tetap —</option>
                        {INCIDENT_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <SubmitButton>Tambah update</SubmitButton>
                  </div>
                </form>
              )}
              {updates.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada update.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                  {updates.map((u) => (
                    <li key={u.id} className="relative">
                      <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{formatDateTime(u.created_at)}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-700">{profiles.name(u.created_by)}</span>
                        {u.status && (
                          <>
                            <span>→</span>
                            <StatusBadge status={u.status} />
                          </>
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{u.content}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Penanganan</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateIncident} className="space-y-3">
                  <input type="hidden" name="id" value={inc.id} />
                  <Field label="Ditangani oleh">
                    <Select name="assigned_to" defaultValue={inc.assigned_to ?? ""}>
                      <option value="">— Belum ditugaskan —</option>
                      {profiles.active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Severity">
                    <Select name="severity" defaultValue={inc.severity}>
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Layanan terdampak">
                    <Input name="affected_service" defaultValue={inc.affected_service ?? ""} />
                  </Field>
                  <Field label="Tiket eksternal">
                    <Input name="external_ticket" defaultValue={inc.external_ticket ?? ""} />
                  </Field>
                  <Field label="Akar masalah">
                    <Textarea name="root_cause" rows={3} defaultValue={inc.root_cause ?? ""} />
                  </Field>
                  <Field label="Penyelesaian">
                    <Textarea name="resolution" rows={3} defaultValue={inc.resolution ?? ""} />
                  </Field>
                  <div className="flex justify-end">
                    <SubmitButton variant="secondary">Simpan</SubmitButton>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {relatedItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Butir handover terkait</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">
                  {relatedItems.map((it) => (
                    <li key={it.id} className="px-5 py-3 text-sm">
                      <Link href={`/${it.handover_id}`} className="font-medium text-brand-600 hover:underline">
                        {it.handovers?.handover_no ?? "Handover"}
                      </Link>
                      <p className="text-slate-800">{it.title}</p>
                      <StatusBadge status={it.status} className="mt-1" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 text-slate-900">{children}</div>
    </div>
  );
}
