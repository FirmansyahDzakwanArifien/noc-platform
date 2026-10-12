export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi. Salin .env.example ke .env.local di root repo.",
    );
  }
  return { url, key };
}

/** Domain cookie bersama (mis. ".noc.jarvis.biz.id") agar session berlaku di semua app. Kosong = host saat ini. */
export function cookieDomain(): string | undefined {
  return process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
}

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000";

/** Email yang boleh mendaftar. Hanya untuk validasi UX — penegakan sebenarnya di database (auth hook + trigger). */
export const ALLOWED_SIGNUP_EMAILS = ["dzakwan.corp@gmail.com"];
export const ALLOWED_SIGNUP_DOMAINS = ["corp.jarvis.biz.id", "jarvis.biz.id"];

export function isEmailAllowed(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (ALLOWED_SIGNUP_EMAILS.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  return ALLOWED_SIGNUP_DOMAINS.includes(domain);
}
