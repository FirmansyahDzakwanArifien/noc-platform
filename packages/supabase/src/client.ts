"use client";

import { createBrowserClient } from "@supabase/ssr";
import { cookieDomain, supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key, {
    cookieOptions: { domain: cookieDomain() },
  });
}

/** Klien terpisah yang tidak membaca token dari URL otomatis (untuk halaman yang memprosesnya sendiri, mis. undangan). */
export function createManualClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key, {
    cookieOptions: { domain: cookieDomain() },
    auth: { detectSessionInUrl: false },
    isSingleton: false,
  });
}
