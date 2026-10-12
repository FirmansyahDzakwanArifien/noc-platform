import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Shift, Site, Team, Vendor } from "@noc/supabase/types";
import {
  Badge,
  Card,
  CardContent,
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
import { createShift, createSite, createTeam, createVendor, deleteTeam, toggleActive } from "./actions";

export const metadata = { title: "Master Data" };

const TABS = [
  { key: "site", label: "Site" },
  { key: "tim", label: "Tim" },
  { key: "shift", label: "Shift" },
  { key: "vendor", label: "Vendor" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.can("master.manage")) return <Forbidden />;
  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "site") as TabKey;
  const back = `/admin/master?tab=${tab}`;
  const supabase = await createClient();

  return (
    <div>
      <PageHeader title="Master Data" description="Data referensi yang dipakai semua aplikasi." />
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

      {tab === "site" && <SitesTab back={back} rows={((await supabase.from("sites").select("*").order("code")).data ?? []) as Site[]} />}
      {tab === "tim" && <TeamsTab back={back} rows={((await supabase.from("teams").select("*").order("name")).data ?? []) as Team[]} />}
      {tab === "shift" && (
        <ShiftsTab back={back} rows={((await supabase.from("shifts").select("*").order("sort_order")).data ?? []) as Shift[]} />
      )}
      {tab === "vendor" && (
        <VendorsTab back={back} rows={((await supabase.from("vendors").select("*").order("name")).data ?? []) as Vendor[]} />
      )}
    </div>
  );
}

function SitesTab({ rows, back }: { rows: Site[]; back: string }) {
  return (
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
            <TR key={s.id}>
              <TD className="font-mono text-xs font-medium text-slate-900">{s.code}</TD>
              <TD>{s.name}</TD>
              <TD>{s.site_type}</TD>
              <TD>{s.region ?? "-"}</TD>
              <TD>{s.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
              <TD className="text-right">
                <ActiveToggle table="sites" id={s.id} active={s.is_active} back={back} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <CardContent className="border-t border-slate-100">
        <form action={createSite} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <Field label="Kode" required>
            <Input name="code" required placeholder="JKT-DC01" />
          </Field>
          <Field label="Nama" required className="lg:col-span-2">
            <Input name="name" required />
          </Field>
          <Field label="Tipe">
            <Select name="site_type" defaultValue="pop">
              <option value="dc">Data Center</option>
              <option value="pop">POP</option>
              <option value="noc_room">Ruang NOC</option>
              <option value="office">Kantor</option>
            </Select>
          </Field>
          <Field label="Region">
            <Input name="region" />
          </Field>
          <SubmitButton>Tambah site</SubmitButton>
          <Field label="Alamat" className="sm:col-span-3 lg:col-span-6">
            <Input name="address" />
          </Field>
        </form>
      </CardContent>
    </Card>
  );
}

function TeamsTab({ rows, back }: { rows: Team[]; back: string }) {
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Nama</TH>
            <TH>Deskripsi</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((t) => (
            <TR key={t.id}>
              <TD className="font-medium text-slate-900">{t.name}</TD>
              <TD>{t.description ?? "-"}</TD>
              <TD className="text-right">
                <form action={deleteTeam}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton variant="ghost" size="sm" className="text-red-600" pendingText="…">
                    Hapus
                  </SubmitButton>
                </form>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <CardContent className="border-t border-slate-100">
        <form action={createTeam} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Field label="Nama tim" required>
            <Input name="name" required placeholder="NOC L1" />
          </Field>
          <Field label="Deskripsi">
            <Input name="description" />
          </Field>
          <SubmitButton>Tambah tim</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function ShiftsTab({ rows, back }: { rows: Shift[]; back: string }) {
  return (
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
            <TR key={s.id}>
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
                <ActiveToggle table="shifts" id={s.id} active={s.is_active} back={back} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <CardContent className="border-t border-slate-100">
        <form action={createShift} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
          <Field label="Kode" required>
            <Input name="code" required placeholder="P2" />
          </Field>
          <Field label="Nama" required>
            <Input name="name" required placeholder="Pagi panjang" />
          </Field>
          <Field label="Mulai">
            <Input name="start_time" type="time" />
          </Field>
          <Field label="Selesai">
            <Input name="end_time" type="time" />
          </Field>
          <Field label="Warna">
            <Input name="color" type="color" defaultValue="#3b82f6" className="p-1" />
          </Field>
          <Field label="Urutan">
            <Input name="sort_order" type="number" defaultValue={5} />
          </Field>
          <SubmitButton>Tambah shift</SubmitButton>
          <p className="text-xs text-slate-500 sm:col-span-3 lg:col-span-7">Kosongkan jam mulai/selesai untuk shift libur (OFF).</p>
        </form>
      </CardContent>
    </Card>
  );
}

function VendorsTab({ rows, back }: { rows: Vendor[]; back: string }) {
  return (
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
            <TR key={v.id}>
              <TD className="font-medium text-slate-900">{v.name}</TD>
              <TD>{v.pic_name ?? "-"}</TD>
              <TD className="text-xs">
                {v.pic_phone ?? "-"}
                <br />
                {v.pic_email ?? ""}
              </TD>
              <TD>{v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</TD>
              <TD className="text-right">
                <ActiveToggle table="vendors" id={v.id} active={v.is_active} back={back} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <CardContent className="border-t border-slate-100">
        <form action={createVendor} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="Nama perusahaan" required>
            <Input name="name" required />
          </Field>
          <Field label="Nama PIC">
            <Input name="pic_name" />
          </Field>
          <Field label="Telepon PIC">
            <Input name="pic_phone" type="tel" />
          </Field>
          <Field label="Email PIC">
            <Input name="pic_email" type="email" />
          </Field>
          <SubmitButton>Tambah vendor</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
