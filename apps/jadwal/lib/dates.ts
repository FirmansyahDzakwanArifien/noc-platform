// Utilitas tanggal berbasis string "YYYY-MM-DD".
// Semua aritmetika memakai Date UTC pada tanggal saja → bebas bug zona waktu.
import { toDateInput } from "@noc/ui";

export const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
/** Header kalender bulanan, dimulai Senin. */
export const WEEK_HEADER = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

function parse(d: string): Date {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** Tanggal hari ini (WIB). */
export function todayWib(): string {
  return toDateInput();
}

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  return fmt(parse(s)) === s;
}

export function isValidMonth(s: string | null | undefined): s is string {
  return !!s && MONTH_RE.test(s);
}

export function addDays(d: string, n: number): string {
  return fmt(new Date(parse(d).getTime() + n * DAY_MS));
}

/** Selisih hari b - a. */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
}

/** Semua tanggal dari start s/d end (inklusif). Dibatasi `max` hari sebagai pengaman. */
export function dateRange(start: string, end: string, max = 400): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length < max) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 0 = Minggu … 6 = Sabtu */
export function dayOfWeek(d: string): number {
  return parse(d).getUTCDay();
}

export function isWeekend(d: string): boolean {
  const w = dayOfWeek(d);
  return w === 0 || w === 6;
}

export function dayLabel(d: string): string {
  return DAY_SHORT[dayOfWeek(d)];
}

export function dayNumber(d: string): number {
  return Number(d.slice(8, 10));
}

/** "2026-10-05" → "Sen, 5 Okt" */
export function shortDate(d: string): string {
  return `${dayLabel(d)}, ${dayNumber(d)} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;
}

// ---------- bulan "YYYY-MM" ----------

export function monthOf(d: string): string {
  return d.slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

export function monthStart(ym: string): string {
  return `${ym}-01`;
}

export function monthEnd(ym: string): string {
  return addDays(monthStart(addMonths(ym, 1)), -1);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Label rentang periode singkat: "1 Nov – 30 Nov 2026". */
export function rangeLabel(start: string, end: string): string {
  const s = `${dayNumber(start)} ${MONTH_NAMES[Number(start.slice(5, 7)) - 1].slice(0, 3)}`;
  const e = `${dayNumber(end)} ${MONTH_NAMES[Number(end.slice(5, 7)) - 1].slice(0, 3)} ${end.slice(0, 4)}`;
  return start.slice(0, 4) === end.slice(0, 4) ? `${s} – ${e}` : `${s} ${start.slice(0, 4)} – ${e}`;
}
