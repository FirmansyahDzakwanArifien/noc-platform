import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@noc/supabase/server";
import { cn, formatDateTime, Logo } from "@noc/ui";
import { Clock, Mail, Phone, Users } from "lucide-react";

type Member = {
  key: string;
  full_name: string;
  team: string | null;
  roles: string[];
  top_rank: number | null;
  email: string | null;
  phone: string | null;
};
type Shared = { title: string; team_name: string | null; expires_at: string | null; members: Member[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_COLORS = ["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-teal-100 text-teal-700"];

/** Satu panggilan RPC per request (dipakai metadata + halaman). */
const load = cache(async (token: string): Promise<Shared | null> => {
  if (!UUID_RE.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_directory", { p_token: token });
  return (data as Shared | null) ?? null;
});

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  return { title: data ? data.title : "Link tidak berlaku", robots: { index: false, follow: false } };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export default async function SharedDirectoryPage({ params }: Props) {
  const data = await load((await params).token);
  if (!data) return <Invalid />;

  // Kelompokkan per tim; di dalam tim, role tertinggi dulu.
  const groups = new Map<string, Member[]>();
  for (const m of data.members) {
    const k = m.team ?? "Tanpa tim";
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  for (const list of groups.values()) list.sort((a, b) => (b.top_rank ?? 0) - (a.top_rank ?? 0) || a.full_name.localeCompare(b.full_name, "id"));

  return (
    <div className="min-h-dvh">
      <header className="relative overflow-hidden border-b border-slate-200/60 bg-gradient-to-br from-brand-50 via-white to-amber-50/60">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 animate-float rounded-full bg-brand-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 size-72 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Logo />
          <h1 className="mt-6 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{data.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            <Chip icon={<Users className="size-4" />}>
              {data.team_name ?? `${groups.size} tim`} · {data.members.length} orang
            </Chip>
            {data.expires_at && <Chip icon={<Clock className="size-4" />}>Link berlaku s/d {formatDateTime(data.expires_at)}</Chip>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        {data.members.length === 0 && <p className="text-center text-sm text-slate-500">Belum ada anggota aktif.</p>}
        {[...groups.entries()].map(([team, members]) => (
          <section key={team}>
            {!data.team_name && (
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                {team} <span className="rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-500">{members.length}</span>
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m, i) => (
                <div key={m.key} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-soft">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-full text-base font-semibold", AVATAR_COLORS[(m.key.charCodeAt(0) + i) % AVATAR_COLORS.length])}>
                    {initials(m.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{m.full_name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.roles.length ? (
                        m.roles.map((r) => (
                          <span key={r} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            {r}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Anggota</span>
                      )}
                    </div>
                    {(m.email || m.phone) && (
                      <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="flex items-center gap-1.5 truncate hover:text-brand-600">
                            <Mail className="size-3.5 shrink-0" aria-hidden /> {m.email}
                          </a>
                        )}
                        {m.phone && (
                          <a href={`tel:${m.phone}`} className="flex items-center gap-1.5 hover:text-brand-600">
                            <Phone className="size-3.5 shrink-0" aria-hidden /> {m.phone}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="pt-2 text-center text-xs text-slate-400">Daftar anggota Jarvis Ops · halaman ini selalu menampilkan data terbaru</p>
      </main>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 shadow-soft ring-1 ring-slate-200/70">
      <span className="text-brand-500" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function Invalid() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="max-w-sm">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Link tidak berlaku</h1>
        <p className="mt-2 text-sm text-slate-500">Link ini sudah kedaluwarsa, dinonaktifkan, atau salah ketik. Minta link terbaru ke admin.</p>
      </div>
    </div>
  );
}
