import "server-only";
import type { createClient } from "@noc/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type ExistingCell = { id: string; user_id: string; work_date: string; shift_id: string };

export const cellKey = (userId: string, date: string) => `${userId}|${date}`;

export type DiffResult = { inserted: number; updated: number; deleted: number; error: { message: string; code?: string } | null };

/**
 * Terapkan jadwal yang diinginkan (satu shift per user+tanggal) dengan diff terhadap baris yang ada:
 * update shift_id yang berubah, insert yang baru, hapus yang dikosongkan. TIDAK menghapus-lalu-insert-ulang
 * agar referensi leave_requests.swap_schedule_id tetap utuh.
 *
 * `desired`: key `userId|date` → shift_id, atau null (= kosongkan). Hanya key yang ada di map yang disentuh.
 * `existing`: baris shift_schedules periode ini untuk user/tanggal terkait.
 */
export async function applyScheduleDiff(
  supabase: Supa,
  opts: {
    periodId: string;
    siteId: string | null;
    userId: string;
    desired: Map<string, string | null>;
    existing: ExistingCell[];
  },
): Promise<DiffResult> {
  const byKey = new Map<string, ExistingCell[]>();
  for (const r of opts.existing) {
    const k = cellKey(r.user_id, r.work_date);
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }

  const toDelete: string[] = [];
  const toUpdate = new Map<string, string[]>(); // shift_id baru → id baris
  const toInsert: { period_id: string; work_date: string; shift_id: string; user_id: string; site_id: string | null; created_by: string }[] = [];

  for (const [k, shiftId] of opts.desired) {
    const rows = byKey.get(k) ?? [];
    if (shiftId === null) {
      toDelete.push(...rows.map((r) => r.id));
      continue;
    }
    if (rows.length === 0) {
      const [uid, date] = k.split("|");
      toInsert.push({
        period_id: opts.periodId,
        work_date: date,
        shift_id: shiftId,
        user_id: uid,
        site_id: opts.siteId,
        created_by: opts.userId,
      });
      continue;
    }
    // Sudah ada baris dengan shift yang sama → tidak berubah. Baris tambahan (jika ada >1) dibiarkan.
    if (rows.some((r) => r.shift_id === shiftId)) continue;
    const ids = toUpdate.get(shiftId) ?? [];
    ids.push(rows[0].id);
    toUpdate.set(shiftId, ids);
  }

  const result: DiffResult = { inserted: 0, updated: 0, deleted: 0, error: null };

  // Urutan: hapus → update → insert (meminimalkan bentrok unique (work_date, shift_id, user_id)).
  for (const ids of chunk(toDelete, 200)) {
    const { error } = await supabase.from("shift_schedules").delete().in("id", ids);
    if (error) return { ...result, error };
    result.deleted += ids.length;
  }
  for (const [shiftId, allIds] of toUpdate) {
    for (const ids of chunk(allIds, 200)) {
      const { error } = await supabase.from("shift_schedules").update({ shift_id: shiftId }).in("id", ids);
      if (error) return { ...result, error };
      result.updated += ids.length;
    }
  }
  for (const rows of chunk(toInsert, 500)) {
    const { error } = await supabase.from("shift_schedules").insert(rows);
    if (error) return { ...result, error };
    result.inserted += rows.length;
  }
  return result;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function diffSummary(r: DiffResult): string {
  if (r.inserted + r.updated + r.deleted === 0) return "Tidak ada perubahan.";
  const parts = [];
  if (r.inserted) parts.push(`${r.inserted} ditambah`);
  if (r.updated) parts.push(`${r.updated} diubah`);
  if (r.deleted) parts.push(`${r.deleted} dihapus`);
  return `Jadwal tersimpan: ${parts.join(", ")}.`;
}

/** Semua baris shift_schedules satu periode (dipaginasi — PostgREST membatasi ~1000 baris per request). */
export async function fetchPeriodCells(
  supabase: Supa,
  periodId: string,
  userIds?: string[],
): Promise<{ data: (ExistingCell & { is_leader: boolean })[]; error: { message: string; code?: string } | null }> {
  const out: (ExistingCell & { is_leader: boolean })[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from("shift_schedules").select("id, user_id, work_date, shift_id, is_leader").eq("period_id", periodId);
    if (userIds) q = q.in("user_id", userIds);
    const { data, error } = await q.order("id").range(from, from + page - 1);
    if (error) return { data: out, error };
    const rows = (data ?? []) as (ExistingCell & { is_leader: boolean })[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return { data: out, error: null };
}
