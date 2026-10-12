import "server-only";
import type { createClient } from "@noc/supabase/server";

export type Supabase = Awaited<ReturnType<typeof createClient>>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** "2026-10-12T08:00" (datetime-local, WIB) → "2026-10-12T08:00:00+07:00". null bila format tidak valid. */
export function wibToIso(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(v);
  if (!m) return null;
  return `${m[1]}T${m[2]}${m[3] ?? ":00"}+07:00`;
}

/** Path redirect dari form (hidden "back"); hanya path relatif internal. */
export function safeBack(v: string | null, fallback: string): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

/**
 * Peta id → nama profil. Vendor tidak bisa membaca direktori profil (RLS),
 * jadi hasil bisa kosong — pemanggil harus menyediakan fallback.
 */
export async function profileNames(supabase: Supabase, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const p of (data ?? []) as { id: string; full_name: string }[]) map.set(p.id, p.full_name);
  return map;
}

export function nameOf(map: Map<string, string>, id: string | null | undefined, me?: string): string {
  if (!id) return "-";
  if (map.has(id)) return map.get(id)!;
  if (me && id === me) return "Saya";
  return "-";
}
