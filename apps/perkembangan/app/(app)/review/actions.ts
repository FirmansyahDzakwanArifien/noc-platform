"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuth } from "@noc/supabase/auth";
import { dbError } from "@noc/supabase/actions";
import { createClient } from "@noc/supabase/server";
import { isUuid } from "@/lib/data";
import { isReviewKind, isYm, KIND_LABEL, ymLabel, ymToDate } from "@/lib/review";

export type ReviewFormState = { error: string | null };

/** Dipanggil dari formulir penilaian (client) lewat useActionState agar isian tidak hilang saat gagal. */
export async function submitReview(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const ym = String(formData.get("bulan") ?? "");
  const kind = String(formData.get("jenis") ?? "");
  const reviewee = String(formData.get("untuk") ?? "");
  if (!isYm(ym) || !isReviewKind(kind) || !isUuid(reviewee)) return { error: "Data penilaian tidak valid." };

  let answers: unknown;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    return { error: "Isian tidak terbaca, muat ulang halaman." };
  }

  const auth = await getAuth();
  if (!auth) return { error: "Sesi berakhir, silakan login ulang." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_submit", { p_month: ymToDate(ym), p_type: kind, p_reviewee: reviewee, p_answers: answers });
  if (error) return { error: dbError(error) };

  revalidatePath("/review");
  revalidatePath("/review/hasil");
  redirect(`/review?bulan=${ym}&success=${encodeURIComponent(`${KIND_LABEL[kind]} ${ymLabel(ym)} tersimpan.`)}`);
}
