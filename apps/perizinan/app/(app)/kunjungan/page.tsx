import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { PermitPersonnel, PermitStatus, PermitType } from "@noc/supabase/types";
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

type OpenVisit = {
  id: string;
  personnel_id: string | null;
  check_in_at: string;
  permit_personnel: { full_name: string; company: string | null } | null;
  permits: { id: string; permit_no: string | null; title: string; sites: { code: string; name: string } | null } | null;
};

type ActivePermit = {
  id: string;
  permit_no: string | null;
  title: string;
  permit_type: PermitType;
  status: PermitStatus;
  start_at: string;
  end_at: string;
  site_code: string;
  site_name: string;
  vendor_name: string | null;
};

type Person = Pick<PermitPersonnel, "id" | "permit_id" | "full_name" | "company">;

export default async function VisitsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("permit.checkin")) return <Forbidden />;
  const supabase = await createClient();

  const today = toDateInput();
  const dayStart = `${today}T00:00:00+07:00`;
  const dayEnd = `${today}T23:59:59+07:00`;

  // Tiga query paralel; personel diambil lewat join ke permits dengan filter yang sama,
  // lalu dicocokkan dengan daftar izin aktif di bawah.
  const [openRes, activeRes, personnelRes] = await Promise.all([
    supabase
      .from("permit_visits")
      .select("id, personnel_id, check_in_at, permit_personnel(full_name, company), permits(id, permit_no, title, sites(code, name))")
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_active_permits")
      .select("id, permit_no, title, permit_type, status, start_at, end_at, site_code, site_name, vendor_name")
      .lte("start_at", dayEnd)
      .gte("end_at", dayStart)
      .order("start_at")
      .limit(100),
    supabase
      .from("permit_personnel")
      .select("id, permit_id, full_name, company, permits!inner(status, start_at, end_at)")
      .in("permits.status", ["approved", "active"])
      .lte("permits.start_at", dayEnd)
      .gte("permits.end_at", dayStart)
      .order("full_name")
      .limit(1000),
  ]);
  const openVisits = (openRes.data ?? []) as unknown as OpenVisit[];
  const active = (activeRes.data ?? []) as ActivePermit[];
  const personnel = (personnelRes.data ?? []) as unknown as Person[];
  const onSite = new Set(openVisits.map((v) => v.personnel_id).filter(Boolean));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunjungan"
        description={`Catat personel yang datang (check-in) dan pulang (check-out) di lokasi. Izin yang berlaku hari ini, ${formatDate(today)}.`}
      />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Sedang di lokasi ({openVisits.length})</CardTitle>
          <span className="text-xs text-slate-500">Klik Check-out saat personel meninggalkan lokasi.</span>
        </CardHeader>
        {openVisits.length === 0 ? (
          <CardContent className="text-sm text-slate-500">Tidak ada personel yang sedang di lokasi.</CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Personel</TH>
                <TH className="hidden sm:table-cell">Izin</TH>
                <TH className="hidden md:table-cell">Site</TH>
                <TH className="hidden sm:table-cell">Check-in</TH>
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
                    <span className="block text-xs font-normal text-slate-500 sm:hidden">
                      Masuk {formatDateTime(v.check_in_at)}
                      {v.permits?.sites ? ` · ${v.permits.sites.code}` : ""}
                    </span>
                    {v.permits && (
                      <Link href={`/${v.permits.id}`} className="block text-xs font-normal text-brand-600 hover:underline sm:hidden">
                        {v.permits.title}
                      </Link>
                    )}
                  </TD>
                  <TD className="hidden sm:table-cell">
                    {v.permits ? (
                      <Link href={`/${v.permits.id}`} className="hover:underline">
                        <span className="block">{v.permits.title}</span>
                        <span className="font-mono text-xs text-slate-500">{v.permits.permit_no ?? "-"}</span>
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="hidden whitespace-nowrap md:table-cell">{v.permits?.sites ? v.permits.sites.code : "-"}</TD>
                  <TD className="hidden whitespace-nowrap sm:table-cell">{formatDateTime(v.check_in_at)}</TD>
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
        <div>
          <h2 className="text-base font-semibold text-slate-900">Izin berlaku hari ini ({active.length})</h2>
          <p className="text-xs text-slate-500">Hanya izin yang sudah disetujui. Klik Check-in saat personel tiba.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState
            title="Tidak ada izin yang berlaku hari ini"
            description="Izin yang sudah disetujui dan jadwalnya mencakup hari ini akan muncul di sini. Izin yang masih menunggu persetujuan tidak bisa di-check-in."
            action={
              <Link href="/?status=approved" className={buttonClass("secondary")}>
                Lihat izin disetujui
              </Link>
            }
          />
        ) : (
          active.map((p) => {
            const people = personnel.filter((x) => x.permit_id === p.id);
            const here = people.filter((x) => onSite.has(x.id)).length;
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <Link href={`/${p.id}`} className="font-medium text-slate-900 hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {PERMIT_TYPES[p.permit_type] ?? p.permit_type} · {p.site_code} {p.site_name}
                      {p.vendor_name ? ` · ${p.vendor_name}` : ""}
                      {p.permit_no ? <span className="font-mono"> · {p.permit_no}</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(p.start_at)} s/d {formatDateTime(p.end_at)} WIB
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {here > 0 && <Badge tone="green">{here} di lokasi</Badge>}
                    <StatusBadge status={p.status} />
                  </div>
                </CardHeader>
                {people.length === 0 ? (
                  <CardContent className="text-sm text-slate-500">
                    Tidak ada personel terdaftar di izin ini.{" "}
                    <Link href={`/${p.id}`} className="text-brand-600 hover:underline">
                      Buka izin
                    </Link>
                  </CardContent>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {people.map((x) => (
                      <li key={x.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">{x.full_name}</span>
                          {x.company && <span className="block truncate text-xs text-slate-500">{x.company}</span>}
                        </span>
                        {onSite.has(x.id) ? (
                          <Badge tone="green">Di lokasi</Badge>
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
