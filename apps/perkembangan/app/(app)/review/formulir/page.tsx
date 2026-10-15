import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { buttonClass, Card, CardContent, CardHeader, CardTitle, cn, Field, Flash, Forbidden, Input, PageHeader, SubmitButton, Textarea } from "@noc/ui";
import { ArrowLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { first } from "@/lib/data";
import { isReviewKind, KIND_LABEL, QUESTION_KIND_LABEL, type QuestionKind, REVIEW_KINDS, type ReviewKind } from "@/lib/review";
import { saveForm, toggleQuestion } from "./actions";

export const metadata = { title: "Formulir Penilaian" };

type Form = { id: string; review_type: ReviewKind; name: string; description: string | null; weight: number; is_active: boolean };
type Question = {
  id: string;
  section: string;
  prompt: string;
  kind: QuestionKind;
  is_required: boolean;
  weight: number;
  sort_order: number;
  is_active: boolean;
  evidence_rule: string;
  divisions: { code: string } | null;
  review_options: { id: string }[];
};

export default async function ReviewFormsPage({ searchParams }: { searchParams: Promise<{ jenis?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("review.manage")) return <Forbidden message="Formulir penilaian dikelola admin & supervisor." />;
  const jenis = first(sp.jenis);
  const kind: ReviewKind = isReviewKind(jenis) ? jenis : "supervisor";

  const supabase = await createClient();
  const { data: formData } = await supabase.from("review_forms").select("id, review_type, name, description, weight, is_active");
  const forms = (formData as Form[] | null) ?? [];
  const form = forms.find((f) => f.review_type === kind);
  const { data: qData } = form
    ? await supabase
        .from("review_questions")
        .select("id, section, prompt, kind, is_required, weight, sort_order, is_active, evidence_rule, divisions(code), review_options(id)")
        .eq("form_id", form.id)
        .order("sort_order")
        .order("created_at")
    : { data: [] };
  const questions = (qData as unknown as Question[] | null) ?? [];
  const sections = new Map<string, Question[]>();
  for (const q of questions) sections.set(q.section, [...(sections.get(q.section) ?? []), q]);
  const totalWeight = forms.filter((f) => f.is_active).reduce((s, f) => s + Number(f.weight), 0);

  return (
    <div className="space-y-6">
      <Link href="/review" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke Penilaian Bulanan
      </Link>
      <PageHeader
        title="Formulir Penilaian"
        description="Atur pertanyaan, rubrik (pilihan + skor), dan bobot. Perubahan berlaku untuk isian berikutnya; hasil yang sudah masuk tetap tersimpan apa adanya."
      />
      <Flash searchParams={sp} />

      <div className="flex flex-wrap gap-2">
        {REVIEW_KINDS.map((k) => {
          const f = forms.find((x) => x.review_type === k);
          return (
            <Link
              key={k}
              href={`/review/formulir?jenis=${k}`}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition",
                k === kind ? "bg-brand-500 text-white shadow-soft" : "bg-white text-slate-600 ring-1 ring-slate-200/70 hover:bg-slate-50",
              )}
            >
              {KIND_LABEL[k]}
              {f && !f.is_active && <span className="ml-1 text-xs opacity-70">(nonaktif)</span>}
            </Link>
          );
        })}
      </div>

      {form && (
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Pengaturan</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveForm} className="grid gap-4" key={form.id}>
                <input type="hidden" name="jenis" value={kind} />
                <Field label="Nama formulir" required>
                  <Input name="name" required maxLength={100} defaultValue={form.name} />
                </Field>
                <Field label="Petunjuk untuk penilai">
                  <Textarea name="description" rows={3} maxLength={500} defaultValue={form.description ?? ""} />
                </Field>
                <Field label="Bobot dalam nilai akhir" hint={`Total bobot formulir aktif saat ini: ${totalWeight}. Nilai akhir = rata-rata berbobot.`}>
                  <Input name="weight" type="number" min={0} max={100} step="1" defaultValue={Number(form.weight)} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="is_active" defaultChecked={form.is_active} className="size-4 rounded border-slate-300 accent-brand-600" />
                  Formulir aktif (muncul di daftar tugas penilai)
                </label>
                <SubmitButton>Simpan pengaturan</SubmitButton>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                {questions.filter((q) => q.is_active).length} pertanyaan aktif dari {questions.length}
              </p>
              <Link href={`/review/formulir/pertanyaan?jenis=${kind}`} className={buttonClass("primary", "sm")}>
                <Plus className="size-4" aria-hidden /> Tambah pertanyaan
              </Link>
            </div>
            {[...sections.entries()].map(([section, list]) => (
              <Card key={section}>
                <div className="border-b border-slate-100 px-5 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section}</h2>
                </div>
                <ul className="divide-y divide-slate-100">
                  {list.map((q) => (
                    <li key={q.id} className={cn("flex items-start gap-3 px-5 py-3", !q.is_active && "opacity-50")}>
                      <span className="mt-0.5 w-8 shrink-0 text-xs tabular-nums text-slate-400">{q.sort_order}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {q.prompt}
                          {q.is_required && <span className="ml-0.5 text-red-500">*</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                          <span>{QUESTION_KIND_LABEL[q.kind]}</span>
                          {q.kind !== "text" && <span>{q.review_options.length} pilihan</span>}
                          {q.kind === "scale" && Number(q.weight) !== 1 && <span>bobot {Number(q.weight)}</span>}
                          {q.divisions && <span className="font-medium text-brand-600">khusus {q.divisions.code}</span>}
                          {q.evidence_rule === "always" && <span>bukti wajib</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <form action={toggleQuestion}>
                          <input type="hidden" name="id" value={q.id} />
                          <input type="hidden" name="jenis" value={kind} />
                          {!q.is_active && <input type="hidden" name="active" value="on" />}
                          <button
                            type="submit"
                            className={buttonClass("ghost", "sm")}
                            aria-label={q.is_active ? "Nonaktifkan" : "Aktifkan"}
                            title={q.is_active ? "Nonaktifkan" : "Aktifkan"}
                          >
                            {q.is_active ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                          </button>
                        </form>
                        <Link href={`/review/formulir/pertanyaan?id=${q.id}`} className={buttonClass("ghost", "sm")} aria-label="Ubah" title="Ubah">
                          <Pencil className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
