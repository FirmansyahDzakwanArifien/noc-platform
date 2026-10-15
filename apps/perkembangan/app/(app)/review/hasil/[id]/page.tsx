import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, cn, EmptyState, Forbidden, formatDateTime, PageHeader } from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { first, isUuid } from "@/lib/data";
import { currentYm, grade, isYm, KIND_LABEL, KIND_TONE, pctText, type QuestionKind, REVIEW_KINDS, type ReviewKind, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Detail Penilaian" };

type Answer = {
  question_id: string;
  section: string;
  prompt: string;
  kind: QuestionKind;
  option: string | null;
  score: number | null;
  min: number | null;
  max: number | null;
  text: string | null;
  evidence: string | null;
};
type Submission = { id: string; type: ReviewKind; reviewer: string; score_pct: number | null; updated_at: string; answers: Answer[] };
type Detail = {
  user: { id: string; full_name: string; email: string | null; team: string | null } | null;
  weights: Partial<Record<ReviewKind, number>> | null;
  submissions: Submission[];
  activity: Record<string, number>;
};

const ACTIVITY: [string, string][] = [
  ["shifts", "Shift kerja"],
  ["handovers_sent", "Handover dibuat"],
  ["handovers_received", "Handover diterima"],
  ["incidents_resolved", "Incident diselesaikan"],
  ["tasks_done", "Tugas project selesai"],
  ["leave_days", "Hari cuti/izin/sakit"],
];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function ReviewDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bulan?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("review.manage")) return <Forbidden message="Hasil penilaian hanya bisa dilihat admin & supervisor." />;
  if (!isUuid(id)) notFound();
  const bulanParam = first(sp.bulan);
  const ym = isYm(bulanParam) ? bulanParam : currentYm();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_detail", { p_user: id, p_month: ymToDate(ym) });
  if (error) return <Forbidden message={error.message} />;
  const d = data as Detail;
  if (!d.user) notFound();

  // Rata-rata per jenis & nilai akhir berbobot.
  const byType = Object.fromEntries(
    REVIEW_KINDS.map((k) => {
      const subs = d.submissions.filter((s) => s.type === k);
      const pcts = subs.map((s) => s.score_pct).filter((p): p is number => p != null).map(Number);
      return [k, { n: subs.length, pct: avg(pcts) }];
    }),
  ) as Record<ReviewKind, { n: number; pct: number | null }>;
  let num = 0;
  let den = 0;
  for (const k of REVIEW_KINDS) {
    const w = Number(d.weights?.[k] ?? 0);
    if (byType[k].pct != null && w > 0) {
      num += byType[k].pct! * w;
      den += w;
    }
  }
  const finalPct = den ? num / den : null;
  const finalGrade = grade(finalPct);

  // Perbandingan per pertanyaan rubrik.
  type Row = { section: string; prompt: string; max: number | null; scores: Record<ReviewKind, number[]> };
  const rows = new Map<string, Row>();
  for (const s of d.submissions) {
    for (const a of s.answers) {
      if (a.kind !== "scale") continue;
      const r = rows.get(a.question_id) ?? { section: a.section, prompt: a.prompt, max: a.max, scores: { self: [], peer: [], supervisor: [] } };
      if (a.score != null) r.scores[s.type].push(Number(a.score));
      r.max = r.max ?? a.max;
      rows.set(a.question_id, r);
    }
  }
  const sections = new Map<string, Row[]>();
  for (const r of rows.values()) sections.set(r.section, [...(sections.get(r.section) ?? []), r]);

  const cell = (xs: number[], max: number | null) => {
    const v = avg(xs);
    if (v == null) return <span className="text-slate-300">–</span>;
    const ratio = max ? v / max : 0;
    return (
      <span className={cn("font-semibold tabular-nums", ratio >= 0.8 ? "text-emerald-600" : ratio >= 0.6 ? "text-sky-600" : ratio >= 0.4 ? "text-amber-600" : "text-red-600")}>
        {v.toFixed(1)}
        {xs.length > 1 && <span className="ml-0.5 text-[10px] font-normal text-slate-400">({xs.length})</span>}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Link href={`/review/hasil?bulan=${ym}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Hasil Penilaian
      </Link>
      <PageHeader title={d.user.full_name} description={`${d.user.team ?? "Tanpa tim"} · ${ymLabel(ym)} · rahasia, hanya admin & supervisor`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardContent>
            <p className="text-xs font-medium text-slate-500">Nilai akhir</p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", finalGrade?.tone ?? "text-slate-300")}>{finalPct != null ? finalPct.toFixed(0) : "–"}</p>
            <p className={cn("text-xs font-medium", finalGrade?.tone ?? "text-slate-400")}>{finalGrade?.label ?? "Belum ada penilaian"}</p>
          </CardContent>
        </Card>
        {REVIEW_KINDS.map((k) => (
          <Card key={k}>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">
                {KIND_LABEL[k]} <span className="text-slate-400">· bobot {Number(d.weights?.[k] ?? 0)}</span>
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{pctText(byType[k].pct)}</p>
              <p className="text-xs text-slate-500">{byType[k].n} penilai</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Data aktivitas {ymLabel(ym)}</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Data sistem sebagai pembanding objektif terhadap penilaian.</p>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ACTIVITY.map(([key, label]) => (
            <div key={key} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-xl font-bold tabular-nums text-slate-800">{Number(d.activity?.[key] ?? 0)}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {d.submissions.length === 0 ? (
        <EmptyState title="Belum ada penilaian" description={`Belum ada isian untuk ${d.user.full_name} pada ${ymLabel(ym)}.`} />
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Perbandingan per aspek</CardTitle>
                <p className="mt-0.5 text-xs text-slate-500">Rata-rata skor rubrik (angka dalam kurung = jumlah penilai).</p>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                    <th className="px-5 py-2.5">Aspek</th>
                    <th className="px-3 py-2.5 text-center">Self</th>
                    <th className="px-3 py-2.5 text-center">Rekan</th>
                    <th className="px-5 py-2.5 text-center">Atasan</th>
                  </tr>
                </thead>
                {[...sections.entries()].map(([section, list]) => (
                  <tbody key={section} className="divide-y divide-slate-100">
                    <tr>
                      <td colSpan={4} className="bg-slate-50/40 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {section}
                      </td>
                    </tr>
                    {list.map((r) => (
                      <tr key={r.prompt}>
                        <td className="px-5 py-2.5 text-slate-700">
                          {r.prompt}
                          {r.max != null && <span className="ml-1 text-xs text-slate-400">/ {r.max}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">{cell(r.scores.self, r.max)}</td>
                        <td className="px-3 py-2.5 text-center">{cell(r.scores.peer, r.max)}</td>
                        <td className="px-5 py-2.5 text-center">{cell(r.scores.supervisor, r.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Isian lengkap per penilai</h2>
            {d.submissions.map((s) => (
              <details key={s.id} className="group rounded-2xl border border-slate-200/70 bg-white shadow-soft">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", KIND_TONE[s.type])}>{KIND_LABEL[s.type]}</span>
                  <span className="font-medium text-slate-900">{s.reviewer}</span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-semibold tabular-nums text-slate-700">{pctText(s.score_pct)}</span>
                    {formatDateTime(s.updated_at)}
                  </span>
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100 px-5">
                  {s.answers
                    .filter((a) => a.option || a.text)
                    .map((a) => (
                      <div key={a.question_id} className="py-3 text-sm">
                        <p className="text-xs text-slate-500">
                          {a.section} · {a.prompt}
                        </p>
                        {a.kind === "text" ? (
                          <p className="mt-1 whitespace-pre-line text-slate-800">{a.text}</p>
                        ) : (
                          <p className="mt-1 text-slate-800">
                            {a.score != null && (
                              <span className="mr-1.5 inline-grid size-6 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">{Number(a.score)}</span>
                            )}
                            {a.option}
                          </p>
                        )}
                        {a.evidence && <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">Bukti: {a.evidence}</p>}
                      </div>
                    ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
