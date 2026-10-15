import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Team } from "@noc/supabase/types";
import {
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
import { ArrowLeft, Ban, ExternalLink, Eye, Link2, Trash2 } from "lucide-react";
import { ConfirmSubmit } from "../../../../../components/confirm-submit";
import { CopyButton } from "../../../../../components/copy-button";
import { createDirectoryShare, deleteDirectoryShare, revokeDirectoryShare } from "./actions";

export const metadata = { title: "Bagikan Daftar Anggota" };

type ShareRow = {
  id: string;
  token: string;
  title: string;
  show_email: boolean;
  show_phone: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  teams: { name: string } | null;
  creator: { full_name: string } | null;
};

const BASE_URL = (process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const shareUrl = (token: string) => `${BASE_URL}/d/${token}`;

export default async function DirectorySharePage({ searchParams }: { searchParams: Promise<{ baru?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("user.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [{ data: shareData }, { data: teamData }] = await Promise.all([
    supabase
      .from("directory_shares")
      .select("id, token, title, show_email, show_phone, expires_at, revoked_at, view_count, last_viewed_at, teams(name), creator:profiles!directory_shares_created_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("teams").select("id, name").order("name"),
  ]);
  const shares = (shareData as unknown as ShareRow[] | null) ?? [];
  const teams = (teamData as Pick<Team, "id" | "name">[] | null) ?? [];
  const fresh = sp.baru ? shares.find((s) => s.id === sp.baru) : undefined;
  const nowIso = new Date().toISOString();

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke daftar user
      </Link>
      <PageHeader
        title="Bagikan daftar anggota"
        description="Buat link publik berisi daftar anggota aktif (nama, tim, role) yang bisa dibuka tanpa login — cocok untuk presentasi, klien, atau layar ruang operasional."
      />
      <Flash searchParams={sp} />

      {fresh && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent>
            <p className="text-sm font-semibold text-emerald-900">Link “{fresh.title}” siap dibagikan</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">{shareUrl(fresh.token)}</code>
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
          <form action={createDirectoryShare} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Judul" required className="sm:col-span-2 lg:col-span-3">
              <Input name="title" required defaultValue="Tim Operasional" maxLength={120} />
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
            <Field label="Link berlaku">
              <Select name="validity" defaultValue="30">
                <option value="1">1 hari</option>
                <option value="7">7 hari</option>
                <option value="30">30 hari</option>
                <option value="">Tanpa batas</option>
              </Select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Tampilkan kontak</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="show_email" className="size-4 rounded border-slate-300 accent-brand-600" /> Email
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="show_phone" className="size-4 rounded border-slate-300 accent-brand-600" /> No. HP
              </label>
            </fieldset>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between lg:col-span-3">
              <p className="text-xs text-slate-500">Hanya user aktif yang tampil. Kontak tidak ditampilkan kecuali dicentang.</p>
              <SubmitButton>
                <Link2 className="size-4" aria-hidden /> Buat link
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {shares.length === 0 ? (
        <EmptyState title="Belum ada link" description="Link yang Anda buat akan muncul di sini, lengkap dengan jumlah dilihat." />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Link yang sudah dibuat</h2>
          {shares.map((s) => {
            const expired = !!s.expires_at && s.expires_at <= nowIso;
            const active = !s.revoked_at && !expired;
            return (
              <Card key={s.id} className={cn(!active && "opacity-70", s.id === fresh?.id && "ring-2 ring-emerald-200")}>
                <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      {s.title}
                      {s.revoked_at ? <Badge tone="gray">Dinonaktifkan</Badge> : expired ? <Badge tone="yellow">Kedaluwarsa</Badge> : <Badge tone="green">Aktif</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {s.teams?.name ?? "Semua tim"}
                      {(s.show_email || s.show_phone) && ` · menampilkan ${[s.show_email && "email", s.show_phone && "no. HP"].filter(Boolean).join(" & ")}`}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" aria-hidden /> {s.view_count}× dilihat
                      </span>
                      <span>{s.expires_at ? `${expired ? "Berakhir" : "Berlaku s/d"} ${formatDateTime(s.expires_at)}` : "Berlaku tanpa batas"}</span>
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
                        <form action={revokeDirectoryShare}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmit message={`Nonaktifkan link "${s.title}"?`}>
                            <Ban className="size-3.5" aria-hidden /> Nonaktifkan
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}
                    <form action={deleteDirectoryShare}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit message={`Hapus link "${s.title}" permanen?`} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="size-3.5" aria-hidden /> Hapus
                      </ConfirmSubmit>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
