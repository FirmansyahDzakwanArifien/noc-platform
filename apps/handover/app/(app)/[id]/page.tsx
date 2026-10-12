import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { ChecklistTemplate, ChecklistTemplateItem, Handover, HandoverChecklistResult, HandoverItem } from "@noc/supabase/types";
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
  Forbidden,
  formatDate,
  formatDateTime,
  Input,
  PageHeader,
  ProgressBar,
  Select,
  StatusBadge,
  SubmitButton,
  Textarea,
} from "@noc/ui";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CircleAlert, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CATEGORIES, ITEM_STATUSES, PRIORITIES, type Incident } from "@/lib/constants";
import { loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { first, isUuid } from "@/lib/util";
import {
  acknowledgeHandover,
  addItem,
  deleteHandover,
  deleteItem,
  returnHandover,
  saveChecklist,
  submitHandover,
  updateHandoverHeader,
  updateItemStatus,
} from "./actions";

export const metadata = { title: "Detail Handover" };

type Member = { user_id: string; side: "outgoing" | "incoming" };
type ItemRow = HandoverItem & { incidents: Pick<Incident, "ticket_no" | "title"> | null };
type ResultRow = Pick<HandoverChecklistResult, "template_item_id" | "value" | "is_ok" | "note"> & {
  checklist_template_items: { template_id: string } | null;
};

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Diajukan" },
  { key: "acknowledged", label: "Diterima" },
] as const;

export default async function HandoverDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("handover.view")) return <Forbidden />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  // Semua query yang hanya butuh ID handover dijalankan paralel.
  const [hRes, members, items, results, templates, incidents, profiles, shifts, sites] = await Promise.all([
    supabase.from("handovers").select("*").eq("id", id).maybeSingle(),
    supabase.from("handover_members").select("user_id, side").eq("handover_id", id),
    supabase
      .from("handover_items")
      .select("*, incidents(ticket_no, title)")
      .eq("handover_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("handover_checklist_results")
      .select("template_item_id, value, is_ok, note, checklist_template_items(template_id)")
      .eq("handover_id", id),
    supabase.from("checklist_templates").select("id, name, site_id, is_active").eq("is_active", true).order("name"),
    auth.can("incident.view")
      ? supabase
          .from("incidents")
          .select("id, ticket_no, title")
          .not("status", "in", "(resolved,closed)")
          .order("started_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    loadProfiles(supabase),
    loadShifts(supabase),
    loadSites(supabase),
  ]);
  if (!hRes.data) notFound();
  const h = hRes.data as Handover;

  const memberRows = (members.data as Member[] | null) ?? [];
  const itemRows = (items.data as ItemRow[] | null) ?? [];
  const resultRows = (results.data as ResultRow[] | null) ?? [];
  // Template aktif yang berlaku: umum + khusus site handover ini.
  const templateRows = ((templates.data as ChecklistTemplate[] | null) ?? []).filter((t) => !t.site_id || t.site_id === h.site_id);
  const openIncidents = (incidents.data as Pick<Incident, "id" | "ticket_no" | "title">[] | null) ?? [];

  const editable = h.status === "draft" || h.status === "returned";
  const canCreate = auth.can("handover.create");
  const canEdit = canCreate && editable;
  const isOutgoing = h.outgoing_by === auth.userId;
  const canSubmit = canEdit && isOutgoing;
  const canDecide = canCreate && h.status === "submitted" && !isOutgoing;

  // Template checklist yang ditampilkan: ?template= → template dari hasil tersimpan → template pertama.
  const usedTemplateId = resultRows.find((r) => r.checklist_template_items)?.checklist_template_items?.template_id;
  const wantedRaw = first(sp.template);
  const wanted = isUuid(wantedRaw) ? wantedRaw : undefined;
  let template: ChecklistTemplate | undefined =
    templateRows.find((t) => t.id === wanted) ?? templateRows.find((t) => t.id === usedTemplateId);
  const extraId = template ? undefined : (wanted ?? usedTemplateId);
  const pickedId = template?.id ?? extraId ?? templateRows[0]?.id;

  const loadTplItems = async (templateId: string) => {
    const { data } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", templateId)
      .order("section", { nullsFirst: true })
      .order("sort_order");
    return (data as ChecklistTemplateItem[] | null) ?? [];
  };
  let tplItems: ChecklistTemplateItem[] = [];
  if (pickedId) {
    // Template nonaktif / site lain yang sudah dipakai: ambil metadatanya bersamaan dengan item-nya.
    const [itemData, extra] = await Promise.all([
      loadTplItems(pickedId),
      extraId
        ? supabase.from("checklist_templates").select("id, name, site_id, is_active").eq("id", extraId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    template ??= (extra.data as ChecklistTemplate | null) ?? (extraId ? undefined : templateRows[0]);
    tplItems = itemData;
    if (!template && templateRows[0]) {
      // ?template= tidak valid → kembali ke template pertama.
      template = templateRows[0];
      tplItems = await loadTplItems(template.id);
    }
  }
  const tplOptions = template && !templateRows.some((t) => t.id === template!.id) ? [template, ...templateRows] : templateRows;

  const resultMap = new Map(resultRows.map((r) => [r.template_item_id, r]));
  const sections = groupBy(tplItems, (i) => i.section ?? "Umum");
  const filledCount = tplItems.filter((i) => resultMap.has(i.id)).length;
  const notOkCount = tplItems.filter((i) => resultMap.get(i.id)?.is_ok === false).length;
  const missingRequired = tplItems.filter((i) => i.is_required && !resultMap.has(i.id)).length;
  const openItemCount = itemRows.filter((i) => i.status === "open" || i.status === "in_progress").length;

  const back = `/${id}`;
  const outgoingName = profiles.name(h.outgoing_by);
  const incomingName = h.incoming_by ? profiles.name(h.incoming_by) : null;
  const outgoingMembers = memberRows.filter((m) => m.side === "outgoing");
  const incomingMembers = memberRows.filter((m) => m.side === "incoming");
  const stepIndex = h.status === "acknowledged" ? 2 : h.status === "submitted" ? 1 : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Semua handover
        </Link>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {h.handover_no ?? "Handover"} <StatusBadge status={h.status} />
            </span>
          }
          description={
            <span className="inline-flex flex-wrap items-center gap-1">
              {formatDate(h.shift_date)} · Shift {shifts.name(h.from_shift_id)} <ArrowRight className="size-3.5" aria-hidden />{" "}
              {shifts.name(h.to_shift_id)} · {sites.name(h.site_id)}
            </span>
          }
        />
      </div>
      <Flash searchParams={sp} />

      {h.status === "returned" && h.ack_note && (
        <Alert tone="warning">
          <strong>Dikembalikan oleh penerima:</strong> {h.ack_note}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------- Status & tindakan (tampil pertama di mobile) ---------------- */}
        <Card className="lg:order-last">
          <CardHeader>
            <CardTitle>Status & tindakan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ol className="flex items-center gap-2" aria-label="Tahapan handover">
              {STEPS.map((s, i) => {
                const doneStep = i < stepIndex || (i === stepIndex && h.status === "acknowledged");
                const current = i === stepIndex && !doneStep;
                return (
                  <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        doneStep ? "bg-emerald-600 text-white" : current ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500",
                      )}
                    >
                      {doneStep ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className={cn("truncate text-xs", current ? "font-semibold text-slate-900" : "text-slate-500")}>
                      {i === 0 && h.status === "returned" ? "Perbaikan" : s.label}
                    </span>
                    {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
                  </li>
                );
              })}
            </ol>

            <NextStep>
              {editable &&
                (isOutgoing && canCreate ? (
                  <>
                    <p className="font-medium text-slate-900">
                      {h.status === "returned" ? "Giliran Anda: perbaiki lalu ajukan ulang." : "Giliran Anda: lengkapi lalu ajukan."}
                    </p>
                    <ul className="mt-2 space-y-1">
                      <Check3 ok={!!h.incoming_by}>{incomingName ? `Penerima: ${incomingName}` : "Penerima belum ditentukan"}</Check3>
                      {template && tplItems.length > 0 && (
                        <Check3 ok={missingRequired === 0}>
                          {missingRequired === 0 ? "Checklist wajib sudah terisi" : `${missingRequired} item checklist wajib belum diisi`}
                        </Check3>
                      )}
                      <Check3 ok>{itemRows.length} item serah terima</Check3>
                    </ul>
                  </>
                ) : (
                  <p>
                    Menunggu <strong>{outgoingName}</strong> {h.status === "returned" ? "memperbaiki dan mengajukan ulang" : "melengkapi dan mengajukan"}{" "}
                    handover.
                  </p>
                ))}
              {h.status === "submitted" &&
                (canDecide && (!h.incoming_by || h.incoming_by === auth.userId) ? (
                  <p>
                    <strong>Giliran Anda:</strong> periksa ringkasan, item, dan checklist, lalu terima atau kembalikan handover ini.
                  </p>
                ) : (
                  <p>
                    Menunggu diterima oleh <strong>{incomingName ?? "penerima"}</strong>
                    {h.submitted_at && <> (diajukan {formatDateTime(h.submitted_at)})</>}.
                  </p>
                ))}
              {h.status === "acknowledged" && (
                <p>
                  <strong>Selesai.</strong> Diterima oleh {incomingName ?? "-"} pada {formatDateTime(h.acknowledged_at)}.
                </p>
              )}
            </NextStep>

            {canSubmit && (
              <form action={submitHandover} className="space-y-2">
                <input type="hidden" name="id" value={h.id} />
                <SubmitButton className="w-full" pendingText="Mengajukan…" disabled={!h.incoming_by}>
                  {h.status === "returned" ? "Ajukan ulang ke penerima" : "Ajukan ke penerima"}
                </SubmitButton>
                {!h.incoming_by && <p className="text-xs text-slate-500">Tentukan penerima di bagian Ringkasan terlebih dahulu.</p>}
              </form>
            )}

            {canDecide && (
              <>
                {h.incoming_by && h.incoming_by !== auth.userId && (
                  <p className="text-xs text-slate-500">
                    Handover ini ditujukan ke {incomingName}. Anda tetap dapat memprosesnya bila bertugas di shift penerima.
                  </p>
                )}
                <form action={acknowledgeHandover} className="space-y-2">
                  <input type="hidden" name="id" value={h.id} />
                  <Field label="Catatan penerima" hint="Opsional, mis. kondisi yang perlu dipantau.">
                    <Textarea name="ack_note" rows={2} />
                  </Field>
                  <SubmitButton variant="success" className="w-full" pendingText="Memproses…">
                    <Check className="size-4" aria-hidden /> Terima handover
                  </SubmitButton>
                </form>
                <details className="group rounded-lg border border-slate-200">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
                    Ada yang kurang? Kembalikan ke penyerah
                  </summary>
                  <form action={returnHandover} className="space-y-2 border-t border-slate-100 p-3">
                    <input type="hidden" name="id" value={h.id} />
                    <Field label="Alasan pengembalian" required hint="Jelaskan apa yang perlu diperbaiki penyerah.">
                      <Textarea name="ack_note" rows={2} required />
                    </Field>
                    <SubmitButton variant="secondary" className="w-full" pendingText="Memproses…">
                      Kembalikan ke penyerah
                    </SubmitButton>
                  </form>
                </details>
              </>
            )}
            {!canCreate && h.status !== "acknowledged" && (
              <p className="text-xs text-slate-500">Anda hanya dapat melihat handover ini.</p>
            )}

            {auth.can("handover.delete") && (
              <form action={deleteHandover} className="border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={h.id} />
                <ConfirmSubmitButton
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  pendingText="Menghapus…"
                  confirm={`Hapus handover ${h.handover_no ?? ""} beserta semua item dan checklist-nya? Tindakan ini tidak bisa dibatalkan.`}
                >
                  <Trash2 className="size-4" aria-hidden /> Hapus handover
                </ConfirmSubmitButton>
              </form>
            )}
          </CardContent>
        </Card>

        {/* ---------------- Ringkasan ---------------- */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Info label="Penyerah">{outgoingName}</Info>
              <Info label="Penerima">{incomingName ?? <span className="text-slate-400">Belum ditentukan</span>}</Info>
              <Info label="Tim shift asal">{outgoingMembers.map((m) => profiles.name(m.user_id)).join(", ") || "-"}</Info>
              <Info label="Tim shift tujuan">{incomingMembers.map((m) => profiles.name(m.user_id)).join(", ") || "-"}</Info>
              <Info label="Diajukan">{h.submitted_at ? formatDateTime(h.submitted_at) : <span className="text-slate-400">Belum</span>}</Info>
              <Info label="Diterima">
                {h.acknowledged_at ? formatDateTime(h.acknowledged_at) : <span className="text-slate-400">Belum</span>}
              </Info>
              {h.ack_note && h.status !== "returned" && <Info label="Catatan penerima">{h.ack_note}</Info>}
            </div>

            {canEdit ? (
              <form action={updateHandoverHeader} className="space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={h.id} />
                <Field label="Penerima" required={isOutgoing} hint="Rekan di shift berikutnya yang akan menerima handover ini.">
                  <Select name="incoming_by" defaultValue={h.incoming_by ?? ""}>
                    <option value="">Belum ditentukan</option>
                    {profiles.active
                      .filter((p) => p.id !== h.outgoing_by)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Ringkasan kondisi shift">
                  <Textarea
                    name="summary"
                    rows={4}
                    defaultValue={h.summary ?? ""}
                    placeholder="Kondisi jaringan, kejadian penting, hal yang perlu dipantau shift berikutnya."
                  />
                </Field>
                <Field label="Catatan tambahan">
                  <Textarea name="notes" rows={2} defaultValue={h.notes ?? ""} />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton variant="secondary">Simpan ringkasan</SubmitButton>
                </div>
              </form>
            ) : (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <Info label="Ringkasan kondisi shift">
                  <span className="whitespace-pre-line">{h.summary ?? "-"}</span>
                </Info>
                <Info label="Catatan tambahan">
                  <span className="whitespace-pre-line">{h.notes ?? "-"}</span>
                </Info>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Items ---------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Item serah terima</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Pekerjaan tertunda, gangguan, dan info yang perlu dilanjutkan shift berikutnya.</p>
          </div>
          <span className="text-sm text-slate-500">
            {itemRows.length} item{openItemCount > 0 && ` · ${openItemCount} belum selesai`}
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          {itemRows.length === 0 && (
            <p className="text-sm text-slate-500">
              {canEdit
                ? "Belum ada item. Tambahkan hal yang perlu diketahui atau dilanjutkan oleh shift berikutnya lewat formulir di bawah."
                : "Tidak ada item yang diserahkan pada handover ini."}
            </p>
          )}
          {CATEGORIES.filter((c) => itemRows.some((i) => i.category === c.value)).map((c) => (
            <section key={c.value}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {itemRows
                  .filter((i) => i.category === c.value)
                  .map((it) => (
                    <li key={it.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="break-words font-medium text-slate-900">{it.title}</p>
                          <StatusBadge status={it.priority} />
                          {!canCreate && <StatusBadge status={it.status} />}
                          {it.carried_from && (
                            <Badge tone="purple">
                              <CornerDownRight className="mr-0.5 size-3" aria-hidden /> Dari handover sebelumnya
                            </Badge>
                          )}
                        </div>
                        {it.description && <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{it.description}</p>}
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          {it.ref_ticket && <span>Tiket eksternal: {it.ref_ticket}</span>}
                          {it.incident_id && (
                            <Link href={`/incident/${it.incident_id}`} className="text-brand-600 hover:underline">
                              Incident {it.incidents?.ticket_no ?? ""} {it.incidents ? `· ${it.incidents.title}` : ""}
                            </Link>
                          )}
                          {it.due_at && <span>Tenggat: {formatDateTime(it.due_at)}</span>}
                        </p>
                      </div>
                      {(canCreate || canEdit) && (
                        <div className="flex items-center gap-2">
                          {canCreate && (
                            <form action={updateItemStatus} className="flex-1 sm:flex-none">
                              <input type="hidden" name="item_id" value={it.id} />
                              <input type="hidden" name="back" value={back} />
                              <AutoSubmitSelect name="status" defaultValue={it.status} aria-label={`Status item ${it.title}`} className="h-8 text-xs sm:w-36">
                                {ITEM_STATUSES.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </AutoSubmitSelect>
                            </form>
                          )}
                          {canEdit && (
                            <form action={deleteItem}>
                              <input type="hidden" name="handover_id" value={h.id} />
                              <input type="hidden" name="item_id" value={it.id} />
                              <ConfirmSubmitButton
                                variant="ghost"
                                size="sm"
                                aria-label={`Hapus item ${it.title}`}
                                title="Hapus item"
                                pendingText="…"
                                confirm={`Hapus item "${it.title}"?`}
                              >
                                <Trash2 className="size-4 text-red-600" aria-hidden />
                              </ConfirmSubmitButton>
                            </form>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}

          {canEdit && (
            <details open={itemRows.length === 0} className="group rounded-lg border border-dashed border-slate-300">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
                <Plus className="size-4" aria-hidden /> Tambah item
              </summary>
              <form action={addItem} className="space-y-3 border-t border-slate-200 p-4">
                <input type="hidden" name="handover_id" value={h.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Judul" required className="sm:col-span-2">
                    <Input name="title" required placeholder="mis. Pantau link ISP B, masih flapping" />
                  </Field>
                  <Field label="Kategori" required>
                    <Select name="category" defaultValue="pending_task" required>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
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
                  <Field label="Status">
                    <Select name="status" defaultValue="open">
                      {ITEM_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tenggat (WIB)" hint="Kapan item ini harus selesai, jika ada.">
                    <Input type="datetime-local" name="due_at" />
                  </Field>
                  <Field label="No. tiket eksternal" hint="Nomor tiket dari ISP/vendor, jika ada.">
                    <Input name="ref_ticket" placeholder="mis. TT-123456" />
                  </Field>
                  {auth.can("incident.view") && (
                    <Field label="Terkait incident" hint="Hanya incident yang belum selesai.">
                      <Select name="incident_id" defaultValue="">
                        <option value="">Tidak terkait</option>
                        {openIncidents.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.ticket_no ?? "INC"} · {i.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Detail" className="sm:col-span-2">
                    <Textarea name="description" rows={2} placeholder="Langkah yang sudah dilakukan, kontak terkait, dsb." />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton pendingText="Menambahkan…">Tambah item</SubmitButton>
                </div>
              </form>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Checklist ---------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Checklist kondisi</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Pemeriksaan rutin saat serah terima. Tanda * wajib diisi sebelum diajukan.</p>
          </div>
          {tplOptions.length > 1 && (
            <form method="get" className="w-full sm:w-auto">
              <AutoSubmitSelect name="template" defaultValue={template?.id} aria-label="Pilih template checklist" className="h-8 text-xs sm:w-56">
                {tplOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.site_id ? ` (${sites.name(t.site_id)})` : ""}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
          )}
        </CardHeader>
        <CardContent>
          {!template ? (
            <p className="text-sm text-slate-500">
              Belum ada template checklist aktif untuk site ini.
              {auth.can("master.manage") && (
                <>
                  {" "}
                  <Link href="/checklist" className="font-medium text-brand-600 hover:underline">
                    Buat template checklist
                  </Link>
                </>
              )}
            </p>
          ) : tplItems.length === 0 ? (
            <p className="text-sm text-slate-500">
              Template “{template.name}” belum memiliki item.
              {auth.can("master.manage") && (
                <>
                  {" "}
                  <Link href={`/checklist/${template.id}`} className="font-medium text-brand-600 hover:underline">
                    Tambah item
                  </Link>
                </>
              )}
            </p>
          ) : (
            <form action={saveChecklist} className="space-y-6">
              <input type="hidden" name="handover_id" value={h.id} />
              <input type="hidden" name="template_id" value={template.id} />
              <div className="space-y-1.5">
                <ProgressBar value={(filledCount / tplItems.length) * 100} />
                <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>
                    {filledCount} dari {tplItems.length} terisi
                  </span>
                  {notOkCount > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-red-700">
                      <AlertCircle className="size-3.5" aria-hidden /> {notOkCount} tidak normal
                    </span>
                  )}
                </p>
              </div>
              {[...sections.entries()].map(([section, list]) => (
                <section key={section}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{section}</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {list.map((it) => {
                      const r = resultMap.get(it.id);
                      const notOk = r?.is_ok === false;
                      return (
                        <li key={it.id} className={cn("grid gap-2 p-3 sm:grid-cols-[1fr_16rem_12rem] sm:items-center", notOk && "bg-red-50/60")}>
                          <div className="flex items-center gap-1.5 text-sm">
                            {notOk && <AlertCircle className="size-4 shrink-0 text-red-600" aria-label="Tidak normal" />}
                            <span className={notOk ? "font-medium text-red-700" : "text-slate-800"}>
                              {it.label}
                              {it.is_required && (
                                <span className="ml-0.5 text-red-500" title="Wajib diisi">
                                  *
                                </span>
                              )}
                            </span>
                          </div>
                          <ChecklistInput item={it} value={r?.value} disabled={!canEdit} />
                          <Input
                            name={`n_${it.id}`}
                            defaultValue={r?.note ?? ""}
                            placeholder={canEdit ? "Catatan (opsional)" : ""}
                            disabled={!canEdit}
                            className="h-9"
                            aria-label={`Catatan ${it.label}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {canEdit ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">Nilai di luar batas normal otomatis ditandai merah setelah disimpan.</p>
                  <SubmitButton>Simpan checklist</SubmitButton>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Checklist hanya dapat diisi saat handover masih draft atau dikembalikan.</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
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

/** Kotak "langkah berikutnya" di kartu status. */
function NextStep({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-slate-700">{children}</div>;
}

function Check3({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-xs", ok ? "text-slate-600" : "font-medium text-amber-800")}>
      {ok ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <CircleAlert className="size-3.5 text-amber-600" aria-hidden />}
      {children}
    </li>
  );
}

function ChecklistInput({ item, value, disabled }: { item: ChecklistTemplateItem; value: unknown; disabled: boolean }) {
  const name = `v_${item.id}`;
  switch (item.input_type) {
    case "boolean":
      return (
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name={name} value="true" defaultChecked={value === true} disabled={disabled} className="size-4" /> Normal
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={name} value="false" defaultChecked={value === false} disabled={disabled} className="size-4" /> Tidak normal
          </label>
        </div>
      );
    case "number": {
      const hint =
        item.min_value !== null && item.max_value !== null
          ? `${item.min_value}–${item.max_value}`
          : item.min_value !== null
            ? `≥ ${item.min_value}`
            : item.max_value !== null
              ? `≤ ${item.max_value}`
              : null;
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            name={name}
            defaultValue={typeof value === "number" ? String(value) : ""}
            disabled={disabled}
            className="h-9"
            aria-label={item.label}
          />
          <span className="shrink-0 text-xs text-slate-500">
            {item.unit}
            {hint && <span className="block text-slate-400">Normal {hint}</span>}
          </span>
        </div>
      );
    }
    case "select":
      return (
        <Select name={name} defaultValue={typeof value === "string" ? value : ""} disabled={disabled} className="h-9" aria-label={item.label}>
          <option value="">— Pilih —</option>
          {(Array.isArray(item.options) ? item.options : []).map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </Select>
      );
    default:
      return (
        <Input name={name} defaultValue={typeof value === "string" ? value : ""} disabled={disabled} className="h-9" aria-label={item.label} />
      );
  }
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}
