"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail } from "@noc/supabase/actions";

const back = "/sinkron";

/** Aktifkan feed kalender (buat token) atau buat ulang token (link lama berhenti berlaku). */
export async function enableFeed(formData: FormData) {
  const reset = formData.get("reset") === "1";
  const { supabase } = await actionContext(back);
  const { error } = await supabase.rpc("my_calendar_feed", { p_reset: reset });
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, reset ? "Link kalender dibuat ulang. Link lama sudah tidak berlaku — tambahkan ulang di aplikasi kalender Anda." : "Sinkron kalender aktif.");
}
