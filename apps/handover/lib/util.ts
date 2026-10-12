/** Nilai <input type="datetime-local"> (WIB) → ISO dengan offset +07:00. */
export function wibToIso(value: string | null): string | null {
  if (!value) return null;
  const v = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return null;
  return `${v}+07:00`;
}

/** "2026-10-12" + n hari → "2026-10-13" (tanpa terpengaruh zona waktu). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isDate(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Path internal yang aman untuk redirect (dari hidden input "back"). */
export function safeBack(v: string | null, fallback: string): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

export function isUuid(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

type ShiftWindow = { id: string; start_time: string | null; end_time: string | null };

/**
 * Tebakan awal form handover: shift yang sedang berjalan (WIB) → shift berikutnya.
 * Shift lintas hari (mis. Malam 23:00–07:00) setelah tengah malam memakai tanggal kemarin.
 */
export function guessHandoverShift(working: ShiftWindow[], now: Date = new Date()) {
  const wib = now.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }); // "2026-10-12 14:05:00"
  const today = wib.slice(0, 10);
  const time = wib.slice(11, 16);
  for (let i = 0; i < working.length; i++) {
    const s = working[i];
    const start = s.start_time?.slice(0, 5);
    const end = s.end_time?.slice(0, 5);
    if (!start || !end) continue;
    const overnight = end <= start;
    const inShift = overnight ? time >= start || time < end : time >= start && time < end;
    if (!inShift) continue;
    return {
      date: overnight && time < end ? addDays(today, -1) : today,
      fromId: s.id,
      toId: working.length > 1 ? working[(i + 1) % working.length].id : "",
    };
  }
  return { date: today, fromId: "", toId: "" };
}
