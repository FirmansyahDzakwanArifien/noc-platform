"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Button, Card, CardContent, cn, ProgressBar, Textarea } from "@noc/ui";
import { submitReview, type ReviewFormState } from "@/app/(app)/review/actions";
import type { FormAnswer, FormQuestion, ReviewKind, Ym } from "@/lib/review";

type Props = {
  ym: Ym;
  kind: ReviewKind;
  reviewee: string;
  kindLabel: string;
  questions: FormQuestion[];
  initial: Record<string, FormAnswer>;
};

/** Pilihan terendah/tertinggi pada rubrik wajib disertai contoh kejadian (sama dengan aturan di database). */
function needsEvidence(q: FormQuestion, optionId: string | null): boolean {
  if (!optionId || q.evidence_rule === "none") return false;
  if (q.evidence_rule === "always") return true;
  if (q.kind !== "scale") return false;
  const scores = q.options.map((o) => o.score).filter((s): s is number => s != null);
  const picked = q.options.find((o) => o.id === optionId)?.score;
  return picked != null && (picked === Math.min(...scores) || picked === Math.max(...scores));
}

function isAnswered(q: FormQuestion, a: FormAnswer | undefined): boolean {
  if (q.kind === "text") return !!a?.text?.trim();
  if (!a?.option_id) return false;
  return !needsEvidence(q, a.option_id) || !!a.evidence?.trim();
}

export function ReviewForm({ ym, kind, reviewee, kindLabel, questions, initial }: Props) {
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>(initial);
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(submitReview, { error: null });
  const [missing, setMissing] = useState<string | null>(null);

  const sections = useMemo(() => {
    const map = new Map<string, FormQuestion[]>();
    for (const q of questions) map.set(q.section, [...(map.get(q.section) ?? []), q]);
    return [...map.entries()];
  }, [questions]);

  const required = questions.filter((q) => q.is_required);
  const answeredCount = required.filter((q) => isAnswered(q, answers[q.id])).length;

  const set = (id: string, patch: Partial<FormAnswer>) =>
    setAnswers((prev) => {
      const cur = prev[id] ?? { option_id: null, text: null, evidence: null };
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const firstMissing = questions.find((q) => {
      const a = answers[q.id];
      if (q.is_required) return !isAnswered(q, a);
      return needsEvidence(q, a?.option_id ?? null) && !a?.evidence?.trim();
    });
    if (firstMissing) {
      e.preventDefault();
      setMissing(firstMissing.id);
      document.getElementById(`q-${firstMissing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setMissing(null);
    }
  }

  let number = 0;
  return (
    <form action={action} onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="bulan" value={ym} />
      <input type="hidden" name="jenis" value={kind} />
      <input type="hidden" name="untuk" value={reviewee} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <div className="sticky top-2 z-10 rounded-2xl bg-white/90 px-4 py-3 shadow-soft ring-1 ring-slate-200/70 backdrop-blur">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
          <span className="font-medium text-slate-800">{kindLabel}</span>
          <span>
            {answeredCount}/{required.length} pertanyaan wajib terjawab
          </span>
        </div>
        <ProgressBar className="mt-1.5" value={required.length ? (answeredCount / required.length) * 100 : 100} />
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      {sections.map(([section, qs]) => (
        <Card key={section}>
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section}</h2>
          </div>
          <CardContent className="divide-y divide-slate-100 py-0">
            {qs.map((q) => {
              number += 1;
              const a = answers[q.id];
              const evidence = needsEvidence(q, a?.option_id ?? null);
              const flagged = missing === q.id;
              return (
                <fieldset key={q.id} id={`q-${q.id}`} className={cn("scroll-mt-24 py-5", flagged && "rounded-xl bg-red-50/40")}>
                  <legend className="sr-only">{q.prompt}</legend>
                  <p className="font-medium text-slate-900">
                    <span className="mr-1.5 text-slate-400">{number}.</span>
                    {q.prompt}
                    {q.is_required && <span className="ml-0.5 text-red-500">*</span>}
                  </p>
                  {q.help && <p className="mt-0.5 text-xs text-slate-500">{q.help}</p>}

                  {q.kind === "text" ? (
                    <Textarea
                      className="mt-3"
                      rows={3}
                      maxLength={4000}
                      value={a?.text ?? ""}
                      onChange={(e) => set(q.id, { text: e.target.value })}
                      aria-label={q.prompt}
                    />
                  ) : (
                    <div className={cn("mt-3 grid gap-2", q.kind === "choice" && "sm:grid-cols-2")}>
                      {q.options.map((o) => {
                        const checked = a?.option_id === o.id;
                        return (
                          <label
                            key={o.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-200",
                              checked ? "border-brand-400 bg-brand-50/70 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-slate-50",
                            )}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={o.id}
                              checked={checked}
                              onChange={() => set(q.id, { option_id: o.id })}
                              className="sr-only"
                            />
                            {q.kind === "scale" && o.score != null ? (
                              <span
                                className={cn(
                                  "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                                  checked ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {o.score}
                              </span>
                            ) : (
                              <span className={cn("mt-0.5 size-4 shrink-0 rounded-full border-2", checked ? "border-brand-500 bg-brand-500" : "border-slate-300")} />
                            )}
                            <span className="min-w-0">
                              <span className="block">{o.label}</span>
                              {o.description && <span className="block text-xs text-slate-500">{o.description}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {evidence && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-700" htmlFor={`ev-${q.id}`}>
                        Contoh kejadian / bukti <span className="text-red-500">*</span>
                      </label>
                      <Textarea
                        id={`ev-${q.id}`}
                        className="mt-1"
                        rows={2}
                        maxLength={2000}
                        placeholder="Mis. tanggal, tiket, atau situasi yang mendasari pilihan ini."
                        value={a?.evidence ?? ""}
                        onChange={(e) => set(q.id, { evidence: e.target.value })}
                      />
                    </div>
                  )}
                  {flagged && <p className="mt-2 text-xs font-medium text-red-600">{evidence && a?.option_id ? "Tuliskan contoh kejadian untuk pilihan ini." : "Pertanyaan ini wajib dijawab."}</p>}
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <a href={`/review?bulan=${ym}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Batal
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan penilaian"}
        </Button>
      </div>
    </form>
  );
}
