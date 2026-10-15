import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Handover } from "@noc/supabase/types";
import {
  Alert,
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
import { DivisionBadge } from "@/components/division-badge";
import { loadDivisions, loadProfiles, loadShifts, loadSites } from "@/lib/data";
import { HANDOVER_STATUSES, isOneOf } from "@/lib/constants";
import { first, isDate } from "@/lib/util";

export const metadata = { title: "Handover" };

type Row = Pick<
  Handover,
    | "id"
  | "handover_no"
  | "shift_date"
  | "from_shift_id"
  | "to_shift_id"
  | "site_id"
  | "outgoing_by"
  | "incoming_by"
  | "status"
  | "division_id"
>;

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
  const mine = first(sp.mine) === "1";
  const filtered = !!(status || date || mine);

  const supabase = await createClient();
  let q = supabase
    .from("handovers")
    .select("id, handover_no, shift_date, from_shift_id, to_shift_id, site_id, outgoing_by, incoming_by, status, division_id")
    .order("shift_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (isOneOf(HANDOVER_STATUSES, status)) q = q.eq("status", status);
  if (isDate(date)) q = q.eq("shift_date", date);
  if (mine) q = q.or(`outgoing_by.eq.${auth.userId},incoming_by.eq.${auth.userId}`);

  // Handover yang sedang menunggu tindakan user ini (diterima / diperbaiki).
  const toReceive = supabase
    .from("handovers")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .eq("incoming_by", auth.userId);
  const toFix = supabase
    .from("handovers")
    .select("id", { count: "exact", head: true })
    .eq("status", "returned")
    .eq("outgoing_by", auth.userId);

  const [{ data }, receive, fix, profiles, shifts, sites, divisions] = await Promise.all([
    q,
    toReceive,
    toFix,
    loadProfiles(supabase),
    loadShifts(supabase),
    loadSites(supabase),
    loadDivisions(supabase),
  ]);
  const rows = (data as Row[] | null) ?? [];
  const receiveCount = receive.count ?? 0;
  const fixCount = fix.count ?? 0;
  const canCreate = auth.can("handover.create");

  return (
    <div>
      <PageHeader
        title="Serah Terima Shift"
        description="Semua handover antar shift: buat, ajukan, dan terima kondisi shift dari rekan."
        actions={
          canCreate && (
            <Link href="/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Buat handover
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      {(receiveCount > 0 || fixCount > 0) && (
        <Alert tone="warning" className="mb-4 space-y-1">
          {receiveCount > 0 && (
            <p>
              <strong>{receiveCount} handover</strong> menunggu Anda terima.{" "}
              <Link href="/?status=submitted&mine=1" className="font-medium underline">
                Lihat
              </Link>
            </p>
          )}
          {fixCount > 0 && (
            <p>
              <strong>{fixCount} handover</strong> Anda dikembalikan penerima dan perlu diperbaiki.{" "}
              <Link href="/?status=returned&mine=1" className="font-medium underline">
                Lihat
              </Link>
            </p>
          )}
        </Alert>
      )}

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-40">
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="">Semua status</option>
            {HANDOVER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Input type="date" name="date" defaultValue={date} aria-label="Tanggal shift" />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 rounded border-slate-300" />
          Hanya yang melibatkan saya
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Terapkan
        </button>
        {filtered && (
          <Link href="/" className={buttonClass("ghost")}>
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Tidak ada handover yang cocok"
            description="Coba ubah atau reset filter status, tanggal, dan keterlibatan Anda."
            action={
              <Link href="/" className={buttonClass("secondary")}>
                Reset filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Belum ada handover"
            description={
              canCreate
                ? "Buat handover di akhir shift untuk menyerahkan kondisi jaringan, pekerjaan tertunda, dan checklist ke shift berikutnya."
                : "Handover yang dibuat tim akan tampil di sini."
            }
            action={
              canCreate && (
                <Link href="/baru" className={buttonClass()}>
                  <Plus className="size-4" aria-hidden /> Buat handover pertama
                </Link>
              )
            }
          />
        )
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>No. handover</TH>
                <TH className="hidden sm:table-cell">Tanggal</TH>
                <TH className="hidden md:table-cell">Shift</TH>
                <TH className="hidden lg:table-cell">Site</TH>
                <TH className="hidden md:table-cell">Penyerah → Penerima</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((h) => {
                const shiftText = (
                  <span className="inline-flex items-center gap-1">
                    {shifts.name(h.from_shift_id)} <ArrowRight className="size-3.5 text-slate-400" aria-hidden /> {shifts.name(h.to_shift_id)}
                  </span>
                );
                return (
                  <TR key={h.id}>
                    <TD>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Link href={`/${h.id}`} className="font-medium text-brand-600 hover:underline">
                          {h.handover_no ?? "(belum bernomor)"}
                        </Link>
                        <DivisionBadge code={divisions.code(h.division_id)} />
                      </span>
                      {/* Ringkasan untuk layar kecil (kolom lain disembunyikan) */}
                      <p className="mt-0.5 text-xs text-slate-500 md:hidden">
                        <span className="sm:hidden">{formatDate(h.shift_date)} · </span>
                        {shiftText}
                      </p>
                      <p className="text-xs text-slate-500 md:hidden">
                        {profiles.name(h.outgoing_by)} → {h.incoming_by ? profiles.name(h.incoming_by) : "belum ditentukan"}
                      </p>
                    </TD>
                    <TD className="hidden whitespace-nowrap sm:table-cell">{formatDate(h.shift_date)}</TD>
                    <TD className="hidden whitespace-nowrap md:table-cell">{shiftText}</TD>
                    <TD className="hidden lg:table-cell">{sites.name(h.site_id)}</TD>
                    <TD className="hidden md:table-cell">
                      {profiles.name(h.outgoing_by)} <span className="text-slate-400">→</span>{" "}
                      {h.incoming_by ? profiles.name(h.incoming_by) : <span className="text-slate-400">belum ditentukan</span>}
                    </TD>
                    <TD>
                      <StatusBadge status={h.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {rows.length === 100 && (
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              Menampilkan 100 handover terbaru. Gunakan filter tanggal untuk melihat yang lebih lama.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
