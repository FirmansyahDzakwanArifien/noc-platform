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
import { Plus } from "lucide-react";
import { LEAVE_TYPES } from "@/lib/labels";
import { nameOf, profileNames, type SearchParams } from "@/lib/util";
import { acceptSwap, cancelLeave, decideLeave } from "./actions";

export const metadata = { title: "Cuti & Izin" };

type Row = LeaveRequest & {
  shift_schedules: {
    work_date: string;
    shifts: { name: string; start_time: string | null; end_time: string | null } | null;
  } | null;
};

const SELECT = "*, shift_schedules(work_date, shifts(name, start_time, end_time))";

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
      .order("start_date"),
    canApprove
      ? supabase.from("leave_requests").select(SELECT).eq("status", "pending").neq("user_id", auth.userId).order("start_date")
      : Promise.resolve({ data: [] }),
  ]);
  const mine = (mineRes.data ?? []) as Row[];
  const swapForMe = (swapRes.data ?? []) as Row[];
  const pending = (pendingRes.data ?? []) as Row[];

  if (!canRequest && !canApprove && mine.length === 0 && swapForMe.length === 0) return <Forbidden />;

  const all = [...mine, ...swapForMe, ...pending];
  const names = await profileNames(
    supabase,
    all.flatMap((r) => [r.user_id, r.swap_with, r.approver_id]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuti & Izin"
        description="Cuti, izin, sakit, dinas, dan tukar shift."
        actions={
          canRequest && (
            <>
              <Link href="/cuti/baru?jenis=tukar_shift" className={buttonClass("secondary")}>
                Tukar shift
              </Link>
              <Link href="/cuti/baru" className={buttonClass()}>
                <Plus className="size-4" aria-hidden /> Ajukan
              </Link>
            </>
          )
        }
      />
      <Flash searchParams={sp} />

      {swapForMe.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Permintaan tukar shift untuk saya ({swapForMe.length})</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100">
            {swapForMe.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {nameOf(names, r.user_id)} meminta Anda menggantikan shift
                  </p>
                  <p className="text-slate-600">
                    <ShiftInfo row={r} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Alasan: {r.reason}</p>
                </div>
                <form action={acceptSwap}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton variant="success" size="sm" pendingText="Memproses…">
                    Setujui tukar shift
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canApprove && (
        <Card>
          <CardHeader>
            <CardTitle>Menunggu persetujuan ({pending.length})</CardTitle>
          </CardHeader>
          {pending.length === 0 ? (
            <CardContent className="text-sm text-slate-500">Tidak ada permintaan yang menunggu.</CardContent>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((r) => {
                const waitingPartner = r.leave_type === "tukar_shift" && !r.swap_accepted_at;
                return (
                  <li key={r.id} className="space-y-3 px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{nameOf(names, r.user_id)}</span>
                      <Badge tone="purple">{LEAVE_TYPES[r.leave_type] ?? r.leave_type}</Badge>
                      <span className="font-mono text-xs text-slate-400">{r.request_no}</span>
                    </div>
                    <p className="text-slate-600">
                      {r.leave_type === "tukar_shift" ? (
                        <>
                          <ShiftInfo row={r} /> → digantikan {nameOf(names, r.swap_with)}{" "}
                          {r.swap_accepted_at ? (
                            <Badge tone="green">Rekan setuju {formatDateTime(r.swap_accepted_at)}</Badge>
                          ) : (
                            <Badge tone="yellow">Menunggu persetujuan rekan</Badge>
                          )}
                        </>
                      ) : (
                        <Period row={r} />
                      )}
                    </p>
                    <p className="text-slate-600">Alasan: {r.reason}</p>
                    <form action={decideLeave} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="decision_note" placeholder="Catatan (wajib bila menolak)" className="min-w-52 flex-1" aria-label="Catatan keputusan" />
                      <SubmitButton name="decision" value="approved" variant="success" size="sm" disabled={waitingPartner} pendingText="…">
                        Setujui
                      </SubmitButton>
                      <SubmitButton name="decision" value="rejected" variant="danger" size="sm" pendingText="…">
                        Tolak
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {(canRequest || mine.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Permintaan saya</CardTitle>
          </CardHeader>
          {mine.length === 0 ? (
            <CardContent className="text-sm text-slate-500">Belum ada permintaan.</CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>No</TH>
                  <TH>Jenis</TH>
                  <TH>Tanggal</TH>
                  <TH>Keterangan</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {mine.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">{r.request_no ?? "-"}</TD>
                    <TD className="whitespace-nowrap">{LEAVE_TYPES[r.leave_type] ?? r.leave_type}</TD>
                    <TD className="whitespace-nowrap">
                      {r.leave_type === "tukar_shift" ? <ShiftInfo row={r} /> : <Period row={r} />}
                    </TD>
                    <TD className="min-w-48">
                      <p>{r.reason}</p>
                      {r.leave_type === "tukar_shift" && (
                        <p className="mt-1 text-xs text-slate-500">
                          Rekan: {nameOf(names, r.swap_with)} ·{" "}
                          {r.swap_accepted_at ? "sudah setuju" : "belum menyetujui"}
                        </p>
                      )}
                      {r.decision_note && (
                        <p className="mt-1 text-xs text-slate-500">
                          Catatan {nameOf(names, r.approver_id)}: {r.decision_note}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-right">
                      {r.status === "pending" && (
                        <form action={cancelLeave}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton variant="ghost" size="sm" pendingText="…">
                            Batalkan
                          </SubmitButton>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Period({ row }: { row: LeaveRequest }) {
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
