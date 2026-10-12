const TZ = "Asia/Jakarta";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" && value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "07:00:00" → "07:00" */
export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "-";
}

/** Nilai untuk <input type="date"> dalam zona WIB. */
export function toDateInput(value: Date = new Date()): string {
  return value.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Nilai untuk <input type="datetime-local"> dalam zona WIB. */
export function toDateTimeInput(value: Date = new Date()): string {
  const s = value.toLocaleString("sv-SE", { timeZone: TZ });
  return s.slice(0, 16).replace(" ", "T");
}
