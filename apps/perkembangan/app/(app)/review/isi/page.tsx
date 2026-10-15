import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Alert, Card, CardContent, CardHeader, CardTitle, Field, Flash, Forbidden, PageHeader, SubmitButton, Textarea } from "@noc/ui";
import { ArrowLeft, Lock } from "lucide-react";
import { first, isUuid } from "@/lib/data";
import { type Criterion, isYm, isYmOpen, SCORE_LABEL, ymLabel, ymToDate } from "@/lib/review";
import { submitReview } from "../actions";

export const metadata = { title: "Isi Review" };

type Existing = {
  highlights: string | null;
  improvements: string | null;
  goals: string | null;
  comment: string | null;
  performance_review_scores: { criterion_key: string; score: number }[];
};

export default async function FillReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; untuk?: string; error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("review.submit")) return <Forbidden message="Review bulanan diisi oleh lead dan staff." />;
  const ym = first(sp.bulan);
  const untuk = first(sp.untuk);
  if (!isYm(ym) || !isUuid(untuk)) notFound();
  if (!isYmOpen(ym)) return <Forbidden message={`Review ${ymLabel(ym)} sudah ditutup.`} />;

  const isSelf = untuk === auth.userId;
  const supabase = await createClient();
  const [{ data: allowed }, { data: person }, { data: criteriaData }, { data: existingData }] = await Promise.all([
    isSelf ? Promise.resolve({ data: true }) : supabase.rpc("can_peer_review", { p_reviewee: untuk }),
    supabase.from("profiles").select("full_name, teams(name)").eq("id", untuk).maybeSingle(),
    supabase.from("review_criteria").select("key, name, description").eq("is_active", true).order("sort_order"),
    supabase
      .from("performance_reviews")
      .select("highlights, improvements, goals, comment, performance_review_scores(criterion_key, score)")
      .eq("period_month", ymToDate(ym))
      .eq("reviewer_id", auth.userId)
      .eq("reviewee_id", untuk)
      .maybeSingle(),
  ]);
  if (!allowed) return <Forbidden message="Anda hanya bisa menilai rekan satu tim (atau anggota tim binaan bagi lead)." />;
  if (!person) notFound();

  const name = (person as { full_name: string }).full_name;
  const criteria = (criteriaData as Criterion[] | null) ?? [];
  const existing = existingData as Existing | null;
  const scoreOf = new Map(existing?.performance_review_scores.map((s) => [s.criterion_key, s.score]) ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/review?bulan=${ym}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Review Bulanan
      </Link>
      <PageHeader
        title={isSelf ? "Self review" : `Penilaian untuk ${name}`}
        description={`Periode ${ymLabel(ym)}${existing ? " · sudah pernah diisi, Anda sedang mengubahnya" : ""}`}
      />
      <Flash searchParams={sp} />
      {!isSelf && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden /> {name} tidak bisa melihat nama Anda. Beri penilaian yang jujur dan membangun.
          </span>
        </Alert>
      )}

      <form action={submitReview} className="space-y-6">
        <input type="hidden" name="bulan" value={ym} />
        <input type="hidden" name="untuk" value={untuk} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Penilaian aspek</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">1 = perlu banyak perbaikan · 3 = sesuai harapan · 5 = istimewa</p>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-0">
            {criteria.map((c) => (
              <fieldset key={c.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <legend className="sr-only">{c.name}</legend>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label
                      key={n}
                      title={SCORE_LABEL[n]}
                      className="grid size-10 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500 transition hover:border-brand-300 hover:text-brand-600 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-200"
                    >
                      <input type="radio" name={`score:${c.key}`} value={n} required defaultChecked={scoreOf.get(c.key) === n} className="sr-only" />
                      {n}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isSelf ? "Refleksi bulan ini" : "Masukan untuk rekan"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label={isSelf ? "Pencapaian bulan ini" : "Yang sudah baik / kelebihan"}
              required={isSelf}
              hint={isSelf ? "Mis. gangguan yang berhasil ditangani, pekerjaan selesai, hal baru yang dipelajari." : undefined}
            >
              <Textarea name="highlights" rows={3} maxLength={2000} required={isSelf} defaultValue={existing?.highlights ?? ""} />
            </Field>
            <Field label={isSelf ? "Kendala & yang perlu ditingkatkan" : "Yang bisa ditingkatkan"}>
              <Textarea name="improvements" rows={3} maxLength={2000} defaultValue={existing?.improvements ?? ""} />
            </Field>
            {isSelf && (
              <Field label="Target bulan depan">
                <Textarea name="goals" rows={2} maxLength={2000} defaultValue={existing?.goals ?? ""} />
              </Field>
            )}
            <Field label="Catatan lain" hint="Opsional.">
              <Textarea name="comment" rows={2} maxLength={2000} defaultValue={existing?.comment ?? ""} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href={`/review?bulan=${ym}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Batal
          </Link>
          <SubmitButton pendingText="Menyimpan…">{existing ? "Simpan perubahan" : "Kirim review"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
