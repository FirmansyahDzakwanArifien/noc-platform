import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { buttonClass, Card, CardContent, CardHeader, CardTitle, cn, Field, Flash, Forbidden, Input, PageHeader, SubmitButton } from "@noc/ui";
import { Layers, Merge, Pencil, Split } from "lucide-react";
import { saveDivision, setIsolation } from "./actions";

export const metadata = { title: "Divisi" };

type Division = { id: string; code: string; name: string; description: string | null };
type TeamLite = { id: string; name: string; division_id: string | null };

export default async function DivisionsPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("settings.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [{ data: divData }, { data: teamData }, { data: setting }] = await Promise.all([
    supabase.from("divisions").select("id, code, name, description").order("sort_order").order("code"),
    supabase.from("teams").select("id, name, division_id").order("name"),
    supabase.from("app_settings").select("value").eq("key", "division_isolation").maybeSingle(),
  ]);
  const divisions = (divData as Division[] | null) ?? [];
  const teams = (teamData as TeamLite[] | null) ?? [];
  const isolated = (setting as { value: boolean } | null)?.value === true;
  const editing = divisions.find((d) => d.id === sp.edit);
  const unassigned = teams.filter((t) => !t.division_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Divisi"
        description="Platform dipakai beberapa divisi (mis. NOC & SOC). Tim dimasukkan ke divisi lewat Master Data → Tim."
      />
      <Flash searchParams={sp} />

      {/* Mode data */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Data antar divisi</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Berlaku untuk handover, incident, pengumuman, template checklist, dan jadwal yang sudah dipublikasikan.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {[
            { value: false, icon: Merge, title: "Digabung", desc: "Semua divisi saling melihat data satu sama lain." },
            {
              value: true,
              icon: Split,
              title: "Dipisah",
              desc: "Staff hanya melihat data divisinya + data umum. Admin, supervisor, dan lead tetap melihat semua.",
            },
          ].map((m) => {
            const active = isolated === m.value;
            return (
              <form key={m.title} action={setIsolation}>
                {m.value && <input type="hidden" name="isolated" value="on" />}
                <button
                  type="submit"
                  disabled={active}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                    active ? "border-brand-300 bg-brand-50/60 ring-2 ring-brand-100" : "border-slate-200/70 bg-white hover:border-brand-200 hover:bg-slate-50",
                  )}
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500")}>
                    <m.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      {m.title}
                      {active && <span className="rounded-full bg-brand-100 px-2 text-[11px] font-medium text-brand-700">Aktif</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{m.desc}</span>
                  </span>
                </button>
              </form>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Daftar divisi */}
        <div className="space-y-3">
          {divisions.map((d) => {
            const members = teams.filter((t) => t.division_id === d.id);
            return (
              <Card key={d.id} className={cn(d.id === editing?.id && "ring-2 ring-brand-100")}>
                <CardContent className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 font-display text-sm font-extrabold text-brand-600">{d.code}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    {d.description && <p className="text-sm text-slate-500">{d.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {members.length ? (
                        members.map((t) => (
                          <span key={t.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {t.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Belum ada tim</span>
                      )}
                    </div>
                  </div>
                  <Link href={`/admin/divisi?edit=${d.id}`} className={buttonClass("ghost", "sm")} aria-label={`Ubah ${d.name}`}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
          {unassigned.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <Layers className="size-3.5" aria-hidden /> Tim tanpa divisi (datanya dianggap umum):
              {unassigned.map((t) => (
                <span key={t.id} className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                  {t.name}
                </span>
              ))}
              <Link href="/admin/master?tab=tim" className="font-medium text-brand-600 hover:underline">
                Atur di Master Data
              </Link>
            </p>
          )}
        </div>

        {/* Form */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{editing ? `Ubah divisi ${editing.code}` : "Tambah divisi"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveDivision} className="grid gap-4" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Kode" required hint="Singkat, mis. NOC, SOC, IT.">
                <Input name="code" required maxLength={12} defaultValue={editing?.code} className="uppercase" />
              </Field>
              <Field label="Nama" required>
                <Input name="name" required maxLength={100} defaultValue={editing?.name} />
              </Field>
              <Field label="Deskripsi">
                <Input name="description" maxLength={200} defaultValue={editing?.description ?? ""} />
              </Field>
              <div className="flex gap-2">
                <SubmitButton>{editing ? "Simpan" : "Tambah divisi"}</SubmitButton>
                {editing && (
                  <Link href="/admin/divisi" className={buttonClass("ghost")}>
                    Batal
                  </Link>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
