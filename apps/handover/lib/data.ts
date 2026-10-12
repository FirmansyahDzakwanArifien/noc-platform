import "server-only";
import { createClient } from "@noc/supabase/server";
import type { Shift, Site } from "@noc/supabase/types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ProfileLite = { id: string; full_name: string; is_active: boolean };
export type SiteLite = Pick<Site, "id" | "code" | "name" | "is_active">;
export type ShiftLite = Pick<Shift, "id" | "name" | "start_time" | "end_time" | "is_working" | "is_active" | "sort_order">;

export async function loadProfiles(supabase: Client) {
  const { data } = await supabase.from("profiles").select("id, full_name, is_active").order("full_name");
  const list = (data as ProfileLite[] | null) ?? [];
  const map = new Map(list.map((p) => [p.id, p.full_name]));
  return { list, active: list.filter((p) => p.is_active), name: (id: string | null | undefined) => (id ? map.get(id) ?? "-" : "-") };
}

export async function loadSites(supabase: Client) {
  const { data } = await supabase.from("sites").select("id, code, name, is_active").order("name");
  const list = (data as SiteLite[] | null) ?? [];
  const map = new Map(list.map((s) => [s.id, s]));
  return { list, active: list.filter((s) => s.is_active), name: (id: string | null | undefined) => (id ? map.get(id)?.name ?? "-" : "Umum") };
}

export async function loadShifts(supabase: Client) {
  const { data } = await supabase
    .from("shifts")
    .select("id, name, start_time, end_time, is_working, is_active, sort_order")
    .order("sort_order");
  const list = (data as ShiftLite[] | null) ?? [];
  const map = new Map(list.map((s) => [s.id, s]));
  return {
    list,
    working: list.filter((s) => s.is_working && s.is_active),
    get: (id: string | null | undefined) => (id ? map.get(id) : undefined),
    name: (id: string | null | undefined) => (id ? map.get(id)?.name ?? "-" : "-"),
  };
}
