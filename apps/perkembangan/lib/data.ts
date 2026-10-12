import type { createClient } from "@noc/supabase/server";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ProfileLite = { id: string; full_name: string; is_active: boolean };

/**
 * Semua profil yang boleh dibaca user (RLS: portal.access, atau hanya diri sendiri).
 * Dipakai untuk nama assignee/pelapor dan pilihan anggota.
 */
export async function loadProfiles(supabase: Supabase) {
  const { data } = await supabase.from("profiles").select("id, full_name, is_active").order("full_name");
  const list = (data ?? []) as ProfileLite[];
  const map = new Map(list.map((p) => [p.id, p.full_name]));
  return {
    list,
    active: list.filter((p) => p.is_active),
    name: (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "—"),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** Path redirect internal yang aman (hanya path relatif di app ini). */
export function safeBack(v: string | null | undefined, fallback = "/"): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

/** Tambah/kurangi hari dari tanggal "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDateStr(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Tanggal hari ini (YYYY-MM-DD) di zona WIB. */
export function todayWIB(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
