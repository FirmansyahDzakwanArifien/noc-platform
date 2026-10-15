import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Alert, Forbidden, formatDateTime, PageHeader } from "@noc/ui";
import { ArrowLeft, Lock } from "lucide-react";
import { ReviewForm } from "@/components/review-form";
import { first, isUuid } from "@/lib/data";
import { type FormAnswer, type FormQuestion, isReviewKind, isYm, isYmOpen, KIND_LABEL, ymLabel, ymToDate } from "@/lib/review";

export const metadata = { title: "Isi Penilaian" };

type FormData = {
  form: { name: string; description: string | null };
  reviewee: { id: string; full_name: string; team: string | null };
  questions: FormQuestion[];
  answers: Record<string, FormAnswer> | null;
  submitted_at: string | null;
};

export default async function FillReviewPage({ searchParams }: { searchParams: Promise<{ bulan?: string; jenis?: string; untuk?: string }> }) {
  const sp = await searchParams;
  await requireAuth();
  const ym = first(sp.bulan);
  const kind = first(sp.jenis);
  const untuk = first(sp.untuk);
  if (!isYm(ym) || !isReviewKind(kind) || !isUuid(untuk)) notFound();
  if (!isYmOpen(ym)) return <Forbidden message={`Penilaian ${ymLabel(ym)} sudah ditutup.`} />;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_form", { p_month: ymToDate(ym), p_type: kind, p_reviewee: untuk });
  if (error) return <Forbidden message={error.message} />;
  const form = data as FormData | null;
  if (!form) return <Forbidden message="Formulir penilaian ini sedang tidak aktif." />;

  const name = form.reviewee.full_name;
  const title = kind === "self" ? "Self review" : kind === "peer" ? `Penilaian rekan: ${name}` : `Penilaian atasan: ${name}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/review?bulan=${ym}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Penilaian Bulanan
      </Link>
      <PageHeader
        title={title}
        description={`${form.form.name} · periode ${ymLabel(ym)}${form.submitted_at ? ` · terakhir disimpan ${formatDateTime(form.submitted_at)}` : ""}`}
      />
      <Alert tone="info">
        <span className="flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {form.form.description ? `${form.form.description} ` : ""}
            Pilih pernyataan yang paling sesuai dengan <b>kejadian nyata</b>, bukan kesan umum. Isian hanya bisa dilihat admin &amp; supervisor
            {kind === "self" ? "." : ` — ${name} tidak tahu isi maupun nama penilainya.`}
          </span>
        </span>
      </Alert>
      <ReviewForm ym={ym} kind={kind} reviewee={untuk} kindLabel={KIND_LABEL[kind]} questions={form.questions} initial={form.answers ?? {}} />
    </div>
  );
}
