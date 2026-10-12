"use client";

import type { ChangeEvent, ReactNode } from "react";

/**
 * Membungkus grid editor: saat <select data-shift-cell> berubah, warnai latarnya sesuai warna shift.
 * Satu listener (event delegation) untuk ratusan sel, bukan satu komponen client per sel.
 */
export function ShiftGridColors({
  colors,
  children,
}: {
  colors: Record<string, { bg: string; fg: string }>;
  children: ReactNode;
}) {
  function onChange(e: ChangeEvent<HTMLDivElement>) {
    const el = e.target as unknown as HTMLSelectElement;
    if (el.tagName !== "SELECT" || !el.hasAttribute("data-shift-cell")) return;
    const c = colors[el.value];
    el.style.backgroundColor = c?.bg ?? "";
    el.style.color = c?.fg ?? "";
    el.dataset.dirty = el.value !== (el.dataset.initial ?? "") ? "1" : "";
  }
  return <div onChange={onChange}>{children}</div>;
}
