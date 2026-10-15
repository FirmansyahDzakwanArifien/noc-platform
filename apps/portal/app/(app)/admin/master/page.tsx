import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Shift, Site, Team, Vendor } from "@noc/supabase/types";
import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Flash,
  Forbidden,
  formatTime,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { Pencil, Trash2, UserMinus, X } from "lucide-react";
import { ConfirmSubmit } from "../../../../components/confirm-submit";
import { deleteMaster, saveMaster, setTeamMember, toggleActive } from "./actions";

export const metadata = { title: "Master Data" };

const TABS = [
  { key: "site", label: "Site" },
  { key: "tim", label: "Tim" },
  { key: "shift", label: "Shift" },
  { key: "vendor", label: "Vendor" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Hak akses halaman ini, ditentukan dari permission role user. */
type Caps = { manage: boolean; del: boolean };
type Member = { id: string; full_name: string; email: string | null; team_id: string | null; is_active: boolean };

function ActiveToggle({ table, id, active, back }: { table: string; id: string; active: boolean; back: string }) {
  return (
    <form action={toggleActive}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton variant="ghost" size="sm" pendingText="…">
        {active ? "Nonaktifkan" : "Aktifkan"}
      </SubmitButton>
    </form>
  );
}

function RowActions({
  caps,
  table,
  id,
  label,
  back,
  active,
}: {
  caps: Caps;
  table: string;
  id: string;
  label: string;
  back: string;
  active?: boolean;
}) {
  if (!caps.manage && !caps.del) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      {caps.manage && (
        <Link href={`${back}&edit=${id}`} className={buttonClass("ghost", "sm")} aria-label={`Ubah ${label}`}>
          <Pencil className="size-3.5" aria-hidden /> Ubah
        </Link>
      )}
      {caps.manage && active !== undefined && <ActiveToggle table={table} id={id} active={active} back={back} />}
      {caps.del && (
        <form action={deleteMaster}>
          <input type="hidden" name="table" value={table} />
          <input type="hidden" name="id" value={id} />
          <ConfirmSubmit message={`Hapus ${label}? Tindakan ini tidak bisa dibatalkan.`} className="text-red-600 hover:bg-red-50">
            <Trash2 className="size-3.5" aria-hidden /> Hapus
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}

/** Kartu form tambah/ubah. `row` terisi = mode ubah. */
function EditorCard({
  title,
  table,
  row,
  back,
  children,
}: {
  title: string;
  table: string;
  row?: { id: string } | null;
  back: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("mb-4", row && "border-brand-200 ring-2 ring-brand-100")}>
      <CardHeader>
        <CardTitle>{row ? `Ubah ${title.toLowerCase()}` : `Tambah ${title.toLowerCase()}`}</CardTitle>
        {row && (
          <Link href={back} className={buttonClass("ghost", "sm")}>
            <X className="size-3.5" aria-hidden /> Batal
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <form action={saveMaster} key={row?.id ?? "new"}>
          <input type="hidden" name="table" value={table} />
          {row && <input type="hidden" name="id" value={row.id} />}
          {children}
          <div className="mt-4 flex justify-end">
            <SubmitButton>{row ? "Simpan perubahan" : `Tambah ${title.toLowerCase()}`}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string; error?: string; success?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.can("portal.access")) return <Forbidden />;
  const caps: Caps = { manage: auth.can("master.manage"), del: auth.can("master.delete") };
  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "site") as TabKey;
  const back = `/admin/master?tab=${tab}`;
  const editId = caps.manage ? sp.edit : undefined;
  const supabase = await createClient();

  return (
    <div>
      <PageHeader
        title="Master Data"
        description={
          caps.manage
            ? "Data referensi yang dipakai semua aplikasi."
            : "Data referensi yang dipakai semua aplikasi. Anda hanya dapat melihat — perubahan oleh admin/supervisor."
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/master?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t.key === tab ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "site" && (
        <SitesTab caps={caps} back={back} editId={editId} rows={((await supabase.from("sites").select("*").order("code")).data ?? []) as Site[]} />
      )}
      {tab === "tim" && (
        <TeamsTab
          caps={caps}
          back={back}
          editId={editId}
          rows={((await supabase.from("teams").select("*").order("name")).data ?? []) as Team[]}
          divisions={((await supabase.from("divisions").select("id, code, name").order("sort_order")).data ?? []) as Division[]}
          people={
            ((await supabase.from("profiles").select("id, full_name, email, team_id, is_active").order("full_name")).data ?? []) as Member[]
          }
        />
      )}
      {tab === "shift" && (
        <ShiftsTab caps={caps} back={back} editId={editId} rows={((await supabase.from("shifts").select("*").order("sort_order")).data ?? []) as Shift[]} />
      )}
      {tab === "vendor" && (
        <VendorsTab caps={caps} back={back} editId={editId} rows={((await supabase.from("vendors").select("*").order("name")).data ?? []) as Vendor[]} />
      )}
    </div>
  );
}

type TabProps<T> = { rows: T[]; back: string; caps: Caps; editId?: string };

function SitesTab({ rows, back, caps, editId }: TabProps<Site>) {
  const row = rows.find((r) => r.id === editId);
  return (
    <>
      {caps.manage && (
        <EditorCard title="Site" table="sites" row={row} back={back}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kode" required>
              <Input name="code" required placeholder="JKT-DC01" defaultValue={row?.code} />
            </Field>
            <Field label="Nama" required className="lg:col-span-2">
              <Input name="name" required defaultValue={row?.name} />
            </Field>
            <Field label="Tipe">
              <Select name="site_type" defaultValue={row?.site_type ?? "pop"}>
                <option value="dc">Data Center</option>
                <option value="pop">POP</option>
                <option value="noc_room">Ruang NOC/SOC</option>
                <option value="office">Kantor</option>
              </Select>
            </Field>
            <Field label="Region">
              <Input name="region" defaultValue={row?.region ?? ""} />
            </Field>
            <Field label="Alamat" className="sm:col-span-2 lg:col-span-3">
              <Input name="address" defaultValue={row?.address ?? ""} />
            </Field>
          </div>
        </EditorCard>
      )}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Kode</TH>
              <TH>Nama</TH>
              <TH>Tipe</TH>
              <TH>Region</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id} className={cn(s.id === editId && "bg-brand-50/50")}>
                <TD className="font-mono text-xs font-medium text-slate-900">{s.code}</TD>
                <TD>
                  {s.name}
                  {s.address && <span className="block text-xs text-slate-400">{s.address}</span>}
                </TD>
                <TD>{s.site_type}</TD>
                <TD>{s.region ?? "-"}</TD>
                <TD>{s.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                <TD className="text-right">
                  <RowActions caps={caps} table="sites" id={s.id} label={`site ${s.code}`} back={back} active={s.is_active} />
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-500">
                  Belum ada site.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

type Division = { id: string; code: string; name: string };

function TeamsTab({ rows, back, caps, editId, people, divisions }: TabProps<Team> & { people: Member[]; divisions: Division[] }) {
  const row = rows.find((r) => r.id === editId);
  return (
    <>
      {caps.manage && (
        <EditorCard title="Tim" table="teams" row={row} back={back}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1fr]">
            <Field label="Nama tim" required>
              <Input name="name" required placeholder="NOC L1" defaultValue={row?.name} />
            </Field>
            <Field label="Deskripsi">
              <Input name="description" defaultValue={row?.description ?? ""} />
            </Field>
            <Field label="Divisi">
              <Select name="division_id" defaultValue={row?.division_id ?? ""}>
                <option value="">Tanpa divisi</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tim pembina" hint="Lead tim pembina ikut mengelola jadwal & melihat review tim ini.">
              <Select name="managed_by_team_id" defaultValue={row?.managed_by_team_id ?? ""}>
                <option value="">Tidak ada</option>
                {rows
                  .filter((t) => t.id !== row?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        </EditorCard>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">Belum ada tim.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((t) => {
            const members = people.filter((p) => p.team_id === t.id);
            const candidates = people.filter((p) => p.team_id !== t.id && p.is_active);
            return (
              <Card key={t.id} className={cn(t.id === editId && "border-brand-200 ring-2 ring-brand-100")}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {t.name}
                      {t.division_id && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          {divisions.find((d) => d.id === t.division_id)?.code}
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      {t.description ? `${t.description} · ` : ""}
                      {members.length} anggota
                      {t.managed_by_team_id && <> · dibina {rows.find((x) => x.id === t.managed_by_team_id)?.name}</>}
                    </p>
                  </div>
                  <RowActions caps={caps} table="teams" id={t.id} label={`tim ${t.name}`} back={back} />
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {members.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-sm"
                        >
                          <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-[10px] font-semibold text-white">
                            {m.full_name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((w) => w[0]?.toUpperCase())
                              .join("")}
                          </span>
                          <span className="text-slate-700">{m.full_name}</span>
                          {caps.manage && (
                            <form action={setTeamMember}>
                              <input type="hidden" name="user_id" value={m.id} />
                              <input type="hidden" name="team_id" value="" />
                              <input type="hidden" name="back" value={back} />
                              <button
                                type="submit"
                                className="grid size-5 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Keluarkan ${m.full_name} dari tim`}
                              >
                                <UserMinus className="size-3.5" />
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">Belum ada anggota.</p>
                  )}

                  {caps.manage && candidates.length > 0 && (
                    <form action={setTeamMember} className="flex gap-2">
                      <input type="hidden" name="team_id" value={t.id} />
                      <input type="hidden" name="back" value={back} />
                      <Select name="user_id" required defaultValue="" className="h-9 flex-1">
                        <option value="" disabled>
                          Tambah anggota…
                        </option>
                        {candidates.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                            {p.team_id ? " (pindah dari tim lain)" : ""}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton size="sm" className="h-9">
                        Tambah
                      </SubmitButton>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShiftsTab({ rows, back, caps, editId }: TabProps<Shift>) {
  const row = rows.find((r) => r.id === editId);
  return (
    <>
      {caps.manage && (
        <EditorCard title="Shift" table="shifts" row={row} back={back}>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Kode" required>
              <Input name="code" required placeholder="P2" defaultValue={row?.code} />
            </Field>
            <Field label="Nama" required>
              <Input name="name" required placeholder="Pagi panjang" defaultValue={row?.name} />
            </Field>
            <Field label="Mulai">
              <Input name="start_time" type="time" defaultValue={row?.start_time?.slice(0, 5) ?? ""} />
            </Field>
            <Field label="Selesai">
              <Input name="end_time" type="time" defaultValue={row?.end_time?.slice(0, 5) ?? ""} />
            </Field>
            <Field label="Warna">
              <Input name="color" type="color" defaultValue={row?.color ?? "#3b82f6"} className="p-1" />
            </Field>
            <Field label="Urutan">
              <Input name="sort_order" type="number" defaultValue={row?.sort_order ?? 5} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">Kosongkan jam mulai/selesai untuk shift libur (OFF).</p>
        </EditorCard>
      )}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Kode</TH>
              <TH>Nama</TH>
              <TH>Jam</TH>
              <TH>Urutan</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id} className={cn(s.id === editId && "bg-brand-50/50")}>
                <TD>
                  <span
                    className="inline-flex min-w-10 justify-center rounded px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ background: s.color ?? "#64748b" }}
                  >
                    {s.code}
                  </span>
                </TD>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD>{s.is_working ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}` : "Libur"}</TD>
                <TD>{s.sort_order}</TD>
                <TD>{s.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                <TD className="text-right">
                  <RowActions caps={caps} table="shifts" id={s.id} label={`shift ${s.name}`} back={back} active={s.is_active} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function VendorsTab({ rows, back, caps, editId }: TabProps<Vendor>) {
  const row = rows.find((r) => r.id === editId);
  return (
    <>
      {caps.manage && (
        <EditorCard title="Vendor" table="vendors" row={row} back={back}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Nama perusahaan" required className="lg:col-span-2">
              <Input name="name" required defaultValue={row?.name} />
            </Field>
            <Field label="NPWP">
              <Input name="npwp" defaultValue={row?.npwp ?? ""} />
            </Field>
            <Field label="Nama PIC">
              <Input name="pic_name" defaultValue={row?.pic_name ?? ""} />
            </Field>
            <Field label="Telepon PIC">
              <Input name="pic_phone" type="tel" defaultValue={row?.pic_phone ?? ""} />
            </Field>
            <Field label="Email PIC" className="lg:col-span-2">
              <Input name="pic_email" type="email" defaultValue={row?.pic_email ?? ""} />
            </Field>
          </div>
        </EditorCard>
      )}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Nama</TH>
              <TH>PIC</TH>
              <TH>Kontak</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((v) => (
              <TR key={v.id} className={cn(v.id === editId && "bg-brand-50/50")}>
                <TD className="font-medium text-slate-900">
                  {v.name}
                  {v.npwp && <span className="block text-xs font-normal text-slate-400">NPWP {v.npwp}</span>}
                </TD>
                <TD>{v.pic_name ?? "-"}</TD>
                <TD className="text-xs">
                  {v.pic_phone ?? "-"}
                  <br />
                  {v.pic_email ?? ""}
                </TD>
                <TD>{v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
                <TD className="text-right">
                  <RowActions caps={caps} table="vendors" id={v.id} label={`vendor ${v.name}`} back={back} active={v.is_active} />
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-slate-500">
                  Belum ada vendor.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
