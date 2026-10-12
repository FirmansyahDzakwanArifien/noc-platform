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
import { loadSites } from "@/lib/data";
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
  const [{ data }, { data: itemRows }, sites] = await Promise.all([
    supabase.from("checklist_templates").select("*").order("name"),
    supabase.from("checklist_template_items").select("template_id"),
    loadSites(supabase),
  ]);
  const templates = (data as ChecklistTemplate[] | null) ?? [];
  const counts = new Map<string, number>();
  for (const r of (itemRows ?? []) as { template_id: string }[]) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Template Checklist" description="Checklist yang diisi saat serah terima shift (suhu, UPS, genset, link, dll)." />
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Template baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTemplate} className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
            <Field label="Nama template" required>
              <Input name="name" required placeholder="mis. Checklist Ruang Server" />
            </Field>
            <Field label="Site">
              <Select name="site_id" defaultValue="">
                <option value="">— Umum (semua site) —</option>
                {sites.active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton>Buat template</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState title="Belum ada template" />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Nama</TH>
                <TH>Site</TH>
                <TH>Jumlah item</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/checklist/${t.id}`} className="font-medium text-brand-600 hover:underline">
                      {t.name}
                    </Link>
                  </TD>
                  <TD>{sites.name(t.site_id)}</TD>
                  <TD className="tabular-nums">{counts.get(t.id) ?? 0}</TD>
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
