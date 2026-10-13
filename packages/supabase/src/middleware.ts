import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieDomain, PORTAL_URL, SUPABASE_JWKS, supabaseEnv } from "./env";

type Options = {
  /** Path yang boleh diakses tanpa login (prefix match). */
  publicPaths?: string[];
  /** true untuk app portal: redirect ke /login lokal, bukan ke PORTAL_URL. */
  isPortal?: boolean;
};

/** Refresh session Supabase + redirect ke halaman login portal jika belum login. */
export async function updateSession(request: NextRequest, opts: Options = {}) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookieOptions: { domain: cookieDomain() },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims: refresh session bila perlu, lalu verifikasi JWT (ES256) secara lokal via JWKS —
  // tanpa round-trip ke server Auth di setiap request.
  const { data } = await supabase.auth.getClaims(undefined, { keys: SUPABASE_JWKS });
  const user = data?.claims?.sub;

  const path = request.nextUrl.pathname;
  const isPublic = (opts.publicPaths ?? []).some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const target = opts.isPortal ? new URL("/login", request.url) : new URL("/login", PORTAL_URL);
    target.searchParams.set("next", opts.isPortal ? path + request.nextUrl.search : request.nextUrl.href);
    return NextResponse.redirect(target);
  }

  return response;
}
