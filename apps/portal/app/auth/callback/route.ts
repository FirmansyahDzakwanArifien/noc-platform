import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextUrl } from "@noc/supabase/apps";
import { createClient } from "@noc/supabase/server";

/** Tujuan link email (verifikasi, magic link, reset password) dan OAuth redirect. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextUrl(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let errorMessage: string | null = searchParams.get("error_description");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) errorMessage = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) errorMessage = error.message;
  } else if (!errorMessage) {
    errorMessage = "Link tidak valid.";
  }

  if (errorMessage) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", /not allowed|database error/i.test(errorMessage) ? "Email ini tidak diizinkan." : errorMessage);
    return NextResponse.redirect(login);
  }

  return NextResponse.redirect(next.startsWith("/") ? new URL(next, origin) : next);
}
