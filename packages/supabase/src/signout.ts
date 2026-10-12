import { NextResponse } from "next/server";
import { PORTAL_URL } from "./env";
import { createClient } from "./server";

/** Route handler bersama: `export { POST } from "@noc/supabase/signout"` di app/auth/signout/route.ts */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", PORTAL_URL), { status: 303 });
}
