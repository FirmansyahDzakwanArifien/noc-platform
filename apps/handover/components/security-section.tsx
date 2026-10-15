"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menampilkan bagian "Detail keamanan" hanya bila Kategori = keamanan atau divisi yang dipilih = SOC.
 * Membaca nilai field `category` & `division_id` di form induknya. Isinya tetap ter-render (hanya
 * disembunyikan) agar nilai yang sudah diketik tidak hilang saat kategori diganti.
 */
export function SecuritySection({
  socDivisionIds,
  initialOpen,
  className,
  children,
}: {
  socDivisionIds: string[];
  initialOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const socKey = socDivisionIds.join(",");

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const soc = socKey ? socKey.split(",") : [];
    const read = (name: string) => {
      const el = form.elements.namedItem(name);
      return el instanceof HTMLSelectElement || el instanceof HTMLInputElement ? el.value : "";
    };
    const sync = () => setOpen(read("category") === "keamanan" || soc.includes(read("division_id")));
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, [socKey]);

  return (
    <div ref={ref} hidden={!open} className={className}>
      {children}
    </div>
  );
}
