import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { ChecklistTemplate, ChecklistTemplateItem, Handover, HandoverChecklistResult, HandoverItem } from "@noc/supabase/types";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { AlertCircle, ArrowLeft, ArrowRight, CornerDownRight, Trash2 } from "lucide-react";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { CATEGORIES, ITEM_STATUSES, PRIORITIES, type Incident } from "@/lib/constants";
import { loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { first } from "@/lib/util";
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: hRow } = await supabase.from("handovers").select("*").eq("id", id).maybeSingle();
  if (!hRow) notFound();
  const h = hRow as Handover;

  let tplQ = supabase.from("checklist_templates").select("*").eq("is_active", true).order("name");
  tplQ = h.site_id ? tplQ.or(`site_id.is.null,site_id.eq.${h.site_id}`) : tplQ.is("site_id", null);

  const [members, items, results, templates, incidents, profiles, shifts, sites] = await Promise.all([
    supabase.from("handover_members").select("user_id, side").eq("handover_id", id),
    supabase.from("handover_items").select("*").eq("handover_id", id).order("sort_order").order("created_at"),
    supabase.from("handover_checklist_results").select("*, checklist_template_items(template_id)").eq("handover_id", id),
    tplQ,
    auth.can("incident.view")
      ? supabase.from("incidents").select("id, ticket_no, title, status").order("started_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    loadProfiles(supabase),
    loadShifts(supabase),
    loadSites(supabase),
  ]);

  const memberRows = (members.data as Member[] | null) ?? [];
  const itemRows = (items.data as HandoverItem[] | null) ?? [];
  const resultRows = (results.data as (HandoverChecklistResult & { checklist_template_items: { template_id: string } | null })[] | null) ?? [];
  const templateRows = (templates.data as ChecklistTemplate[] | null) ?? [];
  const incidentRows = (incidents.data as Pick<Incident, "id" | "ticket_no" | "title" | "status">[] | null) ?? [];
  const incidentMap = new Map(incidentRows.map((i) => [i.id, i]));
  const openIncidents = incidentRows.filter((i) => i.status !== "resolved" && i.status !== "closed");

  const editable = h.status === "draft" || h.status === "returned";
  const canCreate = auth.can("handover.create");
  const canEdit = canCreate && editable;
  const isOutgoing = h.outgoing_by === auth.userId;
  const canSubmit = canEdit && isOutgoing;
  const canDecide = canCreate && h.status === "submitted" && !isOutgoing;

  // Template checklist yang ditampilkan: ?template= → template dari hasil tersimpan → template pertama.
  const usedTemplateId = resultRows.find((r) => r.checklist_template_items)?.checklist_template_items?.template_id;
  const wanted = first(sp.template);
  let template: ChecklistTemplate | undefined =
    templateRows.find((t) => t.id === wanted) ?? templateRows.find((t) => t.id === usedTemplateId);
  if (!template && (wanted || usedTemplateId)) {
    const { data } = await supabase.from("checklist_templates").select("*").eq("id", wanted ?? usedTemplateId!).maybeSingle();
    template = (data as ChecklistTemplate | null) ?? undefined;
  }
  template ??= templateRows[0];
  const tplOptions = template && !templateRows.some((t) => t.id === template!.id) ? [template, ...templateRows] : templateRows;

  let tplItems: ChecklistTemplateItem[] = [];
  if (template) {
    const { data } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", template.id)
      .order("section", { nullsFirst: true })
      .order("sort_order");
    tplItems = (data as ChecklistTemplateItem[] | null) ?? [];
  }
  const resultMap = new Map(resultRows.map((r) => [r.template_item_id, r]));
  const sections = groupBy(tplItems, (i) => i.section ?? "Umum");

  const back = `/${id}`;
  const outgoingMembers = memberRows.filter((m) => m.side === "outgoing");
  const incomingMembers = memberRows.filter((m) => m.side === "incoming");

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {h.handover_no ?? "Handover"} <StatusBadge status={h.status} />
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            {formatDate(h.shift_date)} · {shifts.name(h.from_shift_id)} <ArrowRight className="size-3.5" aria-hidden />{" "}
            {shifts.name(h.to_shift_id)} · {sites.name(h.site_id)}
          </span>
        }
        actions={
          <Link href="/" className={buttonClass("secondary")}>
            <ArrowLeft className="size-4" aria-hidden /> Kembali
          </Link>
        }
      />
      <Flash searchParams={sp} />

      {h.status === "returned" && h.ack_note && (
        <Alert tone="warning">
          <strong>Dikembalikan oleh penerima:</strong> {h.ack_note}
        </Alert>
      )}

      {/* ---------------- Header ---------------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Informasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Info label="Penyerah">{profiles.name(h.outgoing_by)}</Info>
              <Info label="Penerima">{profiles.name(h.incoming_by)}</Info>
              <Info label="Tim shift asal">{outgoingMembers.map((m) => profiles.name(m.user_id)).join(", ") || "-"}</Info>
              <Info label="Tim shift tujuan">{incomingMembers.map((m) => profiles.name(m.user_id)).join(", ") || "-"}</Info>
              <Info label="Diajukan">{formatDateTime(h.submitted_at)}</Info>
              <Info label="Diterima">{formatDateTime(h.acknowledged_at)}</Info>
              {h.ack_note && h.status !== "returned" && <Info label="Catatan penerima">{h.ack_note}</Info>}
            </div>

            {canEdit ? (
              <form action={updateHandoverHeader} className="space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={h.id} />
                <Field label="Penerima">
                  <Select name="incoming_by" defaultValue={h.incoming_by ?? ""}>
                    <option value="">— Belum ditentukan —</option>
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
                  <Textarea name="summary" rows={4} defaultValue={h.summary ?? ""} />
                </Field>
                <Field label="Catatan">
                  <Textarea name="notes" rows={3} defaultValue={h.notes ?? ""} />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton variant="secondary">Simpan perubahan</SubmitButton>
                </div>
              </form>
            ) : (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <Info label="Ringkasan kondisi shift">
                  <span className="whitespace-pre-line">{h.summary ?? "-"}</span>
                </Info>
                <Info label="Catatan">
                  <span className="whitespace-pre-line">{h.notes ?? "-"}</span>
                </Info>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------------- Workflow ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Proses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {canSubmit && (
              <form action={submitHandover} className="space-y-2">
                <input type="hidden" name="id" value={h.id} />
                <p className="text-slate-600">Ajukan handover ke penerima setelah item & checklist lengkap.</p>
                <SubmitButton className="w-full" pendingText="Mengajukan…">
                  Ajukan handover
                </SubmitButton>
              </form>
            )}
            {canEdit && !isOutgoing && <p className="text-slate-500">Menunggu penyerah mengajukan handover.</p>}

            {canDecide && (
              <>
                <form action={acknowledgeHandover} className="space-y-2">
                  <input type="hidden" name="id" value={h.id} />
                  <Field label="Catatan penerima">
                    <Textarea name="ack_note" rows={2} placeholder="Opsional" />
                  </Field>
                  <SubmitButton variant="success" className="w-full" pendingText="Memproses…">
                    Terima handover
                  </SubmitButton>
                </form>
                <form action={returnHandover} className="space-y-2 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={h.id} />
                  <Field label="Alasan pengembalian" required>
                    <Textarea name="ack_note" rows={2} required />
                  </Field>
                  <SubmitButton variant="secondary" className="w-full" pendingText="Memproses…">
                    Kembalikan
                  </SubmitButton>
                </form>
              </>
            )}
            {h.status === "submitted" && isOutgoing && <p className="text-slate-500">Menunggu konfirmasi penerima.</p>}
            {h.status === "acknowledged" && <p className="text-slate-500">Handover sudah diterima.</p>}
            {!canSubmit && !canDecide && !canCreate && <p className="text-slate-500">Anda hanya dapat melihat handover ini.</p>}

            {auth.can("handover.delete") && (
              <form action={deleteHandover} className="border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={h.id} />
                <SubmitButton variant="danger" size="sm" pendingText="Menghapus…">
                  <Trash2 className="size-4" aria-hidden /> Hapus handover
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Items ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Butir serah terima</CardTitle>
          <span className="text-sm text-slate-500">{itemRows.length} item</span>
        </CardHeader>
        <CardContent className="space-y-6">
          {itemRows.length === 0 && <p className="text-sm text-slate-500">Belum ada item.</p>}
          {CATEGORIES.filter((c) => itemRows.some((i) => i.category === c.value)).map((c) => (
            <section key={c.value}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {itemRows
                  .filter((i) => i.category === c.value)
                  .map((it) => {
                    const inc = it.incident_id ? incidentMap.get(it.incident_id) : undefined;
                    return (
                      <li key={it.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium text-slate-900">{it.title}</p>
                            <StatusBadge status={it.priority} />
                            <StatusBadge status={it.status} />
                            {it.carried_from && (
                              <Badge tone="purple">
                                <CornerDownRight className="mr-0.5 size-3" aria-hidden /> Lanjutan
                              </Badge>
                            )}
                          </div>
                          {it.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{it.description}</p>}
                          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                            {it.ref_ticket && <span>Tiket: {it.ref_ticket}</span>}
                            {it.incident_id && (
                              <Link href={`/incident/${it.incident_id}`} className="text-brand-600 hover:underline">
                                Incident {inc?.ticket_no ?? ""} {inc ? `· ${inc.title}` : ""}
                              </Link>
                            )}
                            {it.due_at && <span>Tenggat: {formatDateTime(it.due_at)}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canCreate && (
                            <form action={updateItemStatus}>
                              <input type="hidden" name="item_id" value={it.id} />
                              <input type="hidden" name="back" value={back} />
                              <AutoSubmitSelect name="status" defaultValue={it.status} aria-label="Status item" className="h-8 w-36 text-xs">
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
                              <Button type="submit" variant="ghost" size="sm" aria-label="Hapus item" title="Hapus item">
                                <Trash2 className="size-4 text-red-600" aria-hidden />
                              </Button>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}

          {canEdit && (
            <form action={addItem} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
              <p className="text-sm font-medium text-slate-900">Tambah item</p>
              <input type="hidden" name="handover_id" value={h.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kategori" required>
                  <Select name="category" defaultValue="pending_task" required>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Judul" required>
                  <Input name="title" required />
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
                <Field label="No. tiket eksternal">
                  <Input name="ref_ticket" placeholder="Tiket ISP/vendor" />
                </Field>
                <Field label="Tenggat (WIB)">
                  <Input type="datetime-local" name="due_at" />
                </Field>
                {auth.can("incident.view") && (
                  <Field label="Terkait incident" className="sm:col-span-2">
                    <Select name="incident_id" defaultValue="">
                      <option value="">— Tidak ada —</option>
                      {openIncidents.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.ticket_no ?? "INC"} · {i.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Deskripsi" className="sm:col-span-2">
                  <Textarea name="description" rows={2} />
                </Field>
              </div>
              <div className="flex justify-end">
                <SubmitButton>Tambah item</SubmitButton>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Checklist ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
          {tplOptions.length > 0 && (
            <form method="get" className="flex items-center gap-2">
              <Select name="template" defaultValue={template?.id} aria-label="Template checklist" className="h-8 w-56 text-xs">
                {tplOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.site_id ? ` (${sites.name(t.site_id)})` : ""}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Pilih
              </button>
            </form>
          )}
        </CardHeader>
        <CardContent>
          {!template ? (
            <p className="text-sm text-slate-500">Belum ada template checklist aktif untuk site ini.</p>
          ) : tplItems.length === 0 ? (
            <p className="text-sm text-slate-500">Template ini belum memiliki item.</p>
          ) : (
            <form action={saveChecklist} className="space-y-6">
              <input type="hidden" name="handover_id" value={h.id} />
              <input type="hidden" name="template_id" value={template.id} />
              {[...sections.entries()].map(([section, list]) => (
                <section key={section}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{section}</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {list.map((it) => {
                      const r = resultMap.get(it.id);
                      const notOk = r?.is_ok === false;
                      return (
                        <li key={it.id} className={`grid gap-2 p-3 sm:grid-cols-[1fr_16rem_12rem] sm:items-center ${notOk ? "bg-red-50/60" : ""}`}>
                          <div className="flex items-center gap-1.5 text-sm">
                            {notOk && <AlertCircle className="size-4 shrink-0 text-red-600" aria-label="Tidak normal" />}
                            <span className={notOk ? "font-medium text-red-700" : "text-slate-800"}>
                              {it.label}
                              {it.is_required && <span className="ml-0.5 text-red-500">*</span>}
                            </span>
                          </div>
                          <ChecklistInput item={it} value={r?.value} disabled={!canEdit} />
                          <Input
                            name={`n_${it.id}`}
                            defaultValue={r?.note ?? ""}
                            placeholder="Catatan"
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
                <div className="flex justify-end">
                  <SubmitButton>Simpan checklist</SubmitButton>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Checklist hanya dapat diisi saat handover berstatus draft atau dikembalikan.</p>
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
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 text-slate-900">{children}</div>
    </div>
  );
}

function ChecklistInput({ item, value, disabled }: { item: ChecklistTemplateItem; value: unknown; disabled: boolean }) {
  const name = `v_${item.id}`;
  switch (item.input_type) {
    case "boolean":
      return (
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name={name} value="true" defaultChecked={value === true} disabled={disabled} className="size-4" /> Ya
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={name} value="false" defaultChecked={value === false} disabled={disabled} className="size-4" /> Tidak
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
            name={name}
            defaultValue={typeof value === "number" ? String(value) : ""}
            disabled={disabled}
            className="h-9"
            aria-label={item.label}
          />
          <span className="shrink-0 text-xs text-slate-500">
            {item.unit}
            {hint && <span className="block text-slate-400">{hint}</span>}
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
