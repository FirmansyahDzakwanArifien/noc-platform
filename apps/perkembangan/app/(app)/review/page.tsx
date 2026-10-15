import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Alert, buttonClass, Card, CardContent, CardHeader, CardTitle, cn, EmptyState, Flash, PageHeader, ProgressBar } from "@noc/ui";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ListChecks, Lock, PenLine } from "lucide-react";
import { first } from "@/lib/data";
import { currentYm, isYm, isYmOpen, KIND_LABEL, type ReviewKind, shiftYm, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Penilaian Bulanan" };

type Task = { reviewee_id: string; full_name: string; team_name: string | null; review_type: ReviewKind; done: boolean; updated_at: string | null };

const GROUPS: { kind: ReviewKind; title: string; desc: string; empty: string }[] = [
  { kind: "self", title: "Self review", desc: "Nilai diri sendiri berdasarkan kejadian nyata bulan ini.", empty: "" },
  {
    kind: "peer",
    title: "Penilaian rekan",
    desc: "Nilai rekan setim. Rekan tidak tahu siapa yang menilai.",
    empty: "Belum ada rekan untuk dinilai — pastikan tim Anda sudah diatur admin.",
  },
  { kind: "supervisor", title: "Penilaian bawahan", desc: "Penilaian atasan terhadap lead & staff.", empty: "Belum ada bawahan untuk dinilai." },
];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ bulan?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const bulanParam = first(sp.bulan);
  const ym = isYm(bulanParam) ? bulanParam : currentYm();
  const open = isYmOpen(ym);
  const canManage = auth.can("review.manage");

  const supabase = await createClient();
  const { data } = await supabase.rpc("review_tasks", { p_month: ymToDate(ym) });
  const tasks = (data as Task[] | null) ?? [];
  const doneCount = tasks.filter((t) => t.done).length;
  const groups = GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => t.review_type === g.kind) })).filter(
    (g) => g.tasks.length > 0 || (g.kind === "peer" && auth.can("review.submit")) || (g.kind === "supervisor" && auth.can("review.evaluate")),
  );

  const nav = (delta: number) => `/review?bulan=${shiftYm(ym, delta)}`;
  const fillHref = (t: Task) => `/review/isi?bulan=${ym}&jenis=${t.review_type}&untuk=${t.reviewee_id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penilaian Bulanan"
        description="Self review, penilaian rekan, dan penilaian atasan memakai rubrik yang sama agar objektif."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <Link href={`/review/hasil?bulan=${ym}`} className={buttonClass("secondary", "sm")}>
                  <BarChart3 className="size-4" aria-hidden /> Hasil
                </Link>
                <Link href="/review/formulir" className={buttonClass("ghost", "sm")}>
                  <ListChecks className="size-4" aria-hidden /> Formulir
                </Link>
              </>
            )}
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
          </div>
        }
      />
      <Flash searchParams={sp} />

      {!open && tasks.length > 0 && (
        <Alert tone="info">Penilaian {ymLabel(ym)} sudah ditutup. Hanya bulan ini dan bulan lalu yang bisa diisi atau diubah.</Alert>
      )}

      {tasks.length === 0 && groups.length === 0 ? (
        <EmptyState
          title="Tidak ada penilaian untuk Anda"
          description={canManage ? "Lihat hasil penilaian tim lewat tombol Hasil." : "Penilaian diisi oleh lead, staff, dan supervisor. Hubungi admin bila ini keliru."}
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {doneCount} dari {tasks.length} penilaian selesai
                </p>
                <ProgressBar className="mt-2" value={tasks.length ? (doneCount / tasks.length) * 100 : 0} />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-slate-500 sm:max-w-xs">
                <Lock className="size-3.5 shrink-0" aria-hidden /> Isian Anda rahasia: hanya admin & supervisor yang bisa melihat hasilnya.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {groups.map((g) => (
              <Card key={g.kind} className={cn(g.kind === "self" && "lg:col-span-1")}>
                <CardHeader>
                  <div>
                    <CardTitle>{g.title}</CardTitle>
                    <p className="mt-0.5 text-xs text-slate-500">{g.desc}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {g.tasks.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{g.empty}</p>
                  ) : (
                    g.tasks.map((t) => (
                      <div key={t.reviewee_id} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
                        {t.done ? (
                          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="Sudah diisi" />
                        ) : (
                          <CircleDashed className="size-5 shrink-0 text-slate-300" aria-label="Belum diisi" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{g.kind === "self" ? "Diri sendiri" : t.full_name}</p>
                          <p className="truncate text-xs text-slate-500">{g.kind === "self" ? KIND_LABEL.self : (t.team_name ?? "Tanpa tim")}</p>
                        </div>
                        {open ? (
                          <Link href={fillHref(t)} className={buttonClass(t.done ? "ghost" : "primary", "sm")}>
                            <PenLine className="size-3.5" aria-hidden /> {t.done ? "Ubah" : "Isi"}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">{t.done ? "Selesai" : "Tidak diisi"}</span>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
