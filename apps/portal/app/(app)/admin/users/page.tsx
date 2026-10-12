import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Profile, Role, Team } from "@noc/supabase/types";
import { Badge, Card, Flash, Forbidden, Input, PageHeader, Select, SubmitButton, Table, TBody, TD, TH, THead, TR, buttonClass } from "@noc/ui";
import { X } from "lucide-react";
import { addRole, removeRole, updateUser } from "./actions";

export const metadata = { title: "User" };

type UserRow = Profile & { user_roles: { role_id: string; roles: Pick<Role, "key" | "name" | "rank"> | null }[] };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; success?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.can("user.manage")) return <Forbidden />;
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("*, user_roles!user_roles_user_id_fkey(role_id, roles(key, name, rank))")
    .order("full_name");
  if (sp.q) query = query.or(`full_name.ilike.%${sp.q.replace(/[%,()]/g, "")}%,email.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);

  const [{ data: users }, { data: roles }, { data: teams }, { data: myRank }] = await Promise.all([
    query,
    supabase.from("roles").select("*").order("rank", { ascending: false }),
    supabase.from("teams").select("*").order("name"),
    supabase.rpc("my_max_rank"),
  ]);
  const assignable = ((roles ?? []) as Role[]).filter((r) => r.rank <= ((myRank as number | null) ?? 0));
  const teamList = (teams ?? []) as Team[];
  const rows = (users ?? []) as UserRow[];
  const back = sp.q ? `/admin/users?q=${encodeURIComponent(sp.q)}` : "/admin/users";

  return (
    <div>
      <PageHeader title="User" description={`${rows.length} user terdaftar`} />
      <Flash searchParams={sp} />

      <form className="mb-4 flex gap-2" action="/admin/users">
        <Input name="q" defaultValue={sp.q} placeholder="Cari nama atau email…" className="max-w-xs" />
        <button className={buttonClass("secondary")}>Cari</button>
      </form>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Role</TH>
              <TH>Tim & status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((u) => {
              const owned = new Set(u.user_roles.map((r) => r.role_id));
              const addable = assignable.filter((r) => !owned.has(r.id));
              const isMe = u.id === auth.userId;
              return (
                <TR key={u.id}>
                  <TD className="min-w-48">
                    <p className="font-medium text-slate-900">
                      {u.full_name} {isMe && <Badge tone="blue">Anda</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                    {u.employee_no && <p className="text-xs text-slate-400">NIK {u.employee_no}</p>}
                  </TD>
                  <TD className="min-w-64">
                    <div className="flex flex-wrap gap-1.5">
                      {u.user_roles.map((r) => (
                        <form key={r.role_id} action={removeRole} className="inline-flex">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="role_id" value={r.role_id} />
                          <input type="hidden" name="back" value={back} />
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-700">
                            {r.roles?.name ?? r.role_id}
                            <button
                              type="submit"
                              className="rounded-full p-0.5 hover:bg-slate-200"
                              title="Cabut role"
                              aria-label={`Cabut role ${r.roles?.name}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        </form>
                      ))}
                      {u.user_roles.length === 0 && <span className="text-xs text-slate-400">Belum ada role</span>}
                    </div>
                    {addable.length > 0 && (
                      <form action={addRole} className="mt-2 flex gap-1.5">
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="back" value={back} />
                        <Select name="role_id" className="h-8 max-w-40 text-xs" required defaultValue="">
                          <option value="" disabled>
                            + Tambah role
                          </option>
                          {addable.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton size="sm" variant="secondary" pendingText="…">
                          Tambah
                        </SubmitButton>
                      </form>
                    )}
                  </TD>
                  <TD className="min-w-56">
                    <form action={updateUser} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="back" value={back} />
                      <Select name="team_id" defaultValue={u.team_id ?? ""} className="h-8 max-w-40 text-xs">
                        <option value="">Tanpa tim</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" name="is_active" defaultChecked={u.is_active} disabled={isMe} />
                        Aktif
                      </label>
                      {isMe && <input type="hidden" name="is_active" value="on" />}
                      <SubmitButton size="sm" variant="secondary" pendingText="…">
                        Simpan
                      </SubmitButton>
                    </form>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
