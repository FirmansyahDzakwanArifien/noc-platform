import { Fragment } from "react";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Role } from "@noc/supabase/types";
import { Card, Flash, Forbidden, PageHeader, Table, TBody, TD, TH, THead, TR } from "@noc/ui";
import { Check, Minus } from "lucide-react";
import { togglePermission } from "./actions";

export const metadata = { title: "Role & Akses" };

type Permission = { key: string; module: string; description: string };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const auth = await requireAuth();
  if (!auth.can("user.manage") && !auth.can("role.manage")) return <Forbidden />;
  const canEdit = auth.can("role.manage");
  const supabase = await createClient();

  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    supabase.from("roles").select("*").order("rank", { ascending: false }),
    supabase.from("permissions").select("*").order("module").order("key"),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);
  const roleList = (roles ?? []) as Role[];
  const granted = new Set(((rp ?? []) as { role_id: string; permission_key: string }[]).map((x) => `${x.role_id}:${x.permission_key}`));
  const byModule = new Map<string, Permission[]>();
  for (const p of (perms ?? []) as Permission[]) {
    byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);
  }

  return (
    <div>
      <PageHeader
        title="Role & Akses"
        description={
          canEdit
            ? "Klik sel untuk memberi/mencabut permission. Perubahan langsung berlaku untuk semua user dengan role tersebut."
            : "Matriks permission per role (hanya admin yang dapat mengubah)."
        }
      />
      <Flash searchParams={await searchParams} />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {roleList.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200/70 bg-white px-3 py-2">
            <p className="text-sm font-medium text-slate-900">
              {r.name} <span className="text-xs font-normal text-slate-400">rank {r.rank}</span>
            </p>
            <p className="text-xs text-slate-500">{r.description}</p>
          </div>
        ))}
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH className="sticky left-0 bg-slate-50">Permission</TH>
              {roleList.map((r) => (
                <TH key={r.id} className="text-center">
                  {r.key}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {[...byModule.entries()].map(([module, list]) => (
              <Fragment key={module}>
                <TR className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TD colSpan={roleList.length + 1} className="py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {module}
                  </TD>
                </TR>
                {list.map((p) => (
                  <TR key={p.key}>
                    <TD className="sticky left-0 min-w-56 bg-white">
                      <p className="font-mono text-xs font-medium text-slate-900">{p.key}</p>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </TD>
                    {roleList.map((r) => {
                      const on = granted.has(`${r.id}:${p.key}`);
                      const icon = on ? (
                        <Check className="size-4 text-emerald-600" aria-label="Ya" />
                      ) : (
                        <Minus className="size-4 text-slate-300" aria-label="Tidak" />
                      );
                      return (
                        <TD key={r.id} className="text-center">
                          {canEdit ? (
                            <form action={togglePermission} className="inline">
                              <input type="hidden" name="role_id" value={r.id} />
                              <input type="hidden" name="permission_key" value={p.key} />
                              <input type="hidden" name="on" value={on ? "1" : "0"} />
                              <button
                                type="submit"
                                className="grid size-8 place-items-center rounded-md hover:bg-slate-100"
                                title={`${on ? "Cabut" : "Beri"} ${p.key} untuk ${r.name}`}
                              >
                                {icon}
                              </button>
                            </form>
                          ) : (
                            <span className="inline-grid size-8 place-items-center">{icon}</span>
                          )}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </Fragment>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
