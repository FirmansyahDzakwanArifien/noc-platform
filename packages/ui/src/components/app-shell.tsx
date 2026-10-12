import type { ReactNode } from "react";
import { APPS, type AppKey } from "@noc/supabase/apps";
import { ChevronDown, LayoutGrid, LogOut } from "lucide-react";
import { cn } from "../cn";
import { NavLinks, type NavItem } from "./nav-links";

export type { NavItem };

export type ShellUser = {
  name: string;
  email: string;
  roles: string[];
};

/**
 * Layout standar semua app: header (logo, app switcher, user menu) + sidebar navigasi.
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

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <a href={APPS[0].url} className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">NOC</span>
          </a>

          {/* App switcher */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              {current.name}
              <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute left-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <p className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                <LayoutGrid className="size-3.5" aria-hidden /> Aplikasi
              </p>
              {visibleApps.map((a) => (
                <a
                  key={a.key}
                  href={a.url}
                  className={cn(
                    "block rounded-lg px-2 py-2 hover:bg-slate-50",
                    a.key === app && "bg-brand-50 hover:bg-brand-50",
                  )}
                >
                  <span className={cn("block text-sm font-medium", a.key === app ? "text-brand-700" : "text-slate-900")}>
                    {a.name}
                  </span>
                  <span className="block text-xs text-slate-500">{a.description}</span>
                </a>
              ))}
            </div>
          </details>

          <div className="ml-auto" />

          {/* User menu */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                {initials || "?"}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 sm:block">{user.name}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
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
              <a href={`${APPS[0].url}/profil`} className="block rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Profil saya
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

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row">
        {nav.length > 0 && (
          <aside className="md:w-52 md:shrink-0">
            <NavLinks items={nav} />
          </aside>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
