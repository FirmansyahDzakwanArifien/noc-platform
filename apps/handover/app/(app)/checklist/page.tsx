import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { ChecklistTemplate } from "@noc/supabase/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  Forbidden,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { DivisionBadge } from "@/components/division-badge";
import { loadDivisions, loadSites } from "@/lib/data";
import { createTemplate, toggleTemplate } from "./actions";

export const metadata = { title: "Template Checklist" };

export default async function ChecklistTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("master.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [{ data }, { data: itemRows }, sites, divisions] = await Promise.all([
    supabase.from("checklist_templates").select("id, name, site_id, division_id, is_active").order("name"),
    supabase.from("checklist_template_items").select("template_id"),
    loadSites(supabase),
    loadDivisions(supabase),
  ]);
  const templates = (data as ChecklistTemplate[] | null) ?? [];
  const counts = new Map<string, number>();
  for (const r of (itemRows ?? []) as { template_id: string }[]) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template Checklist"
        description="Atur daftar pemeriksaan (suhu, UPS, genset, link, dll.) yang diisi petugas di setiap handover."
      />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Template baru</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Setelah dibuat, Anda akan diarahkan untuk menambahkan item pemeriksaan.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={createTemplate} className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_12rem_14rem_auto]">
            <Field label="Nama template" required>
              <Input name="name" required placeholder="mis. Checklist Ruang Server" />
            </Field>
            <Field label="Divisi">
              <Select name="division_id" defaultValue={""}>
                <option value="">Semua divisi</option>
                {divisions.list.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Berlaku untuk site">
              <Select name="site_id" defaultValue="">
                <option value="">— Umum (semua site) —</option>
                {sites.active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingText="Membuat…">Buat template</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState
          title="Belum ada template checklist"
          description="Tanpa template, bagian checklist di halaman handover akan kosong. Buat template pertama lewat formulir di atas."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Nama</TH>
                <TH className="hidden md:table-cell">Divisi</TH>
                <TH className="hidden sm:table-cell">Site</TH>
                <TH className="hidden sm:table-cell">Jumlah item</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Link href={`/checklist/${t.id}`} className="font-medium text-brand-600 hover:underline">
                        {t.name}
                      </Link>
                      <DivisionBadge code={divisions.code(t.division_id)} className="md:hidden" />
                    </span>
                    <p className="text-xs text-slate-500 sm:hidden">
                      {sites.name(t.site_id)} · {counts.get(t.id) ?? 0} item
                    </p>
                    {(counts.get(t.id) ?? 0) === 0 && <p className="text-xs text-amber-700">Belum ada item — klik untuk menambahkan.</p>}
                  </TD>
                  <TD className="hidden md:table-cell">
                    {t.division_id ? <DivisionBadge code={divisions.code(t.division_id)} /> : <span className="text-slate-500">Semua</span>}
                  </TD>
                  <TD className="hidden sm:table-cell">{sites.name(t.site_id)}</TD>
                  <TD className="hidden tabular-nums sm:table-cell">{counts.get(t.id) ?? 0}</TD>
                  <TD>
                    <Badge tone={t.is_active ? "green" : "gray"}>{t.is_active ? "Aktif" : "Nonaktif"}</Badge>
                  </TD>
                  <TD className="text-right">
                    <form action={toggleTemplate} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="active" value={t.is_active ? "false" : "true"} />
                      <Button type="submit" variant="secondary" size="sm">
                        {t.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
