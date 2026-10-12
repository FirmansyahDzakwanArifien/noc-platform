"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, num, req, str } from "@noc/supabase/actions";
import type { SchedulePeriod, ScheduleStatus } from "@noc/supabase/types";
import { dateRange, diffDays, isValidDate } from "@/lib/dates";
import { applyScheduleDiff, cellKey, diffSummary, fetchPeriodCells } from "@/lib/schedule-diff";
import { UUID_RE } from "@/lib/shift";

type Ctx = Awaited<ReturnType<typeof actionContext>>;

/** URL kembali ke editor (mempertahankan query, mis. ?users=). Hanya izinkan path editor periode ini. */
function backPath(formData: FormData, id: string): string {
  const base = `/kelola/${id}`;
  const b = str(formData, "back");
  return b && (b === base || b.startsWith(base + "?")) ? b : base;
}

async function loadPeriod(supabase: Ctx["supabase"], id: string, back: string): Promise<SchedulePeriod> {
  const { data, error } = await supabase.from("schedule_periods").select("*").eq("id", id).maybeSingle();
  if (error) fail(back, dbError(error));
  if (!data) fail("/kelola", "Periode tidak ditemukan.");
  return data as SchedulePeriod;
}

function revalidate(id: string) {
  revalidatePath(`/kelola/${id}`);
  revalidatePath("/kelola");
  revalidatePath("/kalender");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Simpan grid
// ---------------------------------------------------------------------------
export async function saveGrid(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail("/kelola", "Periode tidak valid.");
  const back = backPath(formData, id);
  const { supabase, auth } = await actionContext(back, "schedule.manage");
  const [period, { data: shiftData }] = await Promise.all([
    loadPeriod(supabase, id, back),
    supabase.from("shifts").select("id"),
  ]);

  const shiftIds = new Set(((shiftData as { id: string }[] | null) ?? []).map((s) => s.id));

  const desired = new Map<string, string | null>();
  const users = new Set<string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cell:") || typeof value !== "string") continue;
    const [, uid, date] = key.split(":");
    if (!uid || !UUID_RE.test(uid) || !isValidDate(date)) continue;
    if (date < period.start_date || date > period.end_date) continue;
    const v = value.trim();
    if (v !== "" && !shiftIds.has(v)) fail(back, "Shift tidak valid pada salah satu sel.");
    desired.set(cellKey(uid, date), v === "" ? null : v);
    users.add(uid);
  }
  if (desired.size === 0) fail(back, "Tidak ada sel jadwal yang dikirim. Muat ulang halaman lalu coba lagi.");

  const { data: existing, error: exErr } = await fetchPeriodCells(supabase, id, [...users]);
  if (exErr) fail(back, dbError(exErr));

  const res = await applyScheduleDiff(supabase, {
    periodId: id,
    siteId: period.site_id,
    userId: auth.userId,
    desired,
    existing,
  });
  revalidate(id);
  if (res.error) fail(back, `${diffSummary(res)} Gagal menyimpan sebagian: ${dbError(res.error)}`);
  done(back, diffSummary(res));
}

// ---------------------------------------------------------------------------
// Isi pola rotasi
// ---------------------------------------------------------------------------
export async function fillRotation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail("/kelola", "Periode tidak valid.");
  const back = backPath(formData, id);
  const { supabase, auth } = await actionContext(back, "schedule.manage");
  const [period, { data: shiftData, error: shErr }] = await Promise.all([
    loadPeriod(supabase, id, back),
    supabase.from("shifts").select("id, code, is_active"),
  ]);

  const users = formData
    .getAll("rot_users")
    .filter((v): v is string => typeof v === "string" && UUID_RE.test(v));
  if (users.length === 0) fail(back, "Centang minimal satu anggota untuk diisi pola rotasi.");

  const patternText = req(formData, "pattern", back, "Pola");
  const start = str(formData, "rot_start") ?? period.start_date;
  if (!isValidDate(start)) fail(back, "Tanggal mulai pola tidak valid.");
  if (start > period.end_date) fail(back, "Tanggal mulai pola di luar periode.");
  const offset = Math.trunc(num(formData, "offset") ?? 0);

  if (shErr) fail(back, dbError(shErr));
  const byCode = new Map<string, string>();
  for (const s of (shiftData as { id: string; code: string; is_active: boolean }[] | null) ?? []) {
    if (s.is_active || !byCode.has(s.code.toUpperCase())) byCode.set(s.code.toUpperCase(), s.id);
  }

  const tokens = patternText
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) fail(back, "Pola shift belum diisi.");
  if (tokens.length > 366) fail(back, "Pola shift terlalu panjang (maksimal 366 kode).");
  const pattern: (string | null)[] = [];
  const unknown: string[] = [];
  for (const t of tokens) {
    if (t === "-" || t === "_") pattern.push(null);
    else if (byCode.has(t)) pattern.push(byCode.get(t)!);
    else unknown.push(t);
  }
  if (unknown.length) fail(back, `Kode shift tidak dikenal: ${[...new Set(unknown)].join(", ")}.`);

  const fillFrom = start < period.start_date ? period.start_date : start;
  const dates = dateRange(fillFrom, period.end_date);
  const len = pattern.length;
  const desired = new Map<string, string | null>();
  users.forEach((uid, i) => {
    for (const d of dates) {
      const idx = (((diffDays(start, d) + i * offset) % len) + len) % len;
      desired.set(cellKey(uid, d), pattern[idx]);
    }
  });

  const { data: existing, error: exErr } = await fetchPeriodCells(supabase, id, users);
  if (exErr) fail(back, dbError(exErr));

  const res = await applyScheduleDiff(supabase, {
    periodId: id,
    siteId: period.site_id,
    userId: auth.userId,
    desired,
    existing,
  });
  revalidate(id);
  if (res.error) fail(back, `${diffSummary(res)} Gagal menyimpan sebagian: ${dbError(res.error)}`);
  done(back, `Pola rotasi diterapkan ke ${users.length} orang. ${diffSummary(res)}`);
}

// ---------------------------------------------------------------------------
// Status & hapus
// ---------------------------------------------------------------------------
const TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

const STATUS_MSG: Record<ScheduleStatus, string> = {
  published: "Jadwal dipublikasikan. Anggota tim yang terjadwal sudah dinotifikasi.",
  draft: "Periode dikembalikan ke draft dan tidak lagi terlihat oleh anggota tim.",
  archived: "Periode diarsipkan.",
};

export async function setPeriodStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail("/kelola", "Periode tidak valid.");
  const back = backPath(formData, id);
  const { supabase } = await actionContext(back, "schedule.manage");
  const to = req(formData, "to", back, "Status") as ScheduleStatus;
  if (!(to in TRANSITIONS)) fail(back, "Status tidak valid.");

  const period = await loadPeriod(supabase, id, back);
  if (!TRANSITIONS[period.status].includes(to)) fail(back, "Perubahan status tidak diizinkan.");

  const { data, error } = await supabase
    .from("schedule_periods")
    .update({ status: to })
    .eq("id", id)
    .eq("status", period.status)
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data || data.length === 0) fail(back, "Status periode sudah berubah, muat ulang halaman.");

  revalidate(id);
  done(back, STATUS_MSG[to]);
}

export async function deletePeriod(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail("/kelola", "Periode tidak valid.");
  const back = backPath(formData, id);
  const { supabase } = await actionContext(back, "schedule.manage");
  const period = await loadPeriod(supabase, id, back);
  if (period.status !== "draft") fail(back, "Hanya periode berstatus draft yang dapat dihapus.");

  const { data, error } = await supabase.from("schedule_periods").delete().eq("id", id).eq("status", "draft").select("id");
  if (error) fail(back, dbError(error));
  if (!data || data.length === 0) fail(back, "Periode gagal dihapus.");

  revalidatePath("/kelola");
  revalidatePath("/kalender");
  done("/kelola", `Periode "${period.name}" dihapus.`);
}
