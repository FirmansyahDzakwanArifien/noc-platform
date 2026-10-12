import { AppShell, type NavItem } from "@noc/ui/app-shell";
import { requireAuth } from "@noc/supabase/auth";
import { CalendarCheck, CalendarDays, CalendarRange, Share2 } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const nav: NavItem[] = [
    { href: "/", label: "Jadwal Saya", icon: <CalendarDays />, exact: true },
    { href: "/kalender", label: "Kalender Tim", icon: <CalendarRange /> },
  ];
  if (auth.can("schedule.manage")) {
    nav.push({ href: "/kelola", label: "Kelola Jadwal", icon: <CalendarCheck /> });
    nav.push({ href: "/bagikan", label: "Bagikan Jadwal", icon: <Share2 /> });
  }

  return (
    <AppShell
      app="jadwal"
      nav={nav}
      permissions={auth.permissions}
      user={{ name: auth.profile?.full_name ?? auth.email, email: auth.email, roles: auth.roles }}
    >
      {auth.profile && !auth.profile.is_active ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Akun Anda dinonaktifkan. Hubungi admin untuk mengaktifkan kembali.
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
