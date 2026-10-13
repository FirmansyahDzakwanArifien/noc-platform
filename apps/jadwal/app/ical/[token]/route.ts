import { createClient } from "@noc/supabase/server";
import { addDays } from "@/lib/dates";
import { UUID_RE } from "@/lib/shift";

export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  work_date: string;
  is_leader: boolean;
  note: string | null;
  code: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  is_working: boolean;
  site: string | null;
  updated_at: string;
};

/** "2026-10-13" + "07:00:00" (WIB) → "20261013T000000Z" (UTC). WIB = UTC+7, tanpa DST. */
function utcStamp(date: string, time: string, plusDays = 0) {
  const d = new Date(`${addDays(date, plusDays)}T${time.slice(0, 8)}+07:00`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Pecah baris > 75 karakter sesuai RFC 5545. */
function fold(line: string) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) parts.push(" " + line.slice(i, i + 73));
  return parts.join("\r\n");
}

/**
 * GET /ical/<token> — feed kalender pribadi (iCalendar) untuk Google Calendar / Apple / Outlook.
 * Token rahasia per user, dibuat dari halaman "Jadwal Saya". Hanya jadwal yang sudah dipublikasikan.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!UUID_RE.test(token)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_calendar_feed", { p_token: token });
  const feed = data as { full_name: string; rows: FeedRow[] } | null;
  if (!feed) return new Response("Link kalender tidak berlaku", { status: 404 });

  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jarvis NOC//Jadwal//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Jadwal NOC — ${feed.full_name}`)}`,
    "X-WR-TIMEZONE:Asia/Jakarta",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const r of feed.rows) {
    const summary = `${r.name} (${r.code})${r.is_leader ? " · Leader" : ""}`;
    const desc = [r.is_leader ? "Anda leader shift ini." : null, r.note].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${r.id}@noc-jadwal`, `DTSTAMP:${now}`, `LAST-MODIFIED:${stamp(new Date(r.updated_at))}`);
    if (r.is_working && r.start_time && r.end_time) {
      const overnight = r.end_time <= r.start_time;
      lines.push(`DTSTART:${utcStamp(r.work_date, r.start_time)}`, `DTEND:${utcStamp(r.work_date, r.end_time, overnight ? 1 : 0)}`);
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Shift ${r.name} mulai 1 jam lagi`)}`, "TRIGGER:-PT1H", "END:VALARM");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${r.work_date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(r.work_date, 1).replace(/-/g, "")}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`SUMMARY:${esc(summary)}`);
    if (r.site) lines.push(`LOCATION:${esc(r.site)}`);
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="jadwal-noc.ics"',
      "cache-control": "private, max-age=900",
      "x-robots-tag": "noindex",
    },
  });
}
