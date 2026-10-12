import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { SchedulePeriod, Site, Team } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  Forbidden,
  formatDate,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from "@noc/ui";
import { Plus } from "lucide-react";
import { addDays, addMonths, monthEnd, monthLabel, monthOf, monthStart, rangeLabel, todayWib } from "@/lib/dates";
import { createPeriod } from "./actions";

export const metadata = { title: "Kelola Jadwal" };

type PeriodRow = Pick<SchedulePeriod, "id" | "name" | "start_date" | "end_date" | "status" | "published_at"> & {
  teams: { name: string } | null;
  sites: { name: string } | null;
  shift_schedules: { count: number }[] | null;
};
type SP = Promise<{ error?: string; success?: string }>;

export default async function ManagePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("schedule.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [{ data: periodData, error }, { data: teamData }, { data: siteData }] = await Promise.all([
    supabase
      .from("schedule_periods")
      .select("id, name, start_date, end_date, status, published_at, teams(name), sites(name), shift_schedules(count)")
      .order("start_date", { ascending: false })
      .limit(100),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("sites").select("id, code, name").eq("is_active", true).order("code"),
  ]);
  const periods = (periodData as unknown as PeriodRow[] | null) ?? [];
  const teams = (teamData as Pick<Team, "id" | "name">[] | null) ?? [];
  const sites = (siteData as Pick<Site, "id" | "code" | "name">[] | null) ?? [];

  // Default form: bulan berikutnya
  const next = addMonths(monthOf(todayWib()), 1);
  const defStart = monthStart(next);
  const defEnd = monthEnd(next);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Jadwal"
        description="Buat periode roster, isi jadwal shift tiap anggota, lalu publikasikan agar tim bisa melihatnya."
        actions={
          <a href="#periode-baru" className={buttonClass()}>
            <Plus className="size-4" aria-hidden /> Periode baru
          </a>
        }
      />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Daftar periode</CardTitle>
          <span className="text-xs text-slate-500">Klik nama periode untuk mengisi atau mempublikasikan jadwal.</span>
        </CardHeader>
        {error && <p className="px-5 py-3 text-sm text-red-600">Gagal memuat periode: {error.message}</p>}
        {periods.length === 0 ? (
          <CardContent>
            <EmptyState
              title="Belum ada periode jadwal"
              description="Periode adalah rentang tanggal roster (mis. satu bulan). Buat periode pertama, isi jadwalnya, lalu publikasikan."
              action={
                <a href="#periode-baru" className={buttonClass()}>
                  Buat periode pertama
                </a>
              }
            />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nama periode</TH>
                <TH className="hidden sm:table-cell">Rentang tanggal</TH>
                <TH className="hidden md:table-cell">Tim / Site</TH>
                <TH>Status</TH>
                <TH className="hidden text-right sm:table-cell">Shift terisi</TH>
                <TH className="hidden lg:table-cell">Dipublikasikan</TH>
              </TR>
            </THead>
            <TBody>
              {periods.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/kelola/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{rangeLabel(p.start_date, p.end_date)}</p>
                  </TD>
                  <TD className="hidden whitespace-nowrap sm:table-cell">{rangeLabel(p.start_date, p.end_date)}</TD>
                  <TD className="hidden text-slate-500 md:table-cell">
                    {[p.teams?.name, p.sites?.name].filter(Boolean).join(" · ") || "Semua tim"}
                  </TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{p.shift_schedules?.[0]?.count ?? 0}</TD>
                  <TD className="hidden whitespace-nowrap text-slate-500 lg:table-cell">
                    {p.published_at ? formatDateTime(p.published_at) : "-"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card id="periode-baru" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Buat periode baru</CardTitle>
          <span className="text-xs text-slate-500">Setelah dibuat, Anda langsung diarahkan ke editor jadwal.</span>
        </CardHeader>
        <CardContent>
          <form action={createPeriod} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama periode" required className="sm:col-span-2" hint="Nama yang mudah dikenali tim, mis. bulan dan tim.">
              <Input name="name" required defaultValue={`Roster ${monthLabel(next)}`} maxLength={150} />
            </Field>
            <Field label="Tanggal mulai" required>
              <Input type="date" name="start_date" required defaultValue={defStart} />
            </Field>
            <Field
              label="Tanggal selesai"
              required
              hint={`Maksimal 93 hari (mis. paling lambat ${formatDate(addDays(defStart, 92))} bila mulai ${formatDate(defStart)}).`}
            >
              <Input type="date" name="end_date" required defaultValue={defEnd} />
            </Field>
            <Field label="Tim" hint="Anggota aktif tim ini otomatis muncul sebagai baris di editor. Kosongkan untuk semua pengguna aktif.">
              <Select name="team_id" defaultValue="">
                <option value="">Semua pengguna aktif</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Site" hint="Opsional. Lokasi kerja yang dicatat pada setiap jadwal di periode ini.">
              <Select name="site_id" defaultValue="">
                <option value="">Tidak ditentukan</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan" className="sm:col-span-2" hint="Opsional. Ditampilkan di halaman editor jadwal.">
              <Textarea name="notes" rows={2} maxLength={1000} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Membuat…">Buat periode &amp; isi jadwal</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
