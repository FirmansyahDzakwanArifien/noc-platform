import { AppShell, type NavItem } from "@noc/ui/app-shell";
import { requireAuth } from "@noc/supabase/auth";
import { AlertTriangle, ArrowLeftRight, ClipboardCheck, ListTodo, PlusCircle } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const nav: NavItem[] = [{ href: "/", label: "Handover", icon: <ArrowLeftRight />, exact: true }];
  if (auth.can("handover.create")) nav.push({ href: "/baru", label: "Buat Handover", icon: <PlusCircle /> });
  nav.push({ href: "/item-terbuka", label: "Item Terbuka", icon: <ListTodo /> });
  if (auth.can("incident.view")) nav.push({ href: "/incident", label: "Incident", icon: <AlertTriangle /> });
  if (auth.can("master.manage")) nav.push({ href: "/checklist", label: "Template Checklist", icon: <ClipboardCheck /> });

  return (
    <AppShell
      app="handover"
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
