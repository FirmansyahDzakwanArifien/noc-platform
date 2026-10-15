"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import { isUuid } from "@/lib/data";
import { isYm, ymLabel, ymToDate } from "@/lib/review";

export async function submitReview(formData: FormData) {
  const ym = String(formData.get("bulan") ?? "");
  const reviewee = String(formData.get("untuk") ?? "");
  if (!isYm(ym) || !isUuid(reviewee)) fail("/review", "Data review tidak valid.");
  const back = `/review/isi?bulan=${ym}&untuk=${reviewee}`;
  const { supabase, auth } = await actionContext(back, "review.submit");

  const scores: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("score:") || typeof v !== "string") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 5) scores[k.slice(6)] = n;
  }
  const isSelf = reviewee === auth.userId;

  const { error } = await supabase.rpc("submit_review", {
    p_month: ymToDate(ym),
    p_reviewee: reviewee,
    p_scores: scores,
    p_highlights: isSelf ? req(formData, "highlights", back, "Pencapaian") : str(formData, "highlights"),
    p_improvements: str(formData, "improvements"),
    p_goals: isSelf ? str(formData, "goals") : null,
    p_comment: str(formData, "comment"),
  });
  if (error) fail(back, dbError(error));

  revalidatePath("/review");
  revalidatePath("/review/laporan");
  done(`/review?bulan=${ym}`, isSelf ? `Self review ${ymLabel(ym)} tersimpan.` : `Penilaian rekan ${ymLabel(ym)} tersimpan.`);
}
