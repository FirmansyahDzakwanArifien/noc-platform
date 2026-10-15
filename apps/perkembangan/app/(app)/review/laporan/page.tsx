import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, cn, Forbidden, PageHeader } from "@noc/ui";
import { ArrowLeft, CalendarCheck2, ChevronLeft, ChevronRight, CircleCheckBig, Crown, Handshake, Plane, Send, Siren } from "lucide-react";
import { first, isUuid } from "@/lib/data";
import { type Criterion, currentYm, isYm, scoreTone, shiftYm, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Laporan Bulanan" };

type Narrative = { highlights: string | null; improvements: string | null; comment: string | null };
type Report = {
  user: { id: string; full_name: string; email: string | null; team: string | null };
  full_access: boolean;
  criteria: Criterion[];
  self: (Narrative & { goals: string | null; updated_at: string; scores: Record<string, number> | null }) | null;
  peer_count: number;
  peer_avg: Record<string, number> | null;
  peers: (Narrative & { reviewer: string | null; avg: number | null })[];
  given_count: number;
  activity: {
    shifts: number;
    leader_shifts: number;
    handovers_sent: number;
    handovers_received: number;
    tasks_done: number;
    incidents_resolved: number;
    leave_days: number;
  };
};

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ bulan?: string; user?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const bulanParam = first(sp.bulan);
  const ym = isYm(bulanParam) ? bulanParam : currentYm();
  const userParam = first(sp.user);
  const userId = isUuid(userParam) ? userParam : auth.userId;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("monthly_report", { p_user: userId, p_month: ymToDate(ym) });
  if (error || !data) return <Forbidden message="Anda tidak memiliki akses ke laporan ini." />;
  const r = data as Report;
  const isMine = userId === auth.userId;

  const selfScores = r.self?.scores ?? {};
  const selfAvg = avg(Object.values(selfScores));
  const peerAvg = avg(Object.values(r.peer_avg ?? {}).map(Number));
  const nav = (delta: number) => `/review/laporan?bulan=${shiftYm(ym, delta)}${isMine ? "" : `&user=${userId}`}`;

  const stats = [
    { icon: CalendarCheck2, label: "Shift kerja", value: r.activity.shifts },
    { icon: Crown, label: "Jadi leader shift", value: r.activity.leader_shifts },
    { icon: Send, label: "Handover dikirim", value: r.activity.handovers_sent },
    { icon: Handshake, label: "Handover diterima", value: r.activity.handovers_received },
    { icon: CircleCheckBig, label: "Tugas selesai", value: r.activity.tasks_done },
    { icon: Siren, label: "Incident diselesaikan", value: r.activity.incidents_resolved },
    { icon: Plane, label: "Hari cuti/izin/sakit", value: r.activity.leave_days },
  ];

  return (
    <div className="space-y-6">
      <Link href={`/review?bulan=${ym}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Review Bulanan
      </Link>
      <PageHeader
        title={isMine ? "Laporan bulanan saya" : `Laporan bulanan — ${r.user.full_name}`}
        description={[r.user.team ?? "Tanpa tim", r.user.email].filter(Boolean).join(" · ")}
        actions={
          <div className="flex items-center gap-1 rounded-2xl bg-white p-1 shadow-soft ring-1 ring-slate-200/70">
            <Link href={nav(-1)} className="grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Bulan sebelumnya">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold text-slate-800">{ymLabel(ym)}</span>
            <Link
              href={nav(1)}
              className={cn("grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100", ym >= currentYm() && "pointer-events-none opacity-30")}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      {/* Ringkasan nilai */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard label="Nilai diri" value={selfAvg} hint={r.self ? "Dari self review" : "Self review belum diisi"} />
        <ScoreCard label="Nilai rekan" value={peerAvg} hint={r.peer_count ? `Rata-rata dari ${r.peer_count} rekan` : "Belum ada penilaian rekan"} />
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-soft">
          <p className="text-xs font-medium text-slate-500">Partisipasi</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{r.given_count}</p>
          <p className="text-xs text-slate-500">rekan sudah dinilai{isMine ? " oleh Anda" : ""}</p>
        </div>
      </div>

      {/* Aktivitas */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Aktivitas {ymLabel(ym)}</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Dihitung otomatis dari aplikasi Jadwal, Handover, Perkembangan, dan Perizinan.</p>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-slate-50 px-3 py-3">
              <s.icon className="size-4 text-brand-500" aria-hidden />
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{s.value}</p>
              <p className="text-[11px] leading-tight text-slate-500">{s.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per aspek */}
      <Card>
        <CardHeader>
          <CardTitle>Nilai per aspek</CardTitle>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-slate-300" /> Diri
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand-500" /> Rekan
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.criteria.map((c) => {
            const s = selfScores[c.key] ?? null;
            const p = r.peer_avg?.[c.key] != null ? Number(r.peer_avg[c.key]) : null;
            return (
              <div key={c.key} className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center">
                <p className="text-sm font-medium text-slate-800">{c.name}</p>
                <div className="space-y-1.5">
                  <Bar value={s} className="bg-slate-300" />
                  <Bar value={p} className="bg-brand-500" />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Self review */}
        <Card>
          <CardHeader>
            <CardTitle>Self review</CardTitle>
          </CardHeader>
          <CardContent>
            {r.self ? (
              <dl className="space-y-4 text-sm">
                <TextBlock label="Pencapaian" text={r.self.highlights} />
                <TextBlock label="Kendala & yang perlu ditingkatkan" text={r.self.improvements} />
                <TextBlock label="Target bulan depan" text={r.self.goals} />
                <TextBlock label="Catatan" text={r.self.comment} />
              </dl>
            ) : (
              <p className="text-sm text-slate-500">
                Belum diisi.{" "}
                {isMine && (
                  <Link href={`/review/isi?bulan=${ym}&untuk=${auth.userId}`} className="font-medium text-brand-600 hover:underline">
                    Isi sekarang
                  </Link>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Masukan rekan */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Masukan rekan</CardTitle>
              {!r.full_access && <p className="mt-0.5 text-xs text-slate-500">Anonim — nama penilai tidak ditampilkan.</p>}
            </div>
          </CardHeader>
          <CardContent>
            {r.peers.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada penilaian rekan bulan ini.</p>
            ) : (
              <ul className="space-y-3">
                {r.peers.map((p, i) => (
                  <li key={i} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">{p.reviewer ?? `Rekan ${i + 1}`}</p>
                      {p.avg != null && <span className={cn("text-xs font-semibold", scoreTone(Number(p.avg)))}>{Number(p.avg).toFixed(1)}</span>}
                    </div>
                    {p.highlights && (
                      <p className="text-slate-700">
                        <span className="font-medium text-emerald-700">+ </span>
                        {p.highlights}
                      </p>
                    )}
                    {p.improvements && (
                      <p className="mt-1 text-slate-700">
                        <span className="font-medium text-amber-700">△ </span>
                        {p.improvements}
                      </p>
                    )}
                    {p.comment && <p className="mt-1 text-slate-500">{p.comment}</p>}
                    {!p.highlights && !p.improvements && !p.comment && <p className="text-slate-400">Hanya memberi nilai.</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-soft">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", scoreTone(value))}>
        {value != null ? value.toFixed(1) : "–"}
        <span className="text-sm font-medium text-slate-400"> / 5</span>
      </p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Bar({ value, className }: { value: number | null; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        {value != null && <div className={cn("h-full rounded-full", className)} style={{ width: `${(value / 5) * 100}%` }} />}
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-slate-500">{value != null ? value.toFixed(1) : "–"}</span>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-slate-700">{text}</dd>
    </div>
  );
}
