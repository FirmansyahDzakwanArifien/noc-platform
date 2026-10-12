"use client";

import { useEffect, useState } from "react";

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Jam WIB yang berjalan. Render kosong di server agar tidak terjadi hydration mismatch. */
export function LiveClock({ className, showDate = false }: { className?: string; showDate?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      <span className="tabular-nums">{now ? timeFmt.format(now).replace(/\./g, ":") : "--:--:--"}</span>
      <span className="ml-1 opacity-70">WIB</span>
      {showDate && <span className="block text-xs font-normal opacity-70">{now ? dateFmt.format(now) : " "}</span>}
    </span>
  );
}
