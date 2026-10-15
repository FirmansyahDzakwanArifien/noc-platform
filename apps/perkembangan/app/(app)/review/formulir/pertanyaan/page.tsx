import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, Field, Flash, Forbidden, Input, PageHeader, Select, SubmitButton, Textarea } from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { first, isUuid } from "@/lib/data";
import { isReviewKind, KIND_LABEL, QUESTION_KIND_LABEL, type QuestionKind, type ReviewKind } from "@/lib/review";
import { saveQuestion } from "../actions";

export const metadata = { title: "Pertanyaan Penilaian" };

type Question = {
  id: string;
  section: string;
  prompt: string;
  help: string | null;
  kind: QuestionKind;
  is_required: boolean;
  weight: number;
  division_id: string | null;
  evidence_rule: "none" | "extreme" | "always";
  sort_order: number;
  is_active: boolean;
  review_forms: { review_type: ReviewKind };
  review_options: { id: string; label: string; description: string | null; score: number | null; sort_order: number }[];
};

const MAX_OPTIONS = 7;

export default async function QuestionPage({ searchParams }: { searchParams: Promise<{ id?: string; jenis?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("review.manage")) return <Forbidden message="Formulir penilaian dikelola admin & supervisor." />;
  const id = first(sp.id);
  const supabase = await createClient();

  let q: Question | null = null;
  if (id) {
    if (!isUuid(id)) notFound();
    const { data } = await supabase
      .from("review_questions")
      .select("id, section, prompt, help, kind, is_required, weight, division_id, evidence_rule, sort_order, is_active, review_forms(review_type), review_options(id, label, description, score, sort_order)")
      .eq("id", id)
      .maybeSingle();
    q = data as unknown as Question | null;
    if (!q) notFound();
  }
  const jenis = q?.review_forms.review_type ?? first(sp.jenis);
  if (!isReviewKind(jenis)) notFound();

  const [{ data: divData }, { data: sectionData }] = await Promise.all([
    supabase.from("divisions").select("id, code, name").order("sort_order"),
    supabase.from("review_questions").select("section, sort_order, review_forms!inner(review_type)").eq("review_forms.review_type", jenis),
  ]);
  const divisions = (divData as { id: string; code: string; name: string }[] | null) ?? [];
  const existing = (sectionData as { section: string; sort_order: number }[] | null) ?? [];
  const sectionNames = [...new Set(existing.map((s) => s.section))];
  const nextSort = (Math.max(0, ...existing.filter((s) => s.sort_order < 900).map((s) => s.sort_order)) || 0) + 10;

  const opts = [...(q?.review_options ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const rows = Array.from({ length: MAX_OPTIONS }, (_, i) => opts[i] ?? null);
  const isNew = !q;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/review/formulir?jenis=${jenis}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke formulir {KIND_LABEL[jenis]}
      </Link>
      <PageHeader title={isNew ? "Tambah pertanyaan" : "Ubah pertanyaan"} description={`Formulir ${KIND_LABEL[jenis]}`} />
      <Flash searchParams={sp} />

      <form action={saveQuestion} className="space-y-6">
        <input type="hidden" name="jenis" value={jenis} />
        {q && <input type="hidden" name="id" value={q.id} />}

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Bagian" required hint="Pengelompokan di formulir, mis. Disiplin & Kehadiran." className="sm:col-span-1">
              <Input name="section" required maxLength={80} defaultValue={q?.section ?? ""} list="sections" />
              <datalist id="sections">
                {sectionNames.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Urutan" hint="Angka kecil tampil lebih dulu.">
              <Input name="sort_order" type="number" step="1" defaultValue={q?.sort_order ?? nextSort} />
            </Field>
            <Field label="Pertanyaan / aspek" required className="sm:col-span-2">
              <Input name="prompt" required maxLength={300} defaultValue={q?.prompt ?? ""} />
            </Field>
            <Field label="Keterangan" className="sm:col-span-2">
              <Input name="help" maxLength={300} defaultValue={q?.help ?? ""} />
            </Field>
            <Field label="Tipe">
              <Select name="kind" defaultValue={q?.kind ?? "scale"}>
                {(Object.keys(QUESTION_KIND_LABEL) as QuestionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {QUESTION_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Berlaku untuk divisi" hint="Kosong = semua divisi.">
              <Select name="division_id" defaultValue={q?.division_id ?? ""}>
                <option value="">Semua divisi</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bukti/contoh kejadian">
              <Select name="evidence_rule" defaultValue={q?.evidence_rule ?? "extreme"}>
                <option value="extreme">Wajib bila memilih skor terendah/tertinggi</option>
                <option value="always">Selalu wajib</option>
                <option value="none">Tidak diminta</option>
              </Select>
            </Field>
            <Field label="Bobot pertanyaan" hint="Untuk rubrik; 1 = normal, 2 = dua kali lebih berpengaruh.">
              <Input name="weight" type="number" min={0.1} max={10} step="0.1" defaultValue={q ? Number(q.weight) : 1} />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_required" defaultChecked={q?.is_required ?? true} className="size-4 rounded border-slate-300 accent-brand-600" />
                Wajib dijawab
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_active" defaultChecked={q?.is_active ?? true} className="size-4 rounded border-slate-300 accent-brand-600" />
                Aktif
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pilihan jawaban (rubrik)</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                Tulis perilaku yang bisa diamati, bukan kata sifat (mis. “Terlambat 2–3 kali sebulan”, bukan “Kurang disiplin”). Skor hanya dipakai untuk tipe Rubrik.
                Kosongkan baris untuk menghapus pilihan. Diabaikan untuk tipe Isian teks.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-slate-200/70 p-3 sm:grid-cols-[4.5rem_1fr]">
                {o && <input type="hidden" name={`opt_id_${i}`} value={o.id} />}
                <Field label="Skor">
                  <Input
                    name={`opt_score_${i}`}
                    type="number"
                    step="0.5"
                    defaultValue={o?.score ?? (isNew && i < 5 ? i + 1 : "")}
                    aria-label={`Skor pilihan ${i + 1}`}
                  />
                </Field>
                <div className="grid gap-2">
                  <Field label={`Pilihan ${i + 1}`}>
                    <Input name={`opt_label_${i}`} maxLength={300} defaultValue={o?.label ?? ""} />
                  </Field>
                  <Textarea name={`opt_desc_${i}`} rows={1} maxLength={500} placeholder="Penjelasan tambahan (opsional)" defaultValue={o?.description ?? ""} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href={`/review/formulir?jenis=${jenis}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Batal
          </Link>
          <SubmitButton>{isNew ? "Tambah pertanyaan" : "Simpan perubahan"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
