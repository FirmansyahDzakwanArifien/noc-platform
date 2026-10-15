import { AppShell, type NavItem } from "@noc/ui/app-shell";
import { Forbidden } from "@noc/ui";
import { requireAuth } from "@noc/supabase/auth";
import { FileText, FolderKanban, ListChecks, Star } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const nav: NavItem[] = [
    { href: "/", label: "Project", icon: <FolderKanban />, exact: true },
    { href: "/tugas-saya", label: "Tugas Saya", icon: <ListChecks /> },
    { href: "/laporan", label: "Laporan", icon: <FileText /> },
    { href: "/review", label: "Penilaian", icon: <Star /> },
  ];

  let content: React.ReactNode = children;
  if (auth.profile && !auth.profile.is_active) {
    content = (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Akun Anda dinonaktifkan. Hubungi admin untuk mengaktifkan kembali.
      </div>
    );
  } else if (!auth.can("project.view")) {
    content = <Forbidden message="Anda belum memiliki akses ke aplikasi Perkembangan." />;
  }

  return (
    <AppShell
      app="perkembangan"
      nav={nav}
      permissions={auth.permissions}
      user={{ name: auth.profile?.full_name ?? auth.email, email: auth.email, roles: auth.roles }}
    >
      {content}
    </AppShell>
  );
}
