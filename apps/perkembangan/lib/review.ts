import { todayWIB } from "./data";

/** Bulan dalam format YYYY-MM. */
export type Ym = string;

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function currentYm(): Ym {
  return todayWIB().slice(0, 7);
}

export function isYm(v: string | null | undefined): v is Ym {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftYm(ym: Ym, delta: number): Ym {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Tanggal pertama bulan (dipakai sebagai period_month di database). */
export function ymToDate(ym: Ym): string {
  return `${ym}-01`;
}

export function ymLabel(ym: Ym): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}

/** Review bisa diisi untuk bulan ini & bulan lalu (sama dengan aturan di database). */
export function isYmOpen(ym: Ym): boolean {
  const cur = currentYm();
  return ym === cur || ym === shiftYm(cur, -1);
}

export type Criterion = { key: string; name: string; description: string | null };

export const SCORE_LABEL: Record<number, string> = {
  1: "Perlu banyak perbaikan",
  2: "Di bawah harapan",
  3: "Sesuai harapan",
  4: "Di atas harapan",
  5: "Istimewa",
};

export function scoreTone(v: number | null | undefined): string {
  if (v == null) return "text-slate-400";
  if (v >= 4) return "text-emerald-600";
  if (v >= 3) return "text-sky-600";
  if (v >= 2) return "text-amber-600";
  return "text-red-600";
}
