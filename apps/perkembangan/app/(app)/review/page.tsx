import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Alert, buttonClass, Card, CardContent, CardHeader, CardTitle, cn, EmptyState, Flash, PageHeader, ProgressBar } from "@noc/ui";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, FileBarChart2, PenLine } from "lucide-react";
import { first } from "@/lib/data";
import { currentYm, isYm, isYmOpen, scoreTone, shiftYm, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Review Bulanan" };

type Task = { user_id: string; full_name: string; team_name: string | null; is_self: boolean; done: boolean; updated_at: string | null };
type Overview = {
  user_id: string;
  full_name: string;
  team_name: string | null;
  self_done: boolean;
  peers_received: number;
  peers_given: number;
  self_avg: number | null;
  peer_avg: number | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ bulan?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const bulanParam = first(sp.bulan);
  const ym = isYm(bulanParam) ? bulanParam : currentYm();
  const month = ymToDate(ym);
  const open = isYmOpen(ym);

  const supabase = await createClient();
  const [{ data: taskData }, { data: overviewData }] = await Promise.all([
    supabase.rpc("my_review_tasks", { p_month: month }),
    supabase.rpc("review_overview", { p_month: month }),
  ]);
  const tasks = (taskData as Task[] | null) ?? [];
  const overview = (overviewData as Overview[] | null) ?? [];
  const self = tasks.find((t) => t.is_self);
  const peers = tasks.filter((t) => !t.is_self);
  const doneCount = tasks.filter((t) => t.done).length;
  const isParticipant = auth.can("review.submit");

  const nav = (delta: number) => `/review?bulan=${shiftYm(ym, delta)}`;
  const fillHref = (uid: string) => `/review/isi?bulan=${ym}&untuk=${uid}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Bulanan"
        description="Nilai diri sendiri dan rekan setim setiap bulan. Penilaian rekan bersifat anonim bagi yang dinilai."
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
      <Flash searchParams={sp} />

      {!open && isParticipant && (
        <Alert tone="info">Review {ymLabel(ym)} sudah ditutup. Hanya bulan ini dan bulan lalu yang bisa diisi atau diubah.</Alert>
      )}

      {isParticipant ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tugas review</CardTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {doneCount} dari {tasks.length} selesai
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressBar value={tasks.length ? (doneCount / tasks.length) * 100 : 0} />

              {self && (
                <TaskRow task={self} label="Self review" sub="Refleksi diri: pencapaian, kendala, dan target bulan depan" href={fillHref(self.user_id)} open={open} />
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Peer review</p>
                {peers.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Belum ada rekan untuk dinilai. Peer review berlaku untuk anggota satu tim (lead &amp; staff) — pastikan tim Anda sudah diatur admin.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {peers.map((p) => (
                      <TaskRow key={p.user_id} task={p} label={p.full_name} sub={p.team_name ?? "Tanpa tim"} href={fillHref(p.user_id)} open={open} />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Laporan saya</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-slate-600">
                Ringkasan {ymLabel(ym)}: aktivitas shift, handover, tugas, nilai self review, dan rata-rata penilaian rekan (anonim).
              </p>
              <Link href={`/review/laporan?bulan=${ym}`} className={buttonClass("secondary")}>
                <FileBarChart2 className="size-4" aria-hidden /> Lihat laporan bulanan
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : (
        overview.length === 0 && (
          <EmptyState title="Anda bukan peserta review" description="Review bulanan diisi oleh lead dan staff. Hubungi admin bila ini keliru." />
        )
      )}

      {overview.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Rekap tim</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Status review {ymLabel(ym)} per anggota. Klik nama untuk membuka laporan lengkap.</p>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Anggota</th>
                  <th className="px-3 py-2.5 text-center">Self review</th>
                  <th className="px-3 py-2.5 text-center">Dinilai rekan</th>
                  <th className="px-3 py-2.5 text-center">Menilai rekan</th>
                  <th className="px-3 py-2.5 text-center">Nilai diri</th>
                  <th className="px-5 py-2.5 text-center">Nilai rekan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.map((o) => (
                  <tr key={o.user_id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link href={`/review/laporan?bulan=${ym}&user=${o.user_id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {o.full_name}
                      </Link>
                      <p className="text-xs text-slate-500">{o.team_name ?? "Tanpa tim"}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {o.self_done ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-500" aria-label="Sudah" />
                      ) : (
                        <CircleDashed className="mx-auto size-4 text-slate-300" aria-label="Belum" />
                      )}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-slate-700">{o.peers_received}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-slate-700">{o.peers_given}</td>
                    <td className={cn("px-3 py-3 text-center font-semibold tabular-nums", scoreTone(o.self_avg))}>{o.self_avg?.toFixed(1) ?? "–"}</td>
                    <td className={cn("px-5 py-3 text-center font-semibold tabular-nums", scoreTone(o.peer_avg))}>{o.peer_avg?.toFixed(1) ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TaskRow({ task, label, sub, href, open }: { task: Task; label: string; sub: string; href: string; open: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
      {task.done ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="Sudah diisi" />
      ) : (
        <CircleDashed className="size-5 shrink-0 text-slate-300" aria-label="Belum diisi" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{label}</p>
        <p className="truncate text-xs text-slate-500">{sub}</p>
      </div>
      {open ? (
        <Link href={href} className={buttonClass(task.done ? "ghost" : "primary", "sm")}>
          <PenLine className="size-3.5" aria-hidden /> {task.done ? "Ubah" : "Isi"}
        </Link>
      ) : (
        <span className="text-xs text-slate-400">{task.done ? "Selesai" : "Tidak diisi"}</span>
      )}
    </div>
  );
}
