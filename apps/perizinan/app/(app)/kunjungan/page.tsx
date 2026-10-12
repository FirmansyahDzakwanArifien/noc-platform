import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Permit, PermitPersonnel, PermitVisit } from "@noc/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Flash,
  Forbidden,
  formatDateTime,
  PageHeader,
  StatusBadge,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toDateInput,
  TR,
} from "@noc/ui";
import { PERMIT_TYPES } from "@/lib/labels";
import type { SearchParams } from "@/lib/util";
import { checkIn, checkOut } from "../[id]/actions";

export const metadata = { title: "Kunjungan" };

const BACK = "/kunjungan";

type OpenVisit = PermitVisit & {
  permit_personnel: { full_name: string; company: string | null } | null;
  permits: { id: string; permit_no: string | null; title: string; sites: { code: string; name: string } | null } | null;
};

type ActivePermit = Permit & { site_code: string; site_name: string; vendor_name: string | null };

export default async function VisitsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("permit.checkin")) return <Forbidden />;
  const supabase = await createClient();

  const today = toDateInput();
  const dayStart = `${today}T00:00:00+07:00`;
  const dayEnd = `${today}T23:59:59+07:00`;

  const [openRes, activeRes] = await Promise.all([
    supabase
      .from("permit_visits")
      .select("*, permit_personnel(full_name, company), permits(id, permit_no, title, sites(code, name))")
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false }),
    supabase.from("v_active_permits").select("*").lte("start_at", dayEnd).gte("end_at", dayStart).order("start_at"),
  ]);
  const openVisits = (openRes.data ?? []) as OpenVisit[];
  const active = (activeRes.data ?? []) as ActivePermit[];

  const { data: personnelRows } = active.length
    ? await supabase
        .from("permit_personnel")
        .select("*")
        .in(
          "permit_id",
          active.map((p) => p.id),
        )
        .order("full_name")
    : { data: [] };
  const personnel = (personnelRows ?? []) as PermitPersonnel[];
  const onSite = new Set(openVisits.map((v) => v.personnel_id).filter(Boolean));

  return (
    <div className="space-y-6">
      <PageHeader title="Kunjungan" description={`Check-in / check-out personel di lokasi · hari ini`} />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Sedang di lokasi ({openVisits.length})</CardTitle>
        </CardHeader>
        {openVisits.length === 0 ? (
          <CardContent className="text-sm text-slate-500">Tidak ada personel yang sedang di lokasi.</CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Personel</TH>
                <TH>Izin</TH>
                <TH>Site</TH>
                <TH>Check-in</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {openVisits.map((v) => (
                <TR key={v.id}>
                  <TD className="font-medium text-slate-900">
                    {v.permit_personnel?.full_name ?? "-"}
                    {v.permit_personnel?.company && (
                      <span className="block text-xs font-normal text-slate-500">{v.permit_personnel.company}</span>
                    )}
                  </TD>
                  <TD>
                    {v.permits ? (
                      <Link href={`/${v.permits.id}`} className="hover:underline">
                        <span className="font-mono text-xs text-slate-500">{v.permits.permit_no ?? "-"}</span>
                        <span className="block">{v.permits.title}</span>
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{v.permits?.sites ? v.permits.sites.code : "-"}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(v.check_in_at)}</TD>
                  <TD className="text-right">
                    <form action={checkOut}>
                      <input type="hidden" name="visit_id" value={v.id} />
                      <input type="hidden" name="back" value={BACK} />
                      <SubmitButton variant="secondary" size="sm" pendingText="…">
                        Check-out
                      </SubmitButton>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Izin aktif hari ini ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState title="Tidak ada izin aktif hari ini" description="Izin yang disetujui/aktif untuk hari ini akan muncul di sini." />
        ) : (
          active.map((p) => {
            const people = personnel.filter((x) => x.permit_id === p.id);
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <Link href={`/${p.id}`} className="font-medium text-slate-900 hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{p.permit_no ?? "-"}</span> · {PERMIT_TYPES[p.permit_type] ?? p.permit_type} ·{" "}
                      {p.site_code} {p.site_name}
                      {p.vendor_name ? ` · ${p.vendor_name}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(p.start_at)} s/d {formatDateTime(p.end_at)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </CardHeader>
                {people.length === 0 ? (
                  <CardContent className="text-sm text-slate-500">Tidak ada personel terdaftar.</CardContent>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {people.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                        <span className="font-medium text-slate-900">{x.full_name}</span>
                        {x.company && <span className="text-xs text-slate-500">{x.company}</span>}
                        <span className="ml-auto">
                          {onSite.has(x.id) ? (
                            <span className="text-xs font-medium text-emerald-700">Di lokasi</span>
                          ) : (
                            <form action={checkIn}>
                              <input type="hidden" name="permit_id" value={p.id} />
                              <input type="hidden" name="personnel_id" value={x.id} />
                              <input type="hidden" name="back" value={BACK} />
                              <SubmitButton size="sm" pendingText="…">
                                Check-in
                              </SubmitButton>
                            </form>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
