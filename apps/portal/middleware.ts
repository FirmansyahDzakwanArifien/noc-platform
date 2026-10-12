import type { NextRequest } from "next/server";
import { updateSession } from "@noc/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request, { isPortal: true, publicPaths: ["/login", "/daftar", "/lupa-password", "/auth"] });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
