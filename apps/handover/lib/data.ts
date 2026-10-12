import "server-only";
import { createClient } from "@noc/supabase/server";
import type { Shift, Site } from "@noc/supabase/types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ProfileLite = { id: string; full_name: string; is_active: boolean };

export async function loadProfiles(supabase: Client) {
  const { data } = await supabase.from("profiles").select("id, full_name, is_active").order("full_name");
  const list = (data as ProfileLite[] | null) ?? [];
  const map = new Map(list.map((p) => [p.id, p.full_name]));
  return { list, active: list.filter((p) => p.is_active), name: (id: string | null | undefined) => (id ? map.get(id) ?? "-" : "-") };
}

export async function loadSites(supabase: Client) {
  const { data } = await supabase.from("sites").select("*").order("name");
  const list = (data as Site[] | null) ?? [];
  const map = new Map(list.map((s) => [s.id, s]));
  return { list, active: list.filter((s) => s.is_active), name: (id: string | null | undefined) => (id ? map.get(id)?.name ?? "-" : "Umum") };
}

export async function loadShifts(supabase: Client) {
  const { data } = await supabase.from("shifts").select("*").order("sort_order");
  const list = (data as Shift[] | null) ?? [];
  const map = new Map(list.map((s) => [s.id, s]));
  return {
    list,
    working: list.filter((s) => s.is_working && s.is_active),
    get: (id: string | null | undefined) => (id ? map.get(id) : undefined),
    name: (id: string | null | undefined) => (id ? map.get(id)?.name ?? "-" : "-"),
  };
}
