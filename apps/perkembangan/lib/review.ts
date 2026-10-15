import { todayWIB } from "./data";

/** Bulan dalam format YYYY-MM. */
export type Ym = string;

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function currentYm(): Ym {
  return todayWIB().slice(0, 7);
}

export function isYm(v: string | null | undefined): v is Ym {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftYm(ym: Ym, delta: number): Ym {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Tanggal pertama bulan (dipakai sebagai period_month di database). */
export function ymToDate(ym: Ym): string {
  return `${ym}-01`;
}

export function ymLabel(ym: Ym): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}

/** Review bisa diisi untuk bulan ini & bulan lalu (sama dengan aturan di database). */
export function isYmOpen(ym: Ym): boolean {
  const cur = currentYm();
  return ym === cur || ym === shiftYm(cur, -1);
}

export type ReviewKind = "self" | "peer" | "supervisor";

export const REVIEW_KINDS: ReviewKind[] = ["self", "peer", "supervisor"];

export function isReviewKind(v: string | null | undefined): v is ReviewKind {
  return v === "self" || v === "peer" || v === "supervisor";
}

export const KIND_LABEL: Record<ReviewKind, string> = {
  self: "Self review",
  peer: "Penilaian rekan",
  supervisor: "Penilaian atasan",
};

export const KIND_TONE: Record<ReviewKind, string> = {
  self: "bg-sky-50 text-sky-700 ring-sky-600/20",
  peer: "bg-violet-50 text-violet-700 ring-violet-600/20",
  supervisor: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export type QuestionKind = "scale" | "choice" | "text";

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  scale: "Rubrik (dinilai)",
  choice: "Pilihan (tidak dinilai)",
  text: "Isian teks",
};

export type FormQuestion = {
  id: string;
  section: string;
  prompt: string;
  help: string | null;
  kind: QuestionKind;
  is_required: boolean;
  evidence_rule: "none" | "extreme" | "always";
  options: { id: string; label: string; description: string | null; score: number | null }[];
};

export type FormAnswer = { option_id: string | null; text: string | null; evidence: string | null };

/** Nilai 0–100 → predikat. */
export function grade(pct: number | null | undefined): { label: string; tone: string } | null {
  if (pct == null) return null;
  if (pct >= 85) return { label: "Sangat baik", tone: "text-emerald-600" };
  if (pct >= 70) return { label: "Baik", tone: "text-sky-600" };
  if (pct >= 50) return { label: "Cukup", tone: "text-amber-600" };
  return { label: "Perlu perbaikan", tone: "text-red-600" };
}

export function pctText(pct: number | string | null | undefined): string {
  return pct == null ? "–" : Number(pct).toFixed(0);
}
