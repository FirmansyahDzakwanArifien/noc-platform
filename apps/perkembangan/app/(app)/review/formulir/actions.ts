"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import { isUuid } from "@/lib/data";
import { isReviewKind } from "@/lib/review";

const MAX_OPTIONS = 7;

export async function saveForm(formData: FormData) {
  const kind = String(formData.get("jenis") ?? "");
  if (!isReviewKind(kind)) fail("/review/formulir", "Jenis formulir tidak valid.");
  const back = `/review/formulir?jenis=${kind}`;
  const { supabase } = await actionContext(back, "review.manage");
  const weight = num(formData, "weight");
  if (weight == null || weight < 0 || weight > 100) fail(back, "Bobot harus 0–100.");

  const { error } = await supabase
    .from("review_forms")
    .update({
      name: req(formData, "name", back, "Nama formulir"),
      description: str(formData, "description"),
      weight,
      is_active: bool(formData, "is_active"),
      updated_at: new Date().toISOString(),
    })
    .eq("review_type", kind);
  if (error) fail(back, dbError(error));
  revalidatePath("/review", "layout");
  done(back, "Pengaturan formulir tersimpan.");
}

export async function toggleQuestion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("jenis") ?? "");
  const back = `/review/formulir?jenis=${isReviewKind(kind) ? kind : "self"}`;
  if (!isUuid(id)) fail(back, "Pertanyaan tidak valid.");
  const { supabase } = await actionContext(back, "review.manage");
  const { error } = await supabase.from("review_questions").update({ is_active: bool(formData, "active") }).eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/review", "layout");
  done(back, bool(formData, "active") ? "Pertanyaan diaktifkan." : "Pertanyaan dinonaktifkan.");
}

export async function saveQuestion(formData: FormData) {
  const kind = String(formData.get("jenis") ?? "");
  if (!isReviewKind(kind)) fail("/review/formulir", "Jenis formulir tidak valid.");
  const id = str(formData, "id");
  const back = id ? `/review/formulir/pertanyaan?id=${id}` : `/review/formulir/pertanyaan?jenis=${kind}`;
  if (id && !isUuid(id)) fail(back, "Pertanyaan tidak valid.");
  const { supabase } = await actionContext(back, "review.manage");

  const qKind = String(formData.get("kind") ?? "");
  if (!["scale", "choice", "text"].includes(qKind)) fail(back, "Tipe pertanyaan tidak valid.");
  const divisionId = str(formData, "division_id");
  if (divisionId && !isUuid(divisionId)) fail(back, "Divisi tidak valid.");
  const evidenceRule = String(formData.get("evidence_rule") ?? "none");
  if (!["none", "extreme", "always"].includes(evidenceRule)) fail(back, "Aturan bukti tidak valid.");
  const weight = num(formData, "weight") ?? 1;
  if (weight <= 0 || weight > 10) fail(back, "Bobot pertanyaan harus di atas 0 dan maksimal 10.");

  // Pilihan jawaban (baris kosong diabaikan / dihapus).
  type Opt = { id: string | null; label: string; description: string | null; score: number | null; sort_order: number };
  const options: Opt[] = [];
  const removed: string[] = [];
  for (let i = 0; i < MAX_OPTIONS; i++) {
    const optId = str(formData, `opt_id_${i}`);
    const label = str(formData, `opt_label_${i}`);
    if (optId && !isUuid(optId)) fail(back, "Pilihan tidak valid.");
    if (!label) {
      if (optId) removed.push(optId);
      continue;
    }
    const score = qKind === "scale" ? num(formData, `opt_score_${i}`) : null;
    if (qKind === "scale" && score == null) fail(back, `Skor pilihan "${label}" wajib diisi.`);
    options.push({ id: optId, label: label.slice(0, 300), description: str(formData, `opt_desc_${i}`), score, sort_order: options.length + 1 });
  }
  if (qKind !== "text" && options.length < 2) fail(back, "Pertanyaan pilihan butuh minimal 2 pilihan jawaban.");
  if (qKind === "scale" && new Set(options.map((o) => o.score)).size < 2) fail(back, "Skor rubrik minimal punya 2 nilai berbeda.");

  const { data: form } = await supabase.from("review_forms").select("id").eq("review_type", kind).single();
  if (!form) fail(back, "Formulir tidak ditemukan.");

  const row = {
    form_id: (form as { id: string }).id,
    section: req(formData, "section", back, "Bagian").slice(0, 80),
    prompt: req(formData, "prompt", back, "Pertanyaan").slice(0, 300),
    help: str(formData, "help"),
    kind: qKind,
    is_required: bool(formData, "is_required"),
    weight,
    division_id: divisionId,
    evidence_rule: qKind === "text" ? "none" : evidenceRule,
    sort_order: Math.round(num(formData, "sort_order") ?? 0),
    is_active: bool(formData, "is_active"),
  };

  let questionId = id;
  if (id) {
    const { error } = await supabase.from("review_questions").update(row).eq("id", id);
    if (error) fail(back, dbError(error));
  } else {
    const { data, error } = await supabase.from("review_questions").insert(row).select("id").single();
    if (error || !data) fail(back, dbError(error));
    questionId = (data as { id: string }).id;
  }

  if (qKind === "text") {
    const { error } = await supabase.from("review_options").delete().eq("question_id", questionId!);
    if (error) fail(back, dbError(error));
  } else {
    if (removed.length) {
      const { error } = await supabase.from("review_options").delete().in("id", removed).eq("question_id", questionId!);
      if (error) fail(back, dbError(error));
    }
    for (const o of options) {
      const values = { label: o.label, description: o.description, score: o.score, sort_order: o.sort_order };
      const { error } = o.id
        ? await supabase.from("review_options").update(values).eq("id", o.id).eq("question_id", questionId!)
        : await supabase.from("review_options").insert({ ...values, question_id: questionId! });
      if (error) fail(back, dbError(error));
    }
  }

  revalidatePath("/review", "layout");
  done(`/review/formulir?jenis=${kind}`, id ? "Pertanyaan diperbarui." : "Pertanyaan ditambahkan.");
}
