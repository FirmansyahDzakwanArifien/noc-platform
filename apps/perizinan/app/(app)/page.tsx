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
import { Plus } from "lucide-react";
import { isPermitStatus, isPermitType, PERMIT_STATUSES, PERMIT_TYPES } from "@/lib/labels";
import { first, nameOf, profileNames, type SearchParams } from "@/lib/util";

export const metadata = { title: "Izin Kerja" };

const LIMIT = 100;

type Row = Pick<Permit, "id" | "permit_no" | "title" | "permit_type" | "status" | "start_at" | "end_at" | "requested_by"> & {
  sites: { code: string; name: string } | null;
};

export default async function PermitListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();

  const status = first(sp.status);
  const type = first(sp.type);
  const q = first(sp.q)?.trim().slice(0, 100);

  let query = supabase
    .from("permits")
    .select("id, permit_no, title, permit_type, status, start_at, end_at, requested_by, sites(code, name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (isPermitStatus(status)) query = query.eq("status", status);
  if (isPermitType(type)) query = query.eq("permit_type", type);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const names = await profileNames(supabase, rows.map((r) => r.requested_by));
  const filtered = !!(status || type || q);
  const canCreate = auth.can("permit.create");

  return (
    <div>
      <PageHeader
        title="Izin Kerja & Akses Site"
        description={
          auth.can("permit.view")
            ? "Semua pengajuan izin masuk lokasi, pekerjaan, dan keluar/masuk barang. Klik judul untuk melihat detail & status persetujuan."
            : "Izin yang Anda ajukan. Klik judul untuk melihat detail & status persetujuan."
        }
        actions={
          canCreate && (
            <Link href="/baru" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Ajukan izin
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-end">
        <Input name="q" defaultValue={q ?? ""} placeholder="Cari judul izin…" aria-label="Cari judul" className="sm:w-64" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select name="status" defaultValue={isPermitStatus(status) ? status : ""} className="sm:w-auto sm:min-w-40" aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(PERMIT_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select name="type" defaultValue={isPermitType(type) ? type : ""} className="sm:w-auto sm:min-w-40" aria-label="Jenis izin">
            <option value="">Semua jenis</option>
            {Object.entries(PERMIT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>
            Terapkan
          </button>
          {filtered && (
            <Link href="/" className={buttonClass("ghost")}>
              Hapus filter
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <EmptyState title="Gagal memuat daftar izin" description="Periksa koneksi Anda lalu muat ulang halaman." />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Tidak ada izin yang cocok"
            description="Coba ubah kata kunci atau filter status/jenis."
            action={
              <Link href="/" className={buttonClass("secondary")}>
                Hapus filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Belum ada izin"
            description={
              canCreate
                ? "Ajukan izin sebelum masuk lokasi, melakukan pekerjaan, atau membawa barang keluar/masuk."
                : "Belum ada izin yang bisa Anda lihat."
            }
            action={
              canCreate && (
                <Link href="/baru" className={buttonClass()}>
                  <Plus className="size-4" aria-hidden /> Ajukan izin
                </Link>
              )
            }
          />
        )
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH className="hidden md:table-cell">No. izin</TH>
                  <TH>Izin</TH>
                  <TH className="hidden lg:table-cell">Site</TH>
                  <TH className="hidden sm:table-cell">Jadwal (WIB)</TH>
                  <TH className="hidden lg:table-cell">Pemohon</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="hidden whitespace-nowrap font-mono text-xs md:table-cell">
                      <Link href={`/${r.id}`} className="text-brand-600 hover:underline">
                        {r.permit_no ?? "Draft"}
                      </Link>
                    </TD>
                    <TD className="min-w-0">
                      <Link href={`/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {PERMIT_TYPES[r.permit_type] ?? r.permit_type}
                        <span className="lg:hidden">{r.sites ? ` · ${r.sites.code}` : ""}</span>
                        <span className="md:hidden">{r.permit_no ? ` · ${r.permit_no}` : ""}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 sm:hidden">Mulai {formatDateTime(r.start_at)}</span>
                    </TD>
                    <TD className="hidden whitespace-nowrap lg:table-cell">{r.sites ? `${r.sites.code} · ${r.sites.name}` : "-"}</TD>
                    <TD className="hidden whitespace-nowrap text-xs sm:table-cell">
                      {formatDateTime(r.start_at)}
                      <br />
                      s/d {formatDateTime(r.end_at)}
                    </TD>
                    <TD className="hidden whitespace-nowrap lg:table-cell">{nameOf(names, r.requested_by, auth.userId)}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {rows.length === LIMIT && (
            <p className="mt-3 text-xs text-slate-500">Menampilkan {LIMIT} izin terbaru. Gunakan pencarian atau filter untuk mempersempit.</p>
          )}
        </>
      )}
    </div>
  );
}
