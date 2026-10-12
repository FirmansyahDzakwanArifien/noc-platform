import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Permit } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  EmptyState,
  Flash,
  formatDateTime,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { Plus } from "lucide-react";
import { isPermitStatus, isPermitType, PERMIT_STATUSES, PERMIT_TYPES } from "@/lib/labels";
import { first, nameOf, profileNames, type SearchParams } from "@/lib/util";

export const metadata = { title: "Izin Kerja" };

type Row = Permit & { sites: { code: string; name: string } | null };

export default async function PermitListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();

  const status = first(sp.status);
  const type = first(sp.type);

  let query = supabase.from("permits").select("*, sites(code, name)").order("created_at", { ascending: false }).limit(200);
  if (isPermitStatus(status)) query = query.eq("status", status);
  if (isPermitType(type)) query = query.eq("permit_type", type);
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const names = await profileNames(supabase, rows.map((r) => r.requested_by));

  return (
    <div>
      <PageHeader
        title="Izin Kerja & Akses Site"
        description={auth.can("permit.view") ? "Semua izin kerja/akses site." : "Izin yang Anda ajukan."}
        actions={
          auth.can("permit.create") && (
            <Link href="/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Ajukan izin
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="status" defaultValue={isPermitStatus(status) ? status : ""} className="w-auto min-w-40" aria-label="Status">
          <option value="">Semua status</option>
          {Object.entries(PERMIT_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={isPermitType(type) ? type : ""} className="w-auto min-w-40" aria-label="Jenis">
          <option value="">Semua jenis</option>
          {Object.entries(PERMIT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filter
        </button>
        {(status || type) && (
          <Link href="/" className={buttonClass("ghost")}>
            Reset
          </Link>
        )}
      </form>

      {error ? (
        <EmptyState title="Gagal memuat data" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada izin" description="Tidak ada izin yang cocok dengan filter." />
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
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/${r.id}`} className="text-brand-600 hover:underline">
                      {r.permit_no ?? "(draft)"}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {r.title}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{PERMIT_TYPES[r.permit_type] ?? r.permit_type}</TD>
                  <TD className="whitespace-nowrap">{r.sites ? `${r.sites.code} · ${r.sites.name}` : "-"}</TD>
                  <TD className="whitespace-nowrap text-xs">
                    {formatDateTime(r.start_at)}
                    <br />
                    s/d {formatDateTime(r.end_at)}
                  </TD>
                  <TD className="whitespace-nowrap">{nameOf(names, r.requested_by, auth.userId)}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
