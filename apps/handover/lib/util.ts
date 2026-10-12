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
