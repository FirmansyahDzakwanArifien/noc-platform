"use client";

import { createBrowserClient } from "@supabase/ssr";
import { cookieDomain, supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key, {
    cookieOptions: { domain: cookieDomain() },
  });
}
