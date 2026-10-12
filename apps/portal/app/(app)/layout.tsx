import { AppShell, type NavItem } from "@noc/ui/app-shell";
import { requireAuth } from "@noc/supabase/auth";
import { Bell, ClipboardList, Database, History, LayoutDashboard, Megaphone, ShieldCheck, Users } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const nav: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: "/pengumuman", label: "Pengumuman", icon: <Megaphone /> },
    { href: "/notifikasi", label: "Notifikasi", icon: <Bell /> },
  ];
  if (auth.can("user.manage")) {
    nav.push({ href: "/admin/users", label: "User", icon: <Users /> });
    nav.push({ href: "/admin/allowlist", label: "Allowlist Email", icon: <ClipboardList /> });
  }
  if (auth.can("user.manage") || auth.can("role.manage")) {
    nav.push({ href: "/admin/roles", label: "Role & Akses", icon: <ShieldCheck /> });
  }
  if (auth.can("master.manage")) nav.push({ href: "/admin/master", label: "Master Data", icon: <Database /> });
  if (auth.can("audit.view")) nav.push({ href: "/admin/audit", label: "Audit Log", icon: <History /> });

  return (
    <AppShell
      app="portal"
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
