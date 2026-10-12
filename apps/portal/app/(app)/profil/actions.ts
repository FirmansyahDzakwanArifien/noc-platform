"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";

export async function updateProfile(formData: FormData) {
  const back = "/profil";
  const { supabase, auth } = await actionContext(back);
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: req(formData, "full_name", back, "Nama lengkap"),
      employee_no: str(formData, "employee_no"),
      phone: str(formData, "phone"),
    })
    .eq("id", auth.userId);
  if (error) fail(back, dbError(error));
  revalidatePath("/", "layout");
  done(back, "Profil tersimpan.");
}
