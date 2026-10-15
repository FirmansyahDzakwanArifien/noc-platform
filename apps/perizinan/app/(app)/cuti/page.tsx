import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { LeaveRequest } from "@noc/supabase/types";
import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Flash,
  Forbidden,
  formatDate,
  formatDateTime,
  formatTime,
  Input,
  PageHeader,
  StatusBadge,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { ArrowLeftRight, Plus } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { LEAVE_TYPES } from "@/lib/labels";
import { nameOf, profileNames, type SearchParams } from "@/lib/util";
import { acceptSwap, cancelLeave, decideLeave, declineSwap } from "./actions";

export const metadata = { title: "Cuti & Tukar Shift" };

type Row = LeaveRequest & {
  shift_schedules: {
    work_date: string;
    shifts: { name: string; start_time: string | null; end_time: string | null } | null;
  } | null;
};

const SELECT =
  "id, request_no, user_id, leave_type, start_date, end_date, swap_with, swap_accepted_at, reason, status, approver_id, decided_at, decision_note, shift_schedules(work_date, shifts(name, start_time, end_time))";

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const canRequest = auth.can("leave.request");
  const canApprove = auth.can("leave.approve");
  const supabase = await createClient();

  const [mineRes, swapRes, pendingRes] = await Promise.all([
    supabase.from("leave_requests").select(SELECT).eq("user_id", auth.userId).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("leave_requests")
      .select(SELECT)
      .eq("swap_with", auth.userId)
      .eq("leave_type", "tukar_shift")
      .eq("status", "pending")
      .is("swap_accepted_at", null)
      .order("start_date")
      .limit(50),
    canApprove
      ? supabase.from("leave_requests").select(SELECT).eq("status", "pending").neq("user_id", auth.userId).order("start_date").limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const mine = (mineRes.data ?? []) as unknown as Row[];
  const swapForMe = (swapRes.data ?? []) as unknown as Row[];
  const pending = (pendingRes.data ?? []) as unknown as Row[];

  if (!canRequest && !canApprove && mine.length === 0 && swapForMe.length === 0) return <Forbidden />;

  const all = [...mine, ...swapForMe, ...pending];
  const names = await profileNames(
    supabase,
    all.flatMap((r) => [r.user_id, r.swap_with, r.approver_id]),
  );
  const who = (id: string | null) => {
    const n = nameOf(names, id, auth.userId);
    return n === "-" ? "rekan" : n;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuti, Izin & Tukar Shift"
        description={
          canApprove
            ? "Ajukan atau putuskan permintaan cuti, izin, sakit, dinas, dan tukar shift personel."
            : "Ajukan cuti, izin, sakit, dinas, atau tukar shift, dan pantau status persetujuannya."
        }
        actions={
          canRequest && (
            <>
              <Link href="/cuti/baru?jenis=tukar_shift" className={buttonClass("secondary")}>
                <ArrowLeftRight className="size-4" aria-hidden /> Tukar shift
              </Link>
              <Link href="/cuti/baru" className={buttonClass()}>
                <Plus className="size-4" aria-hidden /> Ajukan cuti / izin
              </Link>
            </>
          )
        }
      />
      <Flash searchParams={sp} />

      {swapForMe.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle>Rekan meminta Anda menggantikan shift ({swapForMe.length})</CardTitle>
            <span className="text-xs text-slate-500">Setelah Anda setuju, permintaan diteruskan ke atasan.</span>
          </CardHeader>
          <ul className="divide-y divide-slate-100">
            {swapForMe.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{who(r.user_id)} meminta Anda menggantikan shift-nya</p>
                  <p className="text-slate-600">
                    <ShiftInfo row={r} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Alasan: {r.reason}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                  <form action={acceptSwap}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmSubmit
                      variant="success"
                      size="sm"
                      pendingText="Memproses…"
                      confirm="Anda bersedia menggantikan shift ini? Persetujuan Anda tidak bisa ditarik kembali."
                      className="w-full sm:w-auto"
                    >
                      Saya bersedia menggantikan
                    </ConfirmSubmit>
                  </form>
                  <form action={declineSwap} className="flex w-full gap-2 sm:w-auto">
                    <input type="hidden" name="id" value={r.id} />
                    <Input name="note" placeholder="Alasan (opsional)" maxLength={200} className="h-8 min-w-0 flex-1 text-xs sm:w-44" />
                    <ConfirmSubmit
                      variant="ghost"
                      size="sm"
                      pendingText="…"
                      confirm="Tolak permintaan tukar shift ini?"
                      className="text-red-600 hover:bg-red-50"
                    >
                      Tidak bisa
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <CardContent className="border-t border-slate-100 py-3 text-xs text-slate-500">
            Tidak bisa menggantikan? Klik “Tidak bisa” — rekan Anda langsung mendapat notifikasi agar mencari pengganti lain.
          </CardContent>
        </Card>
      )}

      {canApprove && (
        <Card>
          <CardHeader>
            <CardTitle>Menunggu keputusan Anda ({pending.length})</CardTitle>
          </CardHeader>
          {pending.length === 0 ? (
            <CardContent className="text-sm text-slate-500">Tidak ada permintaan yang perlu diputuskan.</CardContent>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((r) => {
                const waitingPartner = r.leave_type === "tukar_shift" && !r.swap_accepted_at;
                return (
                  <li key={r.id} className="space-y-2 px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{nameOf(names, r.user_id)}</span>
                      <Badge tone="purple">{LEAVE_TYPES[r.leave_type] ?? r.leave_type}</Badge>
                      {r.request_no && <span className="font-mono text-xs text-slate-400">{r.request_no}</span>}
                    </div>
                    <p className="text-slate-600">
                      {r.leave_type === "tukar_shift" ? (
                        <>
                          <ShiftInfo row={r} /> · digantikan <b className="font-medium">{who(r.swap_with)}</b>
                        </>
                      ) : (
                        <Period row={r} />
                      )}
                    </p>
                    <p className="text-slate-600">Alasan: {r.reason}</p>
                    {r.leave_type === "tukar_shift" &&
                      (r.swap_accepted_at ? (
                        <Badge tone="green">Rekan sudah bersedia · {formatDateTime(r.swap_accepted_at)}</Badge>
                      ) : (
                        <Badge tone="yellow">Menunggu {who(r.swap_with)} menyetujui tukar shift</Badge>
                      ))}
                    <form action={decideLeave} className="flex flex-wrap items-center gap-2 pt-1">
                      <input type="hidden" name="id" value={r.id} />
                      <Input
                        name="decision_note"
                        placeholder="Catatan (wajib bila menolak)"
                        className="min-w-0 flex-1 basis-full sm:basis-52"
                        aria-label="Catatan keputusan"
                      />
                      <SubmitButton name="decision" value="approved" variant="success" size="sm" disabled={waitingPartner} pendingText="…">
                        Setujui
                      </SubmitButton>
                      <ConfirmSubmit
                        name="decision"
                        value="rejected"
                        variant="danger"
                        size="sm"
                        pendingText="…"
                        confirm="Tolak permintaan ini?"
                      >
                        Tolak
                      </ConfirmSubmit>
                    </form>
                    {waitingPartner && (
                      <p className="text-xs text-slate-500">Tombol Setujui aktif setelah rekan pengganti menyatakan bersedia.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {(canRequest || mine.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Permintaan saya</h2>
          {mine.length === 0 ? (
            <EmptyState
              title="Belum ada permintaan"
              description="Ajukan cuti, izin, sakit, atau dinas; atau minta rekan menggantikan shift Anda."
              action={
                canRequest && (
                  <Link href="/cuti/baru" className={buttonClass()}>
                    <Plus className="size-4" aria-hidden /> Ajukan cuti / izin
                  </Link>
                )
              }
            />
          ) : (
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH>Permintaan</TH>
                    <TH className="hidden md:table-cell">Keterangan</TH>
                    <TH>Status</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {mine.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <span className="font-medium text-slate-900">{LEAVE_TYPES[r.leave_type] ?? r.leave_type}</span>
                        <span className="block text-xs text-slate-600">
                          {r.leave_type === "tukar_shift" ? <ShiftInfo row={r} /> : <Period row={r} />}
                        </span>
                        {r.request_no && <span className="block font-mono text-xs text-slate-400">{r.request_no}</span>}
                        <span className="mt-1 block text-xs text-slate-500 md:hidden">{r.reason}</span>
                      </TD>
                      <TD className="hidden min-w-48 md:table-cell">
                        <p>{r.reason}</p>
                        {r.leave_type === "tukar_shift" && <p className="mt-1 text-xs text-slate-500">Pengganti: {who(r.swap_with)}</p>}
                        {r.decision_note && (
                          <p className="mt-1 text-xs text-slate-500">
                            Catatan {nameOf(names, r.approver_id) === "-" ? "atasan" : nameOf(names, r.approver_id)}: {r.decision_note}
                          </p>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={r.status} />
                        {r.status === "pending" && (
                          <span className="mt-1 block text-xs text-slate-500">
                            {r.leave_type === "tukar_shift" && !r.swap_accepted_at
                              ? `Menunggu ${who(r.swap_with)} menyetujui tukar shift`
                              : "Menunggu persetujuan atasan"}
                          </span>
                        )}
                        {r.decision_note && (
                          <span className="mt-1 block text-xs text-slate-500 md:hidden">Catatan: {r.decision_note}</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        {r.status === "pending" && (
                          <form action={cancelLeave}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmSubmit variant="ghost" size="sm" pendingText="…" confirm="Batalkan permintaan ini?">
                              Batalkan
                            </ConfirmSubmit>
                          </form>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Period({ row }: { row: Pick<LeaveRequest, "start_date" | "end_date"> }) {
  return row.start_date === row.end_date ? (
    <>{formatDate(row.start_date)}</>
  ) : (
    <>
      {formatDate(row.start_date)} – {formatDate(row.end_date)}
    </>
  );
}

function ShiftInfo({ row }: { row: Row }) {
  const s = row.shift_schedules;
  if (!s) return <>{formatDate(row.start_date)}</>;
  return (
    <>
      {formatDate(s.work_date)}
      {s.shifts && (
        <>
          {" "}
          · {s.shifts.name} ({formatTime(s.shifts.start_time)}–{formatTime(s.shifts.end_time)})
        </>
      )}
    </>
  );
}
