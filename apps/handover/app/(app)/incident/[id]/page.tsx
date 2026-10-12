import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { HandoverItem } from "@noc/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Flash,
  Forbidden,
  formatDate,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  Textarea,
} from "@noc/ui";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { INCIDENT_STATUSES, PRIORITIES, SEVERITY_COLOR, SEVERITY_HINT, type Incident, type IncidentUpdate } from "@/lib/constants";
import { loadProfiles, loadSites } from "@/lib/data";
import { isUuid } from "@/lib/util";
import { addIncidentUpdate, deleteIncident, updateIncident } from "../actions";

export const metadata = { title: "Detail Incident" };

type RelatedItem = Pick<HandoverItem, "id" | "handover_id" | "title" | "status"> & {
  handovers: { handover_no: string | null; shift_date: string } | null;
};

/** Saran langkah berikutnya per status (untuk petugas yang menangani). */
const NEXT_STEP: Record<string, string> = {
  open: "Mulai investigasi, catat temuan di timeline, dan ubah status ke Investigasi.",
  investigating: "Catat perkembangan secara berkala. Ubah ke Mitigasi bila sudah ada solusi sementara.",
  mitigated: "Pastikan layanan benar-benar pulih, lalu ubah status ke Resolved.",
  resolved: "Lengkapi akar masalah & penyelesaian, lalu tutup incident (Closed).",
  closed: "Incident sudah ditutup.",
};

function duration(fromIso: string, toIso: string | null) {
  const ms = Math.max(0, (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime());
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return [d && `${d} hari`, h && `${h} jam`, `${m} menit`].filter(Boolean).join(" ");
}

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
    supabase
      .from("incident_updates")
      .select("id, status, content, created_by, created_at")
      .eq("incident_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    auth.can("handover.view")
      ? supabase
          .from("handover_items")
          .select("id, handover_id, title, status, handovers(handover_no, shift_date)")
          .eq("incident_id", id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    loadProfiles(supabase),
    loadSites(supabase),
  ]);
  if (!row) notFound();
  const inc = row as Incident;
  const updates = (updRows as Pick<IncidentUpdate, "id" | "status" | "content" | "created_by" | "created_at">[] | null) ?? [];
  const relatedItems = (related.data as RelatedItem[] | null) ?? [];
  const canManage = auth.can("incident.manage");
  const done = inc.status === "resolved" || inc.status === "closed";
  const statusLabel = INCIDENT_STATUSES.find((s) => s.value === inc.status)?.label ?? inc.status;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/incident" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Semua incident
        </Link>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {inc.ticket_no ?? "Incident"} <StatusBadge status={inc.status} />
            </span>
          }
          description={<span className="break-words text-base text-slate-700">{inc.title}</span>}
          actions={
            auth.can("incident.delete") && (
              <form action={deleteIncident}>
                <input type="hidden" name="id" value={inc.id} />
                <ConfirmSubmitButton
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  pendingText="Menghapus…"
                  confirm={`Hapus incident ${inc.ticket_no ?? ""} beserta seluruh timeline-nya? Tindakan ini tidak bisa dibatalkan.`}
                >
                  <Trash2 className="size-4" aria-hidden /> Hapus
                </ConfirmSubmitButton>
              </form>
            )
          }
        />
      </div>
      <Flash searchParams={sp} />

      {/* ---------------- Ringkasan: severity, durasi, langkah berikutnya ---------------- */}
      <Card className="relative overflow-hidden">
        <span className={cn("absolute inset-y-0 left-0 w-1.5", SEVERITY_COLOR[inc.severity])} aria-hidden />
        <CardContent className="grid gap-4 pl-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Severity</p>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={inc.severity} className="text-sm" />
            </div>
            <p className="mt-1 text-xs text-slate-500">{SEVERITY_HINT[inc.severity]}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{done ? "Durasi gangguan" : "Sudah berlangsung"}</p>
            <p className={cn("mt-1 font-semibold", done ? "text-slate-900" : "text-red-700")}>{duration(inc.started_at, inc.resolved_at)}</p>
            <p className="mt-1 text-xs text-slate-500">Sejak {formatDateTime(inc.started_at)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Ditangani oleh</p>
            <p className={cn("mt-1 font-semibold", inc.assigned_to ? "text-slate-900" : "text-amber-700")}>
              {inc.assigned_to ? profiles.name(inc.assigned_to) : "Belum ditugaskan"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Status: {statusLabel}</p>
          </div>
          {canManage && (
            <p className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-slate-700 sm:col-span-3">
              <strong>Langkah berikutnya:</strong>{" "}
              {!done && !inc.assigned_to ? "Tetapkan siapa yang menangani di panel Penanganan. " : ""}
              {NEXT_STEP[inc.status]}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Timeline penanganan</CardTitle>
              <span className="text-sm text-slate-500">{updates.length} catatan</span>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage && (
                <form action={addIncidentUpdate} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
                  <input type="hidden" name="incident_id" value={inc.id} />
                  <Field label="Perkembangan terbaru" required>
                    <Textarea name="content" rows={3} required placeholder="mis. Vendor sudah dispatch teknisi, ETA 45 menit." />
                  </Field>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <Field label="Ubah status" hint={`Saat ini: ${statusLabel}`} className="w-full sm:w-56">
                      <Select name="status" defaultValue="">
                        <option value="">Tidak berubah</option>
                        {INCIDENT_STATUSES.filter((s) => s.value !== inc.status).map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <SubmitButton pendingText="Menyimpan…">Tambah ke timeline</SubmitButton>
                  </div>
                </form>
              )}
              {updates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Belum ada catatan perkembangan.{canManage && " Tambahkan catatan pertama agar shift berikutnya tahu progres penanganan."}
                </p>
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
                            <span>· status menjadi</span>
                            <StatusBadge status={u.status} />
                          </>
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800">{u.content}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Info label="Site">{inc.site_id ? sites.name(inc.site_id) : "Tidak spesifik"}</Info>
                <Info label="Layanan terdampak">{inc.affected_service ?? "-"}</Info>
                <Info label="Mulai terjadi">{formatDateTime(inc.started_at)}</Info>
                <Info label="Terdeteksi">{formatDateTime(inc.detected_at)}</Info>
                <Info label="Selesai (resolved)">{inc.resolved_at ? formatDateTime(inc.resolved_at) : "Belum"}</Info>
                <Info label="No. tiket eksternal">{inc.external_ticket ?? "-"}</Info>
                <Info label="Pelapor">{profiles.name(inc.reported_by)}</Info>
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
                      <option value="">Belum ditugaskan</option>
                      {profiles.active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                          {p.id === auth.userId ? " (saya)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Severity" hint={SEVERITY_HINT[inc.severity]}>
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
                  <Field label="No. tiket eksternal" hint="Nomor tiket dari ISP/vendor.">
                    <Input name="external_ticket" defaultValue={inc.external_ticket ?? ""} />
                  </Field>
                  <Field label="Akar masalah" hint={done ? undefined : "Isi setelah penyebab diketahui."}>
                    <Textarea name="root_cause" rows={3} defaultValue={inc.root_cause ?? ""} />
                  </Field>
                  <Field label="Penyelesaian" hint={done ? undefined : "Tindakan yang memulihkan layanan."}>
                    <Textarea name="resolution" rows={3} defaultValue={inc.resolution ?? ""} />
                  </Field>
                  <p className="text-xs text-slate-500">Status diubah lewat Timeline agar setiap perubahan tercatat.</p>
                  <div className="flex justify-end">
                    <SubmitButton variant="secondary">Simpan penanganan</SubmitButton>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {relatedItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Item handover terkait</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">
                  {relatedItems.map((it) => (
                    <li key={it.id} className="px-5 py-3 text-sm">
                      <Link href={`/${it.handover_id}`} className="font-medium text-brand-600 hover:underline">
                        {it.handovers?.handover_no ?? "Handover"}
                      </Link>
                      {it.handovers && <span className="text-xs text-slate-500"> · {formatDate(it.handovers.shift_date)}</span>}
                      <p className="break-words text-slate-800">{it.title}</p>
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
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 break-words text-slate-900">{children}</div>
    </div>
  );
}
