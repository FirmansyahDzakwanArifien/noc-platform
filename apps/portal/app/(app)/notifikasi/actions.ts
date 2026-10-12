"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, fail, req } from "@noc/supabase/actions";

const back = "/notifikasi";

export async function markRead(formData: FormData) {
  const { supabase } = await actionContext(back);
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", req(formData, "id", back));
  if (error) fail(back, dbError(error));
  revalidatePath(back);
}

export async function markAllRead() {
  const { supabase, auth } = await actionContext(back);
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("read_at", null);
  if (error) fail(back, dbError(error));
  revalidatePath(back);
}
