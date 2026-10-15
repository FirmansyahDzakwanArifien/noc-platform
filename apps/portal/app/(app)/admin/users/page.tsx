import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Profile, Role, Team } from "@noc/supabase/types";
import { Badge, buttonClass, Card, cn, EmptyState, Flash, Forbidden, Input, PageHeader, Select, SubmitButton } from "@noc/ui";
import { ChevronDown, MailPlus, Search, Send, X } from "lucide-react";
import { addRole, removeRole, resendInvite, updateUser } from "./actions";

export const metadata = { title: "User" };

type UserRow = Profile & { user_roles: { role_id: string; roles: Pick<Role, "key" | "name" | "rank"> | null }[] };
type AuthStatus = { user_id: string; invited_at: string | null; confirmed_at: string | null; last_sign_in_at: string | null };
type Status = "aktif" | "menunggu" | "nonaktif";
type SP = Promise<{ q?: string; status?: string; tim?: string; error?: string; success?: string }>;

const STATUS_LABEL: Record<Status, string> = { aktif: "Aktif", menunggu: "Menunggu undangan", nonaktif: "Nonaktif" };
const STATUS_STYLE: Record<Status, string> = {
  aktif: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  menunggu: "bg-amber-50 text-amber-700 ring-amber-600/20",
  nonaktif: "bg-slate-100 text-slate-500 ring-slate-500/15",
};
const AVATAR_COLORS = ["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-teal-100 text-teal-700"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function relative(iso: string | null): string {
  if (!iso) return "belum pernah";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth();
  if (!auth.can("user.manage")) return <Forbidden />;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: users }, { data: roles }, { data: teams }, { data: myRank }, { data: statusData }] = await Promise.all([
    supabase.from("profiles").select("*, user_roles!user_roles_user_id_fkey(role_id, roles(key, name, rank))").order("full_name"),
    supabase.from("roles").select("*").order("rank", { ascending: false }),
    supabase.from("teams").select("*").order("name"),
    supabase.rpc("my_max_rank"),
    supabase.rpc("user_auth_status"),
  ]);
  const assignable = ((roles ?? []) as Role[]).filter((r) => r.rank <= ((myRank as number | null) ?? 0));
  const teamList = (teams ?? []) as Team[];
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));
  const authById = new Map(((statusData as AuthStatus[] | null) ?? []).map((s) => [s.user_id, s]));

  const all = ((users ?? []) as UserRow[]).map((u) => {
    const a = authById.get(u.id);
    const status: Status = !u.is_active ? "nonaktif" : a && !a.last_sign_in_at && a.invited_at ? "menunggu" : "aktif";
    return { ...u, status, lastSignIn: a?.last_sign_in_at ?? null, invitedAt: a?.invited_at ?? null };
  });
  const counts = { semua: all.length, aktif: 0, menunggu: 0, nonaktif: 0 } as Record<"semua" | Status, number>;
  for (const u of all) counts[u.status]++;

  const statusFilter = (["aktif", "menunggu", "nonaktif"] as const).find((s) => s === sp.status);
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = all.filter(
    (u) =>
      (!statusFilter || u.status === statusFilter) &&
      (!sp.tim || (sp.tim === "none" ? !u.team_id : u.team_id === sp.tim)) &&
      (!q || u.full_name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)),
  );

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, status: sp.status, tim: sp.tim, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };
  const back = href({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="User"
        description="Kelola akun, role, dan tim. Anda hanya bisa memberi role setara atau di bawah role Anda."
        actions={
          <Link href="/admin/users/undang" className={buttonClass("primary")}>
            <MailPlus className="size-4" aria-hidden /> Undang user
          </Link>
        }
      />
      <Flash searchParams={sp} />

      {/* Tab status + pencarian */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1" aria-label="Filter status">
          {(["semua", "aktif", "menunggu", "nonaktif"] as const).map((s) => {
            const active = (statusFilter ?? "semua") === s;
            return (
              <Link
                key={s}
                href={href({ status: s === "semua" ? undefined : s })}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-white text-slate-900 shadow-soft" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {s === "semua" ? "Semua" : STATUS_LABEL[s].replace(" undangan", "")}
                <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-slate-100 text-slate-600" : "text-slate-400")}>{counts[s]}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/admin/users" className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <div className="relative flex-1 lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input name="q" defaultValue={sp.q} placeholder="Cari nama atau email…" className="pl-9" />
          </div>
          <Select name="tim" defaultValue={sp.tim ?? ""} className="w-36" aria-label="Filter tim">
            <option value="">Semua tim</option>
            <option value="none">Tanpa tim</option>
            {teamList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <button className={buttonClass("secondary")}>Cari</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada user" description="Coba ubah filter atau kata kunci pencarian." />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((u) => {
            const owned = new Set(u.user_roles.map((r) => r.role_id));
            const addable = assignable.filter((r) => !owned.has(r.id));
            const isMe = u.id === auth.userId;
            const sortedRoles = [...u.user_roles].sort((a, b) => (b.roles?.rank ?? 0) - (a.roles?.rank ?? 0));
            return (
              <details key={u.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold", avatarColor(u.id), !u.is_active && "opacity-50")}>
                    {initials(u.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium text-slate-900">
                      <span className="truncate">{u.full_name}</span>
                      {isMe && <Badge tone="blue">Anda</Badge>}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {u.email}
                      {u.team_id && <span className="text-slate-400"> · {teamName.get(u.team_id)}</span>}
                    </p>
                  </div>
                  <div className="hidden min-w-0 flex-wrap justify-end gap-1 md:flex md:max-w-64">
                    {sortedRoles.map((r) => (
                      <span key={r.role_id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {r.roles?.name ?? "?"}
                      </span>
                    ))}
                    {sortedRoles.length === 0 && <span className="text-xs text-slate-400">Tanpa role</span>}
                  </div>
                  <div className="hidden w-32 shrink-0 text-right sm:block">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[u.status])}>
                      {STATUS_LABEL[u.status]}
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {u.status === "menunggu" ? `Diundang ${relative(u.invitedAt)}` : `Masuk ${relative(u.lastSignIn)}`}
                    </p>
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden />
                </summary>

                <div className="grid gap-5 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5 md:grid-cols-2">
                  {/* Status di layar kecil */}
                  <div className="flex items-center gap-2 sm:hidden">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[u.status])}>
                      {STATUS_LABEL[u.status]}
                    </span>
                    <span className="text-xs text-slate-400">Masuk {relative(u.lastSignIn)}</span>
                  </div>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Role</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sortedRoles.map((r) => (
                        <form key={r.role_id} action={removeRole} className="inline-flex">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="role_id" value={r.role_id} />
                          <input type="hidden" name="back" value={back} />
                          <span className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                            {r.roles?.name ?? r.role_id}
                            <button type="submit" className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Cabut role" aria-label={`Cabut role ${r.roles?.name}`}>
                              <X className="size-3" />
                            </button>
                          </span>
                        </form>
                      ))}
                      {sortedRoles.length === 0 && <span className="text-xs text-slate-400">Belum ada role</span>}
                    </div>
                    {addable.length > 0 && (
                      <form action={addRole} className="mt-3 flex gap-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="back" value={back} />
                        <Select name="role_id" className="h-9 max-w-48 text-sm" required defaultValue="" aria-label="Pilih role">
                          <option value="" disabled>
                            Pilih role…
                          </option>
                          {addable.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton size="sm" variant="secondary" pendingText="…">
                          Tambah role
                        </SubmitButton>
                      </form>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tim & status akun</h3>
                    <form action={updateUser} className="mt-2 space-y-3">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="back" value={back} />
                      <Select name="team_id" defaultValue={u.team_id ?? ""} className="h-9 max-w-56 text-sm" aria-label="Tim">
                        <option value="">Tanpa tim</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <label className={cn("flex items-center gap-2 text-sm text-slate-700", isMe && "opacity-60")}>
                        <input type="checkbox" name="is_active" defaultChecked={u.is_active} disabled={isMe} className="size-4 rounded border-slate-300 accent-brand-600" />
                        Akun aktif {isMe && <span className="text-xs text-slate-400">(akun sendiri)</span>}
                      </label>
                      {isMe && <input type="hidden" name="is_active" value="on" />}
                      <SubmitButton size="sm" variant="secondary" pendingText="Menyimpan…">
                        Simpan
                      </SubmitButton>
                    </form>
                  </section>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/70 pt-3 text-xs text-slate-500 md:col-span-2">
                    {u.employee_no && <span>NIK {u.employee_no}</span>}
                    {u.phone && <span>HP {u.phone}</span>}
                    <span>Terakhir masuk: {relative(u.lastSignIn)}</span>
                    {u.status === "menunggu" && (
                      <form action={resendInvite} className="ml-auto">
                        <input type="hidden" name="email" value={u.email ?? ""} />
                        <input type="hidden" name="back" value={back} />
                        <SubmitButton size="sm" variant="ghost" pendingText="Mengirim…">
                          <Send className="size-3.5" aria-hidden /> Kirim ulang undangan
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </Card>
      )}
    </div>
  );
}
