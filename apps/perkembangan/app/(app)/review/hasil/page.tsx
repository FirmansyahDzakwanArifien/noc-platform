import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Card, CardHeader, CardTitle, cn, EmptyState, Forbidden, PageHeader } from "@noc/ui";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed } from "lucide-react";
import { first } from "@/lib/data";
import { currentYm, grade, isYm, pctText, shiftYm, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Hasil Penilaian" };

type Row = {
  user_id: string;
  full_name: string;
  team_name: string | null;
  division_code: string | null;
  self_pct: number | null;
  peer_pct: number | null;
  peer_n: number;
  sup_pct: number | null;
  sup_n: number;
  final_pct: number | null;
  peers_given: number;
  self_done: boolean;
};

export default async function ReviewResultsPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("review.manage")) return <Forbidden message="Hasil penilaian hanya bisa dilihat admin & supervisor." />;
  const bulanParam = first(sp.bulan);
  const ym = isYm(bulanParam) ? bulanParam : currentYm();

  const supabase = await createClient();
  const { data } = await supabase.rpc("review_summary", { p_month: ymToDate(ym) });
  const rows = (data as Row[] | null) ?? [];
  const nav = (delta: number) => `/review/hasil?bulan=${shiftYm(ym, delta)}`;

  return (
    <div className="space-y-6">
      <Link href={`/review?bulan=${ym}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Penilaian Bulanan
      </Link>
      <PageHeader
        title="Hasil Penilaian"
        description="Rahasia — hanya admin & supervisor. Nilai 0–100 dihitung dari rubrik; nilai akhir memakai bobot tiap formulir."
        actions={
          <div className="flex items-center gap-1 rounded-2xl bg-white p-1 shadow-soft ring-1 ring-slate-200/70">
            <Link href={nav(-1)} className="grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Bulan sebelumnya">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold text-slate-800">{ymLabel(ym)}</span>
            <Link
              href={nav(1)}
              aria-disabled={ym >= currentYm()}
              className={cn("grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100", ym >= currentYm() && "pointer-events-none opacity-30")}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Belum ada peserta" description="Peserta penilaian adalah user aktif dengan hak mengisi review (lead & staff)." />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{rows.length} peserta</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Anggota</th>
                  <th className="px-3 py-2.5 text-center">Self</th>
                  <th className="px-3 py-2.5 text-center">Rekan</th>
                  <th className="px-3 py-2.5 text-center">Atasan</th>
                  <th className="px-3 py-2.5 text-center">Nilai akhir</th>
                  <th className="px-5 py-2.5 text-center">Menilai rekan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const g = grade(r.final_pct != null ? Number(r.final_pct) : null);
                  return (
                    <tr key={r.user_id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/review/hasil/${r.user_id}?bulan=${ym}`} className="font-medium text-slate-900 hover:text-brand-600">
                          {r.full_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {r.team_name ?? "Tanpa tim"}
                          {r.division_code && ` · ${r.division_code}`}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.self_done ? (
                          <span className="font-semibold tabular-nums text-slate-700">{pctText(r.self_pct)}</span>
                        ) : (
                          <CircleDashed className="mx-auto size-4 text-slate-300" aria-label="Belum" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-slate-700">
                        {r.peer_n ? (
                          <>
                            <span className="font-semibold">{pctText(r.peer_pct)}</span> <span className="text-xs text-slate-400">({r.peer_n})</span>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-slate-700">
                        {r.sup_n ? <span className="font-semibold">{pctText(r.sup_pct)}</span> : "–"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {g ? (
                          <span className="inline-flex flex-col items-center">
                            <span className={cn("text-base font-bold tabular-nums", g.tone)}>{pctText(r.final_pct)}</span>
                            <span className={cn("text-[11px] font-medium", g.tone)}>{g.label}</span>
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-5 py-3 text-center tabular-nums text-slate-700">
                        {r.peers_given > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden /> {r.peers_given}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
