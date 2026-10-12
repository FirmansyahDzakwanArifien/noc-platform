import { AppShell, type NavItem } from "@noc/ui/app-shell";
import { requireAuth } from "@noc/supabase/auth";
import { CalendarDays, ClipboardCheck, DoorOpen, FilePlus, FileText } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const nav: NavItem[] = [{ href: "/", label: "Izin Kerja", icon: <FileText />, exact: true }];
  if (auth.can("permit.create")) nav.push({ href: "/baru", label: "Ajukan Izin", icon: <FilePlus /> });
  if (auth.can("permit.approve")) nav.push({ href: "/approval", label: "Persetujuan Saya", icon: <ClipboardCheck /> });
  if (auth.can("permit.checkin")) nav.push({ href: "/kunjungan", label: "Kunjungan", icon: <DoorOpen /> });
  if (auth.can("leave.request") || auth.can("leave.approve")) {
    nav.push({ href: "/cuti", label: "Cuti & Tukar Shift", icon: <CalendarDays /> });
  }

  return (
    <AppShell
      app="perizinan"
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
