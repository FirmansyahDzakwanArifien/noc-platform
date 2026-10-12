"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { cn } from "../cn";
import { Logo } from "./logo";
import type { NavItem } from "./nav-links";

export type DrawerApp = { key: string; name: string; description: string; url: string; icon: ReactNode };

/** Menu laci untuk layar < md: daftar aplikasi, navigasi halaman, dan akun. */
export function MobileNav({
  apps,
  currentApp,
  nav,
  user,
  profileUrl,
}: {
  apps: DrawerApp[];
  currentApp: string;
  nav: NavItem[];
  user: { name: string; email: string; initials: string };
  profileUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1.5 grid size-9 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
        aria-label="Buka menu"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      <div className={cn("fixed inset-0 z-50 md:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[85%] max-w-80 flex-col bg-white shadow-2xl transition-transform duration-300",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
        >
          <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
            <Logo subtitle={false} className="[&_svg]:size-8" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Tutup menu"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {nav.length > 0 && (
              <>
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu</p>
                <nav className="space-y-0.5">
                  {nav.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                          active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        {item.icon && <span className="[&>svg]:size-4.5">{item.icon}</span>}
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </>
            )}

            <p className="px-2 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Aplikasi</p>
            <div className="space-y-0.5">
              {apps.map((a) => (
                <a
                  key={a.key}
                  href={a.url}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                    a.key === currentApp ? "bg-slate-100" : "hover:bg-slate-50",
                  )}
                >
                  <span className="text-slate-500 [&>svg]:size-4.5">{a.icon}</span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", a.key === currentApp ? "text-brand-700" : "text-slate-800")}>
                      {a.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{a.description}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-xs font-semibold text-white">
                {user.initials || "?"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <a
                href={profileUrl}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <UserRound className="size-4" aria-hidden /> Profil
              </a>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="size-4" aria-hidden /> Keluar
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
