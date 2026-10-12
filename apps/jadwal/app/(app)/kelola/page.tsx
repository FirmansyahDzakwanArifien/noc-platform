import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { SchedulePeriod, Site, Team } from "@noc/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  Forbidden,
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
import { addDays, addMonths, monthEnd, monthOf, monthStart, rangeLabel, todayWib } from "@/lib/dates";
import { createPeriod } from "./actions";

export const metadata = { title: "Kelola Jadwal" };

type PeriodRow = SchedulePeriod & { teams: { name: string } | null; sites: { name: string } | null;
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
      .select("*, teams(name), sites(name), shift_schedules(count)")
      .order("start_date", { ascending: false })
      .limit(200),
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
      <PageHeader title="Kelola Jadwal" description="Buat periode roster, isi jadwal, lalu publikasikan ke tim." />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Periode jadwal</CardTitle>
        </CardHeader>
        {error && <p className="px-5 py-3 text-sm text-red-600">Gagal memuat periode: {error.message}</p>}
        {periods.length === 0 ? (
          <CardContent>
            <EmptyState title="Belum ada periode" description="Buat periode pertama dengan form di bawah." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nama</TH>
                <TH>Rentang</TH>
                <TH>Tim / Site</TH>
                <TH>Status</TH>
                <TH className="text-right">Entri</TH>
                <TH>Dipublikasikan</TH>
              </TR>
            </THead>
            <TBody>
              {periods.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/kelola/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{rangeLabel(p.start_date, p.end_date)}</TD>
                  <TD className="text-slate-500">
                    {[p.teams?.name, p.sites?.name].filter(Boolean).join(" · ") || "-"}
                  </TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{p.shift_schedules?.[0]?.count ?? 0}</TD>
                  <TD className="whitespace-nowrap text-slate-500">{p.published_at ? formatDateTime(p.published_at) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buat periode baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPeriod} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama periode" required className="sm:col-span-2">
              <Input name="name" required placeholder="mis. Roster November 2026 - NOC L1" maxLength={150} />
            </Field>
            <Field label="Tanggal mulai" required>
              <Input type="date" name="start_date" required defaultValue={defStart} />
            </Field>
            <Field label="Tanggal selesai" required hint={`Maksimal 93 hari, mis. s/d ${addDays(defStart, 92)}.`}>
              <Input type="date" name="end_date" required defaultValue={defEnd} />
            </Field>
            <Field label="Tim" hint="Jika diisi, anggota tim aktif otomatis jadi baris di editor.">
              <Select name="team_id" defaultValue="">
                <option value="">— Semua user aktif —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Site">
              <Select name="site_id" defaultValue="">
                <option value="">— Tidak ada —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea name="notes" rows={2} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Buat periode</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
