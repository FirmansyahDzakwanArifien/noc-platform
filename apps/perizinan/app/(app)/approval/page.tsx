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
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { PERMIT_TYPES } from "@/lib/labels";
import { nameOf, profileNames, type SearchParams } from "@/lib/util";

export const metadata = { title: "Approval Saya" };

type Row = PermitApproval & {
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
    .select("*, permits(id, permit_no, title, permit_type, status, start_at, end_at, requested_by, risk_level, sites(code, name))")
    .eq("approver_id", auth.userId)
    .eq("decision", "pending")
    .order("step");
  const rows = ((data ?? []) as Row[])
    .filter((r) => r.permits)
    .sort((a, b) => (a.permits!.start_at < b.permits!.start_at ? -1 : 1));

  // Status step sebelumnya: apakah giliran saya?
  const permitIds = [...new Set(rows.map((r) => r.permit_id))];
  const { data: stepRows } = permitIds.length
    ? await supabase.from("permit_approvals").select("permit_id, step, decision").in("permit_id", permitIds)
    : { data: [] };
  const steps = (stepRows ?? []) as Pick<PermitApproval, "permit_id" | "step" | "decision">[];
  const myTurn = (r: Row) =>
    ["submitted", "in_review"].includes(r.permits!.status) &&
    steps.every((s) => s.permit_id !== r.permit_id || s.step >= r.step || s.decision === "approved");

  const names = await profileNames(supabase, rows.map((r) => r.permits?.requested_by));

  return (
    <div>
      <PageHeader title="Approval Saya" description="Langkah approval izin kerja yang menunggu keputusan Anda." />
      <Flash searchParams={sp} />
      {error ? (
        <EmptyState title="Gagal memuat data" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada approval tertunda" description="Semua izin sudah Anda putuskan." />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>No</TH>
                <TH>Judul</TH>
                <TH>Jenis</TH>
                <TH>Site</TH>
                <TH>Periode</TH>
                <TH>Pemohon</TH>
                <TH>Step</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const p = r.permits!;
                const turn = myTurn(r);
                return (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">{p.permit_no ?? "-"}</TD>
                    <TD>
                      <Link href={`/${p.id}`} className="font-medium text-slate-900 hover:underline">
                        {p.title}
                      </Link>
                      <div className="mt-1 flex gap-1">
                        <StatusBadge status={p.status} />
                        <StatusBadge status={p.risk_level} />
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{PERMIT_TYPES[p.permit_type] ?? p.permit_type}</TD>
                    <TD className="whitespace-nowrap">{p.sites ? `${p.sites.code} · ${p.sites.name}` : "-"}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {formatDateTime(p.start_at)}
                      <br />
                      s/d {formatDateTime(p.end_at)}
                    </TD>
                    <TD className="whitespace-nowrap">{nameOf(names, p.requested_by, auth.userId)}</TD>
                    <TD className="whitespace-nowrap">
                      {r.step}
                      {!turn && (
                        <Badge tone="gray" className="ml-2">
                          Menunggu step sebelumnya
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Link href={`/${p.id}`} className={buttonClass(turn ? "primary" : "secondary", "sm")}>
                        {turn ? "Tinjau & putuskan" : "Lihat"}
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
