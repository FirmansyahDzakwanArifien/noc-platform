import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Permit, PermitApproval } from "@noc/supabase/types";
import {
  Badge,
  buttonClass,
  Card,
  EmptyState,
  Flash,
  Forbidden,
  formatDateTime,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { RiskBadge } from "@/components/risk-badge";
import { PERMIT_TYPES } from "@/lib/labels";
import { nameOf, profileNames, type SearchParams } from "@/lib/util";

export const metadata = { title: "Persetujuan Saya" };

type Row = Pick<PermitApproval, "id" | "permit_id" | "step"> & {
  permits:
    | (Pick<Permit, "id" | "permit_no" | "title" | "permit_type" | "status" | "start_at" | "end_at" | "requested_by" | "risk_level"> & {
        sites: { code: string; name: string } | null;
      })
    | null;
};

export default async function ApprovalPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("permit.approve")) return <Forbidden />;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permit_approvals")
    .select("id, permit_id, step, permits(id, permit_no, title, permit_type, status, start_at, end_at, requested_by, risk_level, sites(code, name))")
    .eq("approver_id", auth.userId)
    .eq("decision", "pending")
    .order("step")
    .limit(200);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.permits && ["submitted", "in_review"].includes(r.permits.status));

  // Status step sebelumnya (apakah giliran saya?) + nama pemohon — keduanya hanya bergantung pada rows.
  const permitIds = [...new Set(rows.map((r) => r.permit_id))];
  const [stepRes, names] = await Promise.all([
    permitIds.length
      ? supabase.from("permit_approvals").select("permit_id, step, decision").in("permit_id", permitIds)
      : Promise.resolve({ data: [] }),
    profileNames(supabase, rows.map((r) => r.permits?.requested_by)),
  ]);
  const steps = (stepRes.data ?? []) as Pick<PermitApproval, "permit_id" | "step" | "decision">[];
  const myTurn = (r: Row) => steps.every((s) => s.permit_id !== r.permit_id || s.step >= r.step || s.decision === "approved");

  // Giliran saya dulu, lalu urut jadwal mulai terdekat.
  const sorted = rows
    .map((r) => ({ r, turn: myTurn(r) }))
    .sort((a, b) => Number(b.turn) - Number(a.turn) || (a.r.permits!.start_at < b.r.permits!.start_at ? -1 : 1));
  const turnCount = sorted.filter((x) => x.turn).length;

  return (
    <div>
      <PageHeader
        title="Persetujuan Saya"
        description="Izin kerja yang menunggu keputusan Anda sebagai approver. Buka izin untuk meninjau lalu setujui atau tolak."
      />
      <Flash searchParams={sp} />
      {error ? (
        <EmptyState title="Gagal memuat daftar persetujuan" description="Periksa koneksi Anda lalu muat ulang halaman." />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Tidak ada izin yang menunggu keputusan Anda"
          description="Izin akan muncul di sini saat pengelola izin menunjuk Anda sebagai approver."
          action={
            <Link href="/" className={buttonClass("secondary")}>
              Lihat semua izin
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {turnCount > 0 ? (
              <>
                <b className="text-slate-900">{turnCount} izin</b> siap Anda putuskan sekarang.
              </>
            ) : (
              "Belum ada yang bisa Anda putuskan — semua masih menunggu approver di langkah sebelumnya."
            )}
          </p>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Izin</TH>
                  <TH className="hidden lg:table-cell">Site</TH>
                  <TH className="hidden sm:table-cell">Jadwal (WIB)</TH>
                  <TH className="hidden md:table-cell">Pemohon</TH>
                  <TH className="hidden sm:table-cell">Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {sorted.map(({ r, turn }) => {
                  const p = r.permits!;
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/${p.id}`} className="font-medium text-slate-900 hover:underline">
                          {p.title}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {PERMIT_TYPES[p.permit_type] ?? p.permit_type}
                          {p.permit_no ? ` · ${p.permit_no}` : ""}
                          <span className="lg:hidden">{p.sites ? ` · ${p.sites.code}` : ""}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <RiskBadge level={p.risk_level} />
                          <span className="sm:hidden">
                            <TurnBadge turn={turn} step={r.step} />
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 sm:hidden">Mulai {formatDateTime(p.start_at)}</span>
                      </TD>
                      <TD className="hidden whitespace-nowrap lg:table-cell">{p.sites ? `${p.sites.code} · ${p.sites.name}` : "-"}</TD>
                      <TD className="hidden whitespace-nowrap text-xs sm:table-cell">
                        {formatDateTime(p.start_at)}
                        <br />
                        s/d {formatDateTime(p.end_at)}
                      </TD>
                      <TD className="hidden whitespace-nowrap md:table-cell">{nameOf(names, p.requested_by, auth.userId)}</TD>
                      <TD className="hidden sm:table-cell">
                        <TurnBadge turn={turn} step={r.step} />
                      </TD>
                      <TD className="text-right">
                        <Link href={`/${p.id}#persetujuan`} className={buttonClass(turn ? "primary" : "secondary", "sm")}>
                          {turn ? "Tinjau" : "Lihat"}
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function TurnBadge({ turn, step }: { turn: boolean; step: number }) {
  return turn ? (
    <Badge tone="yellow">Giliran Anda · langkah {step}</Badge>
  ) : (
    <Badge tone="gray">Menunggu langkah sebelumnya</Badge>
  );
}
