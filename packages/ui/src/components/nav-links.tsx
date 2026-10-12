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
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:top-20 md:mx-0 md:flex-col md:overflow-visible md:px-0">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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
