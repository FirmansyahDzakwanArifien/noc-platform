import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Permit, PermitApproval, PermitItem, PermitPersonnel, PermitVisit } from "@noc/supabase/types";
import {
  Alert,
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Flash,
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
} from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { PERMIT_TYPES, RISK_LEVELS } from "@/lib/labels";
import { isUuid, nameOf, profileNames, type SearchParams } from "@/lib/util";
import {
  addApprovalStep,
  addItem,
  addPersonnel,
  cancelPermit,
  checkIn,
  checkOut,
  completePermit,
  decideApproval,
  deletePermit,
  removeItem,
  removePersonnel,
  submitDraft,
} from "./actions";

export const metadata = { title: "Detail Izin" };

type Detail = Permit & {
  sites: { code: string; name: string } | null;
  vendors: { name: string } | null;
};

export default async function PermitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data } = await supabase.from("permits").select("*, sites(code, name), vendors(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const permit = data as Detail;

  const [personnelRes, itemsRes, approvalsRes, visitsRes] = await Promise.all([
    supabase.from("permit_personnel").select("*").eq("permit_id", id).order("full_name"),
    supabase.from("permit_items").select("*").eq("permit_id", id).order("direction").order("name"),
    supabase.from("permit_approvals").select("*").eq("permit_id", id).order("step"),
    supabase.from("permit_visits").select("*").eq("permit_id", id).order("check_in_at", { ascending: false }),
  ]);
  const personnel = (personnelRes.data ?? []) as PermitPersonnel[];
  const items = (itemsRes.data ?? []) as PermitItem[];
  const approvals = (approvalsRes.data ?? []) as PermitApproval[];
  const visits = (visitsRes.data ?? []) as PermitVisit[];

  const canManage = auth.can("permit.manage");
  const isRequester = permit.requested_by === auth.userId;
  const status = permit.status;
  const editable = status === "draft" && (isRequester || canManage);
  const canSubmit = status === "draft" && (isRequester || canManage);
  const canCancel = canManage
    ? ["draft", "submitted", "in_review", "approved"].includes(status)
    : isRequester && ["draft", "submitted"].includes(status);
  const canDelete = auth.can("permit.delete") || (isRequester && status === "draft");
  const canSetApproval = canManage && ["submitted", "in_review"].includes(status);
  const inApproval = ["submitted", "in_review"].includes(status);
  const canCheckin = auth.can("permit.checkin") && ["approved", "active"].includes(status);
  const canComplete = canManage && ["approved", "active"].includes(status);

  const [names, approverOptions] = await Promise.all([
    profileNames(supabase, [
      permit.requested_by,
      permit.pic_internal,
      ...approvals.map((a) => a.approver_id),
      ...visits.flatMap((v) => [v.checked_in_by, v.checked_out_by]),
    ]),
    canSetApproval
      ? supabase.from("profiles").select("id, full_name").eq("is_active", true).is("vendor_id", null).order("full_name")
      : Promise.resolve({ data: [] }),
  ]);
  const approvers = (approverOptions.data ?? []) as { id: string; full_name: string }[];

  const personName = new Map(personnel.map((p) => [p.id, p.full_name]));
  const onSite = new Set(visits.filter((v) => !v.check_out_at && v.personnel_id).map((v) => v.personnel_id!));
  const back = `/${id}`;

  /** Step milik saya yang bisa diputuskan sekarang (semua step sebelumnya sudah disetujui). */
  const myActionable = (a: PermitApproval) =>
    inApproval &&
    auth.can("permit.approve") &&
    a.approver_id === auth.userId &&
    a.decision === "pending" &&
    approvals.every((s) => s.step >= a.step || s.decision === "approved");

  const hidden = (
    <>
      <input type="hidden" name="permit_id" value={id} />
      <input type="hidden" name="back" value={back} />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Daftar izin
        </Link>
        <PageHeader
          title={permit.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{permit.permit_no ?? "(belum bernomor)"}</span>
              <Badge>{PERMIT_TYPES[permit.permit_type] ?? permit.permit_type}</Badge>
              <StatusBadge status={status} />
            </span>
          }
          actions={
            <>
              {canSubmit && (
                <form action={submitDraft}>
                  {hidden}
                  <SubmitButton pendingText="Mengajukan…">Ajukan</SubmitButton>
                </form>
              )}
              {canCancel && (
                <form action={cancelPermit}>
                  {hidden}
                  <SubmitButton variant="secondary" pendingText="Membatalkan…">
                    Batalkan
                  </SubmitButton>
                </form>
              )}
              {canDelete && (
                <details className="relative">
                  <summary className={buttonClass("ghost", "md", "cursor-pointer list-none text-red-600 [&::-webkit-details-marker]:hidden")}>
                    Hapus
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="text-sm text-slate-600">Hapus izin ini beserta personel, barang, dan log kunjungannya?</p>
                    <form action={deletePermit} className="mt-3 text-right">
                      <input type="hidden" name="permit_id" value={id} />
                      <SubmitButton variant="danger" size="sm" pendingText="Menghapus…">
                        Ya, hapus
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              )}
            </>
          }
        />
      </div>
      <Flash searchParams={sp} />

      {/* ------------------------------------------------------------ info */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Info label="Site">{permit.sites ? `${permit.sites.code} · ${permit.sites.name}` : "-"}</Info>
            <Info label="Periode (WIB)">
              {formatDateTime(permit.start_at)} s/d {formatDateTime(permit.end_at)}
            </Info>
            <Info label="Pemohon">{nameOf(names, permit.requested_by, auth.userId)}</Info>
            <Info label="Vendor">{permit.vendors?.name ?? (permit.vendor_id ? "(vendor)" : "Internal")}</Info>
            <Info label="PIC internal">{nameOf(names, permit.pic_internal, auth.userId)}</Info>
            <Info label="Tingkat risiko">
              <StatusBadge status={permit.risk_level} />
              <span className="sr-only">{RISK_LEVELS[permit.risk_level]}</span>
            </Info>
            <Info label="Tujuan / lingkup" wide>
              <p className="whitespace-pre-wrap">{permit.purpose}</p>
            </Info>
            {permit.impact && (
              <Info label="Dampak ke layanan" wide>
                <p className="whitespace-pre-wrap">{permit.impact}</p>
              </Info>
            )}
            {permit.rollback_plan && (
              <Info label="Rollback plan" wide>
                <p className="whitespace-pre-wrap">{permit.rollback_plan}</p>
              </Info>
            )}
            <Info label="Diajukan">{formatDateTime(permit.submitted_at)}</Info>
            <Info label="Disetujui">{formatDateTime(permit.approved_at)}</Info>
            {permit.closed_at && <Info label="Ditutup">{formatDateTime(permit.closed_at)}</Info>}
            {permit.closing_note && (
              <Info label="Catatan penutupan" wide>
                <p className="whitespace-pre-wrap">{permit.closing_note}</p>
              </Info>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ personel */}
      <Card>
        <CardHeader>
          <CardTitle>Personel ({personnel.length})</CardTitle>
        </CardHeader>
        {personnel.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Nama</TH>
                <TH>No. ID</TH>
                <TH>Perusahaan</TH>
                <TH>No. HP</TH>
                <TH>Peran</TH>
                {editable && <TH />}
              </tr>
            </THead>
            <TBody>
              {personnel.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium text-slate-900">
                    {p.full_name}
                    {onSite.has(p.id) && (
                      <Badge tone="green" className="ml-2">
                        Di lokasi
                      </Badge>
                    )}
                  </TD>
                  <TD>{p.id_number ?? "-"}</TD>
                  <TD>{p.company ?? "-"}</TD>
                  <TD>{p.phone ?? "-"}</TD>
                  <TD>{p.role ?? "-"}</TD>
                  {editable && (
                    <TD className="text-right">
                      <form action={removePersonnel}>
                        {hidden}
                        <input type="hidden" name="row_id" value={p.id} />
                        <SubmitButton variant="ghost" size="sm" pendingText="…">
                          Hapus
                        </SubmitButton>
                      </form>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-slate-500">Belum ada personel.</CardContent>
        )}
        {editable && (
          <CardContent className="border-t border-slate-100">
            <form action={addPersonnel} className="grid gap-2 sm:grid-cols-6">
              {hidden}
              <Input name="full_name" placeholder="Nama lengkap" required aria-label="Nama lengkap" />
              <Input name="id_number" placeholder="No. KTP / ID" aria-label="No. ID" />
              <Input name="company" placeholder="Perusahaan" aria-label="Perusahaan" />
              <Input name="phone" placeholder="No. HP" aria-label="No. HP" />
              <Input name="role" placeholder="Peran" aria-label="Peran" />
              <SubmitButton variant="secondary">Tambah</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------ barang */}
      <Card>
        <CardHeader>
          <CardTitle>Barang / perangkat ({items.length})</CardTitle>
        </CardHeader>
        {items.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Arah</TH>
                <TH>Nama</TH>
                <TH>Merk / model</TH>
                <TH>Serial number</TH>
                <TH className="text-right">Qty</TH>
                {editable && <TH />}
              </tr>
            </THead>
            <TBody>
              {items.map((it) => (
                <TR key={it.id}>
                  <TD>
                    <Badge tone={it.direction === "masuk" ? "blue" : "orange"}>{it.direction === "masuk" ? "Masuk" : "Keluar"}</Badge>
                  </TD>
                  <TD className="font-medium text-slate-900">{it.name}</TD>
                  <TD>{it.brand_model ?? "-"}</TD>
                  <TD className="font-mono text-xs">{it.serial_number ?? "-"}</TD>
                  <TD className="text-right tabular-nums">{it.qty}</TD>
                  {editable && (
                    <TD className="text-right">
                      <form action={removeItem}>
                        {hidden}
                        <input type="hidden" name="row_id" value={it.id} />
                        <SubmitButton variant="ghost" size="sm" pendingText="…">
                          Hapus
                        </SubmitButton>
                      </form>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-slate-500">Tidak ada barang yang didaftarkan.</CardContent>
        )}
        {editable && (
          <CardContent className="border-t border-slate-100">
            <form action={addItem} className="grid gap-2 sm:grid-cols-6">
              {hidden}
              <Select name="direction" defaultValue="masuk" aria-label="Arah">
                <option value="masuk">Masuk</option>
                <option value="keluar">Keluar</option>
              </Select>
              <Input name="name" placeholder="Nama barang" required aria-label="Nama barang" />
              <Input name="brand_model" placeholder="Merk / model" aria-label="Merk / model" />
              <Input name="serial_number" placeholder="Serial number" aria-label="Serial number" />
              <Input type="number" name="qty" min={1} defaultValue={1} aria-label="Qty" />
              <SubmitButton variant="secondary">Tambah</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------ approval */}
      <Card>
        <CardHeader>
          <CardTitle>Alur approval</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {approvals.length === 0 ? (
            <p className="text-sm text-slate-500">
              {inApproval ? "Alur approval belum diatur." : "Belum ada langkah approval."}
            </p>
          ) : (
            <ol className="space-y-3">
              {approvals.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">Step {a.step}</span>
                    <span className="text-slate-600">{nameOf(names, a.approver_id, auth.userId)}</span>
                    <StatusBadge status={a.decision} />
                    {a.decided_at && <span className="text-xs text-slate-400">{formatDateTime(a.decided_at)}</span>}
                  </div>
                  {a.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">“{a.comment}”</p>}
                  {myActionable(a) && (
                    <form action={decideApproval} className="mt-3 space-y-2">
                      <input type="hidden" name="approval_id" value={a.id} />
                      <input type="hidden" name="back" value={back} />
                      <Textarea name="comment" rows={2} placeholder="Komentar (wajib bila menolak)" aria-label="Komentar" />
                      <div className="flex gap-2">
                        <SubmitButton name="decision" value="approved" variant="success" pendingText="Memproses…">
                          Setujui
                        </SubmitButton>
                        <SubmitButton name="decision" value="rejected" variant="danger" pendingText="Memproses…">
                          Tolak
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                  {a.approver_id === auth.userId && a.decision === "pending" && !myActionable(a) && inApproval && (
                    <p className="mt-2 text-xs text-slate-500">Menunggu keputusan step sebelumnya.</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canSetApproval && (
            <form action={addApprovalStep} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              {hidden}
              <Field label={`Atur approval — tambah step ${Math.max(0, ...approvals.map((a) => a.step)) + 1}`} className="min-w-60 flex-1">
                <Select name="approver_id" required defaultValue="">
                  <option value="" disabled>
                    Pilih approver…
                  </option>
                  {approvers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="secondary">Tambah step</SubmitButton>
              {status === "submitted" && (
                <p className="w-full text-xs text-slate-500">Menambah step akan mengubah status izin menjadi Ditinjau.</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ kunjungan */}
      <Card>
        <CardHeader>
          <CardTitle>Log kunjungan</CardTitle>
        </CardHeader>
        {visits.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Personel</TH>
                <TH>Check-in</TH>
                <TH>Check-out</TH>
                <TH>Catatan</TH>
                {auth.can("permit.checkin") && <TH />}
              </tr>
            </THead>
            <TBody>
              {visits.map((v) => (
                <TR key={v.id}>
                  <TD className="font-medium text-slate-900">{(v.personnel_id && personName.get(v.personnel_id)) || "-"}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDateTime(v.check_in_at)}
                    <span className="block text-xs text-slate-400">{nameOf(names, v.checked_in_by, auth.userId)}</span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {v.check_out_at ? (
                      <>
                        {formatDateTime(v.check_out_at)}
                        <span className="block text-xs text-slate-400">{nameOf(names, v.checked_out_by, auth.userId)}</span>
                      </>
                    ) : (
                      <Badge tone="green">Di lokasi</Badge>
                    )}
                  </TD>
                  <TD>{v.note ?? "-"}</TD>
                  {auth.can("permit.checkin") && (
                    <TD className="text-right">
                      {!v.check_out_at && (
                        <form action={checkOut}>
                          <input type="hidden" name="visit_id" value={v.id} />
                          <input type="hidden" name="back" value={back} />
                          <SubmitButton variant="secondary" size="sm" pendingText="…">
                            Check-out
                          </SubmitButton>
                        </form>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-slate-500">Belum ada kunjungan.</CardContent>
        )}
        {canCheckin && (
          <CardContent className="border-t border-slate-100">
            {personnel.filter((p) => !onSite.has(p.id)).length > 0 ? (
              <form action={checkIn} className="flex flex-wrap items-end gap-2">
                {hidden}
                <Field label="Check-in personel" className="min-w-52 flex-1">
                  <Select name="personnel_id" required defaultValue="">
                    <option value="" disabled>
                      Pilih personel…
                    </option>
                    {personnel
                      .filter((p) => !onSite.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                          {p.company ? ` (${p.company})` : ""}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Catatan" className="min-w-52 flex-1">
                  <Input name="note" placeholder="opsional" />
                </Field>
                <SubmitButton pendingText="Mencatat…">Check-in</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-500">
                {personnel.length === 0 ? "Tidak ada personel terdaftar untuk check-in." : "Semua personel sedang di lokasi."}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------ penutupan */}
      {canComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Selesaikan izin</CardTitle>
          </CardHeader>
          <CardContent>
            {onSite.size > 0 && (
              <Alert tone="warning" className="mb-3">
                Masih ada {onSite.size} personel di lokasi. Lakukan check-out sebelum menyelesaikan izin.
              </Alert>
            )}
            <form action={completePermit} className="space-y-3">
              {hidden}
              <Field label="Catatan penutupan">
                <Textarea name="closing_note" rows={3} placeholder="Hasil pekerjaan, kondisi akhir, dll." />
              </Field>
              <SubmitButton variant="success" pendingText="Menyimpan…">
                Selesaikan
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}
