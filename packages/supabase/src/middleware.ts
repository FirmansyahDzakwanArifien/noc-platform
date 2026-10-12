import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieDomain, PORTAL_URL, supabaseEnv } from "./env";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = (opts.publicPaths ?? []).some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const target = opts.isPortal ? new URL("/login", request.url) : new URL("/login", PORTAL_URL);
    target.searchParams.set("next", opts.isPortal ? path + request.nextUrl.search : request.nextUrl.href);
    return NextResponse.redirect(target);
  }

  return response;
}
