import type { ReactNode } from "react";
import { APPS, type AppKey } from "@noc/supabase/apps";
import { ArrowLeftRight, CalendarDays, ChevronDown, FileCheck2, LayoutDashboard, LayoutGrid, LogOut, TrendingUp, UserRound } from "lucide-react";
import { cn } from "../cn";
import { Logo, LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks, type NavItem } from "./nav-links";

export type { NavItem };

export type ShellUser = {
  name: string;
  email: string;
  roles: string[];
};

const APP_ICONS: Record<AppKey, ReactNode> = {
  portal: <LayoutDashboard />,
  jadwal: <CalendarDays />,
  handover: <ArrowLeftRight />,
  perizinan: <FileCheck2 />,
  perkembangan: <TrendingUp />,
};

/**
 * Layout standar semua app: header (logo, app switcher, user menu) + sidebar navigasi.
 * Di layar < md, navigasi & app switcher pindah ke menu laci (MobileNav).
 * Dipakai dari app/(app)/layout.tsx tiap app.
 */
export function AppShell({
  app,
  nav,
  user,
  permissions,
  children,
}: {
  app: AppKey;
  nav: NavItem[];
  user: ShellUser;
  permissions: string[];
  children: ReactNode;
}) {
  const current = APPS.find((a) => a.key === app)!;
  const visibleApps = APPS.filter((a) => !a.permission || permissions.includes(a.permission));
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const profileUrl = `${APPS[0].url}/profil`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <MobileNav
            apps={visibleApps.map((a) => ({ key: a.key, name: a.name, description: a.description, url: a.url, icon: APP_ICONS[a.key] }))}
            currentApp={app}
            nav={nav}
            user={{ name: user.name, email: user.email, initials }}
            profileUrl={profileUrl}
          />

          <a href={APPS[0].url} className="flex shrink-0 items-center gap-2 pr-1" aria-label="Jarvis NOC">
            <LogoMark className="size-8 lg:hidden" />
            <Logo subtitle={false} className="hidden lg:inline-flex [&_svg]:size-8" />
          </a>
          <span className="hidden h-6 w-px bg-slate-200 sm:block" />

          {/* Nama app (mobile) */}
          <span className="truncate text-sm font-semibold text-slate-900 md:hidden">{current.name}</span>

          {/* App switcher (≥ md) */}
          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              {current.name}
              <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <p className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                <LayoutGrid className="size-3.5" aria-hidden /> Aplikasi
              </p>
              {visibleApps.map((a) => (
                <a
                  key={a.key}
                  href={a.url}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50",
                    a.key === app && "bg-brand-50 hover:bg-brand-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg [&>svg]:size-4",
                      a.key === app ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {APP_ICONS[a.key]}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", a.key === app ? "text-brand-700" : "text-slate-900")}>
                      {a.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{a.description}</span>
                  </span>
                </a>
              ))}
            </div>
          </details>

          <div className="ml-auto" />

          {/* User menu (≥ md) */}
          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-xs font-semibold text-white shadow-sm">
                {initials || "?"}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 lg:block">{user.name}</span>
              <ChevronDown className="hidden size-4 text-slate-400 lg:block" aria-hidden />
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
                {user.roles.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {r}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <a href={profileUrl} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <UserRound className="size-4" aria-hidden /> Profil saya
              </a>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="size-4" aria-hidden /> Keluar
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:gap-8">
        {nav.length > 0 && (
          <aside className="hidden w-48 shrink-0 md:block lg:w-52">
            <NavLinks items={nav} />
          </aside>
        )}
        <main className="min-w-0 flex-1 pb-[env(safe-area-inset-bottom)]">{children}</main>
      </div>
    </div>
  );
}
