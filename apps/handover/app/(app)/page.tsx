import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Handover } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  EmptyState,
  Flash,
  Forbidden,
  formatDate,
  Input,
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
import { ArrowRight, Plus } from "lucide-react";
import { loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { HANDOVER_STATUSES, isOneOf } from "@/lib/constants";
import { first, isDate } from "@/lib/util";

export const metadata = { title: "Handover" };

export default async function HandoverListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("handover.view")) return <Forbidden />;

  const status = first(sp.status) ?? "";
  const date = first(sp.date) ?? "";

  const supabase = await createClient();
  let q = supabase.from("handovers").select("*").order("shift_date", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (isOneOf(HANDOVER_STATUSES, status)) q = q.eq("status", status);
  if (isDate(date)) q = q.eq("shift_date", date);

  const [{ data }, profiles, shifts, sites] = await Promise.all([q, loadProfiles(supabase), loadShifts(supabase), loadSites(supabase)]);
  const rows = (data as Handover[] | null) ?? [];

  return (
    <div>
      <PageHeader
        title="Serah Terima Shift"
        description="Daftar handover antar shift."
        actions={
          auth.can("handover.create") && (
            <Link href="/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Buat handover
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="">Semua status</option>
            {HANDOVER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Input type="date" name="date" defaultValue={date} aria-label="Tanggal" />
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Filter
        </button>
        {(status || date) && (
          <Link href="/" className={buttonClass("ghost")}>
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada handover" description="Handover yang dibuat akan tampil di sini." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>No</TH>
                <TH>Tanggal</TH>
                <TH>Shift</TH>
                <TH>Site</TH>
                <TH>Penyerah</TH>
                <TH>Penerima</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((h) => (
                <TR key={h.id}>
                  <TD>
                    <Link href={`/${h.id}`} className="font-medium text-brand-600 hover:underline">
                      {h.handover_no ?? "(tanpa nomor)"}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(h.shift_date)}</TD>
                  <TD className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {shifts.name(h.from_shift_id)} <ArrowRight className="size-3.5 text-slate-400" aria-hidden /> {shifts.name(h.to_shift_id)}
                    </span>
                  </TD>
                  <TD>{sites.name(h.site_id)}</TD>
                  <TD>{profiles.name(h.outgoing_by)}</TD>
                  <TD>{profiles.name(h.incoming_by)}</TD>
                  <TD>
                    <StatusBadge status={h.status} />
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
