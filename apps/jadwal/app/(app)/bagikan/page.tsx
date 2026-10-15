import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Team } from "@noc/supabase/types";
import {
  Alert,
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Field,
  Flash,
  Forbidden,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  SubmitButton,
} from "@noc/ui";
import { Ban, Eye, ExternalLink, Link2, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { addDays, isValidDate, rangeLabel, todayWib } from "@/lib/dates";
import { createShare, deleteShare, revokeShare } from "./actions";

export const metadata = { title: "Bagikan Jadwal" };

type ShareRow = {
  id: string;
  token: string;
  title: string;
  start_date: string;
  end_date: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  teams: { name: string } | null;
  creator: { full_name: string } | null;
};
type SP = Promise<{ dari?: string; sampai?: string; judul?: string; baru?: string; error?: string; success?: string }>;

const BASE_URL = (process.env.NEXT_PUBLIC_JADWAL_URL ?? "http://localhost:3001").replace(/\/$/, "");
const shareUrl = (token: string) => `${BASE_URL}/s/${token}`;

export default async function SharePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("schedule.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [{ data: shareData, error }, { data: teamData }] = await Promise.all([
    supabase
      .from("schedule_shares")
      .select(
        "id, token, title, start_date, end_date, expires_at, revoked_at, view_count, last_viewed_at, created_at, teams(name), creator:profiles!schedule_shares_created_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("teams").select("id, name").order("name"),
  ]);
  const shares = (shareData as unknown as ShareRow[] | null) ?? [];
  const teams = (teamData as Pick<Team, "id" | "name">[] | null) ?? [];

  const today = todayWib();
  const defStart = isValidDate(sp.dari) ? sp.dari : today;
  const defEnd = isValidDate(sp.sampai) ? sp.sampai : addDays(today, 6);
  const nowIso = new Date().toISOString();
  const fresh = sp.baru ? shares.find((s) => s.id === sp.baru) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bagikan Jadwal"
        description="Buat link publik untuk rentang tanggal tertentu. Siapa pun yang punya link bisa melihat jadwal tanpa login — cocok untuk dikirim ke grup, klien, atau ditampilkan di layar ruang operasional."
      />
      <Flash searchParams={sp} />

      {fresh && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent>
            <p className="text-sm font-semibold text-emerald-900">Link “{fresh.title}” siap dibagikan</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                {shareUrl(fresh.token)}
              </code>
              <div className="flex gap-2">
                <CopyButton text={shareUrl(fresh.token)} />
                <a href={shareUrl(fresh.token)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  <ExternalLink className="size-3.5" aria-hidden /> Buka
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buat link baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createShare} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Judul" required className="sm:col-span-2 lg:col-span-4" hint="Tampil sebagai judul di halaman publik.">
              <Input name="title" required defaultValue={sp.judul ?? "Jadwal Shift"} maxLength={120} />
            </Field>
            <Field label="Dari tanggal" required>
              <Input name="start_date" type="date" required defaultValue={defStart} />
            </Field>
            <Field label="Sampai tanggal" required hint="Maksimal 93 hari.">
              <Input name="end_date" type="date" required defaultValue={defEnd} />
            </Field>
            <Field label="Tim" hint="Kosong = semua tim.">
              <Select name="team_id" defaultValue="">
                <option value="">Semua tim</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link berlaku" hint="Setelah itu link otomatis mati.">
              <Select name="validity" defaultValue="end">
                <option value="end">Sampai rentang selesai</option>
                <option value="7">7 hari</option>
                <option value="30">30 hari</option>
                <option value="">Tanpa batas</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between lg:col-span-4">
              <p className="text-xs text-slate-500">
                Hanya jadwal yang sudah <strong>dipublikasikan</strong> yang tampil. Yang terlihat publik: nama & shift saja (tanpa
                email/kontak).
              </p>
              <SubmitButton>
                <Link2 className="size-4" aria-hidden /> Buat link
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && <Alert tone="error">Gagal memuat daftar link: {error.message}</Alert>}

      {shares.length === 0 ? (
        <EmptyState title="Belum ada link yang dibagikan" description="Link yang Anda buat akan muncul di sini, lengkap dengan jumlah dilihat." />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Link yang sudah dibuat</h2>
          {shares.map((s) => {
            const expired = !!s.expires_at && s.expires_at <= nowIso;
            const active = !s.revoked_at && !expired;
            return (
              <Card key={s.id} className={cn(!active && "opacity-70", s.id === fresh?.id && "ring-2 ring-emerald-200")}>
                <CardContent>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        {s.title}
                        {s.revoked_at ? (
                          <Badge tone="gray">Dinonaktifkan</Badge>
                        ) : expired ? (
                          <Badge tone="yellow">Kedaluwarsa</Badge>
                        ) : (
                          <Badge tone="green">Aktif</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {rangeLabel(s.start_date, s.end_date)} · {s.teams?.name ?? "Semua tim"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" aria-hidden /> {s.view_count}× dilihat
                          {s.last_viewed_at && ` · terakhir ${formatDateTime(s.last_viewed_at)}`}
                        </span>
                        <span>
                          {s.revoked_at
                            ? `Dinonaktifkan ${formatDateTime(s.revoked_at)}`
                            : s.expires_at
                              ? `${expired ? "Berakhir" : "Berlaku s/d"} ${formatDateTime(s.expires_at)}`
                              : "Berlaku tanpa batas"}
                        </span>
                        <span>Dibuat {s.creator?.full_name ?? "—"}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {active && (
                        <>
                          <CopyButton text={shareUrl(s.token)} />
                          <a href={shareUrl(s.token)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                            <ExternalLink className="size-3.5" aria-hidden /> Buka
                          </a>
                          <form action={revokeShare}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmit
                              confirm={`Nonaktifkan link "${s.title}"? Orang yang sudah punya link tidak bisa membukanya lagi.`}
                              variant="ghost" size="sm"
                            >
                              <Ban className="size-3.5" aria-hidden /> Nonaktifkan
                            </ConfirmSubmit>
                          </form>
                        </>
                      )}
                      <form action={deleteShare}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmSubmit
                          confirm={`Hapus link "${s.title}" permanen?`}
                          variant="ghost" size="sm" className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden /> Hapus
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Ingin membagikan periode tertentu? Buka{" "}
        <Link href="/kalender" className="font-medium text-brand-700 hover:underline">
          Kalender Tim
        </Link>{" "}
        lalu klik “Bagikan”.
      </p>
    </div>
  );
}
