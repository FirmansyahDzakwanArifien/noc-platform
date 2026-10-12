export type AppKey = "portal" | "jadwal" | "handover" | "perizinan" | "perkembangan";

export type AppInfo = {
  key: AppKey;
  name: string;
  description: string;
  url: string;
  /** Permission minimal agar app muncul di launcher ("" = semua user login). */
  permission: string;
};

export const APPS: AppInfo[] = [
  {
    key: "portal",
    name: "Portal",
    description: "Dashboard, pengumuman, user & master data",
    url: process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000",
    permission: "",
  },
  {
    key: "jadwal",
    name: "Jadwal",
    description: "Roster shift, kalender tim, tukar shift",
    url: process.env.NEXT_PUBLIC_JADWAL_URL ?? "http://localhost:3001",
    permission: "schedule.view",
  },
  {
    key: "handover",
    name: "Handover",
    description: "Serah terima shift & checklist rutin",
    url: process.env.NEXT_PUBLIC_HANDOVER_URL ?? "http://localhost:3002",
    permission: "handover.view",
  },
  {
    key: "perizinan",
    name: "Perizinan",
    description: "Izin kerja/akses site, cuti & tukar shift",
    url: process.env.NEXT_PUBLIC_PERIZINAN_URL ?? "http://localhost:3003",
    permission: "",
  },
  {
    key: "perkembangan",
    name: "Perkembangan",
    description: "Project, task & laporan progress",
    url: process.env.NEXT_PUBLIC_PERKEMBANGAN_URL ?? "http://localhost:3004",
    permission: "project.view",
  },
];

export function appUrl(key: AppKey): string {
  return APPS.find((a) => a.key === key)!.url;
}

/** Hanya izinkan redirect `next` ke salah satu app kita (cegah open redirect). */
export function safeNextUrl(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  try {
    const target = new URL(next);
    const ok = APPS.some((a) => new URL(a.url).origin === target.origin);
    return ok ? target.toString() : fallback;
  } catch {
    return fallback;
  }
}
