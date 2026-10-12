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
  cn,
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
import { ArrowLeft, Check, X } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { RiskBadge } from "@/components/risk-badge";
import { PERMIT_TYPES } from "@/lib/labels";
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

type Tone = "info" | "success" | "warning" | "error";

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

  const [permitRes, personnelRes, itemsRes, approvalsRes, visitsRes] = await Promise.all([
    supabase.from("permits").select("*, sites(code, name), vendors(name)").eq("id", id).maybeSingle(),
    supabase.from("permit_personnel").select("*").eq("permit_id", id).order("full_name"),
    supabase.from("permit_items").select("*").eq("permit_id", id).order("direction").order("name"),
    supabase.from("permit_approvals").select("*").eq("permit_id", id).order("step"),
    supabase.from("permit_visits").select("*").eq("permit_id", id).order("check_in_at", { ascending: false }).limit(200),
  ]);
  if (!permitRes.data) notFound();
  const permit = permitRes.data as Detail;
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
  const notOnSite = personnel.filter((p) => !onSite.has(p.id));
  const back = `/${id}`;
  const approverName = (a: PermitApproval) => {
    const n = nameOf(names, a.approver_id, auth.userId);
    return n === "-" ? "Approver" : n;
  };

  /** Langkah yang sedang berjalan: langkah pertama yang belum disetujui. */
  const current = inApproval ? approvals.find((a) => a.decision !== "approved") : undefined;
  const rejectedStep = approvals.find((a) => a.decision === "rejected");

  /** Step milik saya yang bisa diputuskan sekarang (semua step sebelumnya sudah disetujui). */
  const myActionable = (a: PermitApproval) =>
    auth.can("permit.approve") && a.approver_id === auth.userId && a.decision === "pending" && current?.id === a.id;

  // ------------------------------------------------------------ langkah berikutnya
  let next: { tone: Tone; text: React.ReactNode } | null = null;
  if (status === "draft") {
    next =
      isRequester || canManage
        ? { tone: "warning", text: "Izin masih draft dan belum diproses. Lengkapi personel & barang, lalu klik Ajukan." }
        : { tone: "info", text: "Izin masih draft; menunggu pemohon mengajukan." };
  } else if (inApproval) {
    if (approvals.length === 0) {
      next = canManage
        ? { tone: "warning", text: "Izin sudah diajukan. Tentukan approver di bagian Alur persetujuan di bawah." }
        : { tone: "info", text: "Izin sudah diajukan. Menunggu pengelola izin menentukan approver." };
    } else if (!current) {
      next = { tone: "info", text: "Semua approver sudah menyetujui. Menunggu pengelola izin memperbarui status." };
    } else if (current.decision === "rejected") {
      next = { tone: "error", text: `Ditolak oleh ${approverName(current)}. Menunggu pengelola izin memperbarui status.` };
    } else if (myActionable(current)) {
      next = {
        tone: "warning",
        text: (
          <>
            <b>Menunggu persetujuan Anda</b> (langkah {current.step} dari {approvals.length}).{" "}
            <a href="#persetujuan" className="font-medium underline">
              Beri keputusan
            </a>
          </>
        ),
      };
    } else {
      next = {
        tone: "info",
        text: `Menunggu persetujuan ${approverName(current)} (langkah ${current.step} dari ${approvals.length}).`,
      };
    }
  } else if (status === "approved") {
    next = { tone: "success", text: `Izin disetujui. Personel dapat check-in di lokasi mulai ${formatDateTime(permit.start_at)} WIB.` };
  } else if (status === "active") {
    next = {
      tone: "success",
      text:
        (onSite.size > 0 ? `Pekerjaan berlangsung — ${onSite.size} personel sedang di lokasi.` : "Izin aktif. Tidak ada personel di lokasi saat ini.") +
        (canComplete ? " Selesaikan izin setelah pekerjaan tuntas." : ""),
    };
  } else if (status === "rejected") {
    next = {
      tone: "error",
      text: rejectedStep
        ? `Ditolak oleh ${approverName(rejectedStep)}${rejectedStep.comment ? `: “${rejectedStep.comment}”` : "."}`
        : "Izin ditolak.",
    };
  } else if (status === "completed") {
    next = { tone: "success", text: `Izin selesai pada ${formatDateTime(permit.closed_at)} WIB.` };
  } else if (status === "cancelled") {
    next = { tone: "info", text: "Izin ini dibatalkan." };
  } else if (status === "expired") {
    next = { tone: "info", text: "Masa berlaku izin ini sudah habis." };
  }

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
              <StatusBadge status={status} />
              <Badge>{PERMIT_TYPES[permit.permit_type] ?? permit.permit_type}</Badge>
              <span className="font-mono text-xs">{permit.permit_no ?? "Nomor terbit setelah diajukan"}</span>
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
                  <ConfirmSubmit
                    variant="secondary"
                    pendingText="Membatalkan…"
                    confirm="Batalkan izin ini? Izin yang dibatalkan tidak bisa diproses lagi."
                  >
                    Batalkan izin
                  </ConfirmSubmit>
                </form>
              )}
              {canDelete && (
                <details className="relative">
                  <summary className={buttonClass("ghost", "md", "cursor-pointer list-none text-red-600 [&::-webkit-details-marker]:hidden")}>
                    Hapus
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="text-sm text-slate-600">
                      Hapus izin ini beserta personel, barang, dan log kunjungannya? Tindakan ini tidak bisa dibatalkan.
                    </p>
                    <form action={deletePermit} className="mt-3 text-right">
                      <input type="hidden" name="permit_id" value={id} />
                      <SubmitButton variant="danger" size="sm" pendingText="Menghapus…">
                        Ya, hapus permanen
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

      {/* ------------------------------------------------------------ ringkasan */}
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm lg:grid-cols-4">
            <Info label="Site">{permit.sites ? `${permit.sites.code} · ${permit.sites.name}` : "-"}</Info>
            <Info label="Jadwal (WIB)">
              {formatDateTime(permit.start_at)}
              <span className="block text-slate-500">s/d {formatDateTime(permit.end_at)}</span>
            </Info>
            <Info label="Pemohon">{nameOf(names, permit.requested_by, auth.userId)}</Info>
            <Info label="Risiko">
              <RiskBadge level={permit.risk_level} />
            </Info>
          </dl>
        </CardContent>
      </Card>

      {next && (
        <Alert tone={next.tone}>
          <span className="font-medium">Langkah berikutnya: </span>
          {next.text}
        </Alert>
      )}

      {/* ------------------------------------------------------------ approval */}
      <Card id="persetujuan" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Alur persetujuan</CardTitle>
          {approvals.length > 0 && (
            <span className="text-xs text-slate-500">
              {approvals.filter((a) => a.decision === "approved").length} dari {approvals.length} menyetujui
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="relative space-y-0">
            <Step state={permit.submitted_at ? "done" : "idle"} marker={<Check className="size-3.5" aria-hidden />}>
              <p className="text-sm font-medium text-slate-900">Pengajuan</p>
              <p className="text-xs text-slate-500">
                {nameOf(names, permit.requested_by, auth.userId)}
                {permit.submitted_at ? ` · diajukan ${formatDateTime(permit.submitted_at)}` : " · belum diajukan"}
              </p>
            </Step>

            {approvals.map((a) => {
              const isCurrent = current?.id === a.id && a.decision === "pending";
              return (
                <Step
                  key={a.id}
                  state={a.decision === "approved" ? "done" : a.decision === "rejected" ? "rejected" : isCurrent ? "current" : "idle"}
                  marker={
                    a.decision === "approved" ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : a.decision === "rejected" ? (
                      <X className="size-3.5" aria-hidden />
                    ) : (
                      a.step
                    )
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      Langkah {a.step} · {approverName(a)}
                    </p>
                    {a.decision === "pending" ? (
                      <Badge tone={isCurrent ? "yellow" : "gray"}>{isCurrent ? "Sedang menunggu" : "Belum giliran"}</Badge>
                    ) : (
                      <StatusBadge status={a.decision} />
                    )}
                  </div>
                  {a.decided_at && <p className="text-xs text-slate-500">Diputuskan {formatDateTime(a.decided_at)}</p>}
                  {a.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">“{a.comment}”</p>}

                  {myActionable(a) && (
                    <form action={decideApproval} className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                      <input type="hidden" name="approval_id" value={a.id} />
                      <input type="hidden" name="back" value={back} />
                      <Field label="Keputusan Anda" hint="Komentar wajib diisi bila menolak.">
                        <Textarea name="comment" rows={2} placeholder="Komentar / alasan (opsional bila menyetujui)" />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="decision" value="approved" variant="success" pendingText="Memproses…">
                          Setujui
                        </SubmitButton>
                        <ConfirmSubmit
                          name="decision"
                          value="rejected"
                          variant="danger"
                          pendingText="Memproses…"
                          confirm="Tolak izin ini? Keputusan tidak bisa diubah."
                        >
                          Tolak
                        </ConfirmSubmit>
                      </div>
                    </form>
                  )}
                  {a.approver_id === auth.userId && a.decision === "pending" && !isCurrent && inApproval && (
                    <p className="mt-1 text-xs text-slate-500">Anda bisa memutuskan setelah langkah sebelumnya disetujui.</p>
                  )}
                </Step>
              );
            })}

            {approvals.length === 0 && (
              <Step state="idle" marker={1}>
                <p className="text-sm text-slate-500">
                  {inApproval ? "Approver belum ditentukan." : "Approver ditentukan pengelola izin setelah izin diajukan."}
                </p>
              </Step>
            )}
          </ol>

          {canSetApproval && (
            <form action={addApprovalStep} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              {hidden}
              <Field
                label={`Tambah approver (langkah ${Math.max(0, ...approvals.map((a) => a.step)) + 1})`}
                hint={
                  status === "submitted"
                    ? "Approver memutuskan berurutan. Menambah approver mengubah status izin menjadi Ditinjau."
                    : "Approver memutuskan berurutan sesuai nomor langkah."
                }
                className="min-w-0 flex-1 sm:min-w-60"
              >
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
              <SubmitButton variant="secondary">Tambah approver</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ detail */}
      <Card>
        <CardHeader>
          <CardTitle>Detail pekerjaan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Info label="Tujuan / lingkup" wide>
              <p className="whitespace-pre-wrap">{permit.purpose}</p>
            </Info>
            <Info label="Vendor">{permit.vendors?.name ?? (permit.vendor_id ? "Vendor eksternal" : "Internal")}</Info>
            <Info label="PIC internal">
              {permit.pic_internal ? nameOf(names, permit.pic_internal, auth.userId) : "Belum ditentukan"}
            </Info>
            <Info label="Dampak ke layanan" wide>
              <p className="whitespace-pre-wrap">{permit.impact || "Tidak diisi"}</p>
            </Info>
            {(permit.rollback_plan || permit.permit_type === "change_request") && (
              <Info label="Rencana rollback" wide>
                <p className="whitespace-pre-wrap">{permit.rollback_plan || "Tidak diisi"}</p>
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
          {onSite.size > 0 && <Badge tone="green">{onSite.size} di lokasi</Badge>}
        </CardHeader>
        {personnel.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Nama</TH>
                <TH className="hidden sm:table-cell">No. KTP / ID</TH>
                <TH className="hidden md:table-cell">Perusahaan</TH>
                <TH className="hidden md:table-cell">No. HP</TH>
                <TH className="hidden sm:table-cell">Peran</TH>
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
                    <span className="block text-xs font-normal text-slate-500 md:hidden">
                      {[p.company, p.phone, p.role].filter(Boolean).join(" · ")}
                    </span>
                  </TD>
                  <TD className="hidden sm:table-cell">{p.id_number ?? "-"}</TD>
                  <TD className="hidden md:table-cell">{p.company ?? "-"}</TD>
                  <TD className="hidden md:table-cell">{p.phone ?? "-"}</TD>
                  <TD className="hidden sm:table-cell">{p.role ?? "-"}</TD>
                  {editable && (
                    <TD className="text-right">
                      <form action={removePersonnel}>
                        {hidden}
                        <input type="hidden" name="row_id" value={p.id} />
                        <ConfirmSubmit variant="ghost" size="sm" pendingText="…" confirm={`Hapus ${p.full_name} dari daftar personel?`}>
                          Hapus
                        </ConfirmSubmit>
                      </form>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-slate-500">
            {editable ? "Belum ada personel. Tambahkan orang yang akan masuk lokasi di bawah." : "Tidak ada personel terdaftar."}
          </CardContent>
        )}
        {editable && (
          <CardContent className="border-t border-slate-100">
            <p className="mb-2 text-sm font-medium text-slate-700">Tambah personel</p>
            <form action={addPersonnel} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {hidden}
              <Input name="full_name" placeholder="Nama lengkap *" required aria-label="Nama lengkap" />
              <Input name="id_number" placeholder="No. KTP / ID" aria-label="No. KTP / ID" />
              <Input name="company" placeholder="Perusahaan" aria-label="Perusahaan" />
              <Input name="phone" type="tel" placeholder="No. HP" aria-label="No. HP" />
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
                <TH>Nama barang</TH>
                <TH className="hidden sm:table-cell">Merk / model</TH>
                <TH className="hidden md:table-cell">Nomor seri</TH>
                <TH className="text-right">Jumlah</TH>
                {editable && <TH />}
              </tr>
            </THead>
            <TBody>
              {items.map((it) => (
                <TR key={it.id}>
                  <TD>
                    <Badge tone={it.direction === "masuk" ? "blue" : "orange"}>{it.direction === "masuk" ? "Masuk" : "Keluar"}</Badge>
                  </TD>
                  <TD className="font-medium text-slate-900">
                    {it.name}
                    <span className="block text-xs font-normal text-slate-500 md:hidden">
                      {[it.brand_model, it.serial_number && `SN ${it.serial_number}`].filter(Boolean).join(" · ")}
                    </span>
                  </TD>
                  <TD className="hidden sm:table-cell">{it.brand_model ?? "-"}</TD>
                  <TD className="hidden font-mono text-xs md:table-cell">{it.serial_number ?? "-"}</TD>
                  <TD className="text-right tabular-nums">{it.qty}</TD>
                  {editable && (
                    <TD className="text-right">
                      <form action={removeItem}>
                        {hidden}
                        <input type="hidden" name="row_id" value={it.id} />
                        <ConfirmSubmit variant="ghost" size="sm" pendingText="…" confirm={`Hapus barang "${it.name}"?`}>
                          Hapus
                        </ConfirmSubmit>
                      </form>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-slate-500">Tidak ada barang yang dibawa masuk/keluar.</CardContent>
        )}
        {editable && (
          <CardContent className="border-t border-slate-100">
            <p className="mb-2 text-sm font-medium text-slate-700">Tambah barang</p>
            <form action={addItem} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {hidden}
              <Select name="direction" defaultValue="masuk" aria-label="Arah barang">
                <option value="masuk">Masuk</option>
                <option value="keluar">Keluar</option>
              </Select>
              <Input name="name" placeholder="Nama barang *" required aria-label="Nama barang" />
              <Input name="brand_model" placeholder="Merk / model" aria-label="Merk / model" />
              <Input name="serial_number" placeholder="Nomor seri" aria-label="Nomor seri" />
              <Input type="number" name="qty" min={1} defaultValue={1} aria-label="Jumlah" />
              <SubmitButton variant="secondary">Tambah</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------ kunjungan */}
      <Card>
        <CardHeader>
          <CardTitle>Log kunjungan</CardTitle>
          <span className="text-xs text-slate-500">Catatan kedatangan & kepulangan personel di lokasi.</span>
        </CardHeader>
        {visits.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Personel</TH>
                <TH>Check-in</TH>
                <TH>Check-out</TH>
                <TH className="hidden md:table-cell">Catatan</TH>
                {auth.can("permit.checkin") && <TH />}
              </tr>
            </THead>
            <TBody>
              {visits.map((v) => (
                <TR key={v.id}>
                  <TD className="font-medium text-slate-900">
                    {(v.personnel_id && personName.get(v.personnel_id)) || "-"}
                    {v.note && <span className="block text-xs font-normal text-slate-500 md:hidden">{v.note}</span>}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDateTime(v.check_in_at)}
                    <span className="block text-xs text-slate-400">oleh {nameOf(names, v.checked_in_by, auth.userId)}</span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {v.check_out_at ? (
                      <>
                        {formatDateTime(v.check_out_at)}
                        <span className="block text-xs text-slate-400">oleh {nameOf(names, v.checked_out_by, auth.userId)}</span>
                      </>
                    ) : (
                      <Badge tone="green">Masih di lokasi</Badge>
                    )}
                  </TD>
                  <TD className="hidden md:table-cell">{v.note ?? "-"}</TD>
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
          <CardContent className="text-sm text-slate-500">
            {canCheckin
              ? "Belum ada kunjungan. Catat check-in saat personel tiba di lokasi."
              : ["approved", "active"].includes(status)
                ? "Belum ada kunjungan."
                : "Check-in bisa dicatat setelah izin disetujui."}
          </CardContent>
        )}
        {canCheckin && (
          <CardContent className="border-t border-slate-100">
            {notOnSite.length > 0 ? (
              <form action={checkIn} className="flex flex-wrap items-end gap-2">
                {hidden}
                <Field label="Check-in personel" required className="min-w-0 flex-1 sm:min-w-52">
                  <Select name="personnel_id" required defaultValue="">
                    <option value="" disabled>
                      Pilih personel…
                    </option>
                    {notOnSite.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.company ? ` (${p.company})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Catatan" className="min-w-0 flex-1 sm:min-w-52">
                  <Input name="note" placeholder="Opsional, mis. no. kartu tamu" />
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
              <Field label="Catatan penutupan" hint="Ringkas hasil pekerjaan dan kondisi akhir lokasi/perangkat.">
                <Textarea name="closing_note" rows={3} placeholder="mis. Modul optik terpasang, link normal, area sudah bersih." />
              </Field>
              <ConfirmSubmit
                variant="success"
                pendingText="Menyimpan…"
                disabled={onSite.size > 0}
                confirm="Tandai izin ini selesai? Setelah selesai, check-in tidak bisa dicatat lagi."
              >
                Tandai selesai
              </ConfirmSubmit>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{children}</dd>
    </div>
  );
}

const STEP_MARKER = {
  done: "bg-emerald-600 text-white",
  rejected: "bg-red-600 text-white",
  current: "bg-amber-400 text-amber-950 ring-4 ring-amber-100",
  idle: "bg-slate-200 text-slate-600",
};

/** Satu titik di garis waktu persetujuan. */
function Step({
  state,
  marker,
  children,
}: {
  state: keyof typeof STEP_MARKER;
  marker: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0 [&:last-child>span:first-child]:hidden">
      <span className="absolute left-3 top-7 -bottom-0 w-px bg-slate-200" aria-hidden />
      <span
        className={cn("relative z-[1] grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", STEP_MARKER[state])}
        aria-hidden
      >
        {marker}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}
