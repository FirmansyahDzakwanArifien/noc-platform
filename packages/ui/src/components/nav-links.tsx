"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn";

export type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** true = aktif hanya jika path sama persis (untuk "/"). */
  exact?: boolean;
};

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-20 flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white text-brand-700 shadow-soft ring-1 ring-slate-200/70" : "text-slate-500 hover:bg-white/70 hover:text-slate-900",
            )}
          >
            {item.icon && <span className="[&>svg]:size-4">{item.icon}</span>}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
