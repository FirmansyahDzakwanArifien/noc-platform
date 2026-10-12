import type { CSSProperties } from "react";

export const DEFAULT_SHIFT_COLOR = "#94a3b8";

/** Warna teks (gelap/terang) yang kontras dengan latar `hex`. */
export function textOn(hex: string | null | undefined): string {
  const h = (hex ?? DEFAULT_SHIFT_COLOR).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#0f172a";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0f172a" : "#ffffff";
}

/** Style chip shift: latar = warna shift, teks kontras. */
export function shiftStyle(color: string | null | undefined): CSSProperties {
  const bg = color || DEFAULT_SHIFT_COLOR;
  return { backgroundColor: bg, color: textOn(bg) };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
