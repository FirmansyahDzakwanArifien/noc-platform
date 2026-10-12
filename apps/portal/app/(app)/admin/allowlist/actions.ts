"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";

const back = "/admin/allowlist";

export async function addEntry(formData: FormData) {
  const { supabase } = await actionContext(back, "user.manage");
  const kind = req(formData, "kind", back);
  const value = req(formData, "value", back, "Nilai").toLowerCase().replace(/^@/, "");
  const defaultRole = str(formData, "default_role") ?? "viewer";
  const note = str(formData, "note");

  if (kind === "domain") {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) fail(back, "Format domain tidak valid.");
    const { error } = await supabase.from("allowed_signup_domains").insert({ domain: value, default_role: defaultRole, note });
    if (error) fail(back, dbError(error));
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) fail(back, "Format email tidak valid.");
    const { error } = await supabase.from("allowed_signup_emails").insert({ email: value, default_role: defaultRole, note });
    if (error) fail(back, dbError(error));
  }
  revalidatePath(back);
  done(back, "Ditambahkan ke allowlist.");
}

export async function removeEntry(formData: FormData) {
  const { supabase } = await actionContext(back, "user.manage");
  const kind = req(formData, "kind", back);
  const value = req(formData, "value", back);
  const { error } =
    kind === "domain"
      ? await supabase.from("allowed_signup_domains").delete().eq("domain", value)
      : await supabase.from("allowed_signup_emails").delete().eq("email", value);
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Dihapus dari allowlist. User yang sudah terdaftar tidak terpengaruh.");
}
