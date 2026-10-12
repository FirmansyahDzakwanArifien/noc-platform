import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@noc/supabase/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { ArrowLeft, Trash2 } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { INPUT_TYPES } from "@/lib/constants";
import { loadSites } from "@/lib/data";
import { isUuid } from "@/lib/util";
import { addTemplateItem, deleteTemplateItem, toggleTemplate, updateTemplate } from "../actions";

export const metadata = { title: "Template Checklist" };

export default async function ChecklistTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("master.manage")) return <Forbidden />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [{ data: tpl }, { data: itemRows }, sites] = await Promise.all([
    supabase.from("checklist_templates").select("id, name, site_id, is_active").eq("id", id).maybeSingle(),
    supabase.from("checklist_template_items").select("*").eq("template_id", id).order("section", { nullsFirst: true }).order("sort_order"),
    loadSites(supabase),
  ]);
  if (!tpl) notFound();
  const t = tpl as ChecklistTemplate;
  const items = (itemRows as ChecklistTemplateItem[] | null) ?? [];
  const typeLabel = (v: string) => INPUT_TYPES.find((x) => x.value === v)?.label ?? v;
  const sections = [...new Set(items.map((i) => i.section).filter((s): s is string => !!s))];
  const nextSort = items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 10;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/checklist" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Semua template
        </Link>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t.name}
              <Badge tone={t.is_active ? "green" : "gray"}>{t.is_active ? "Aktif" : "Nonaktif"}</Badge>
            </span>
          }
          description={
            t.is_active
              ? `Berlaku untuk: ${t.site_id ? `site ${sites.name(t.site_id)}` : "semua site"}. Diisi petugas di setiap handover.`
              : "Template nonaktif — tidak ditawarkan saat mengisi handover baru."
          }
          actions={
            <form action={toggleTemplate}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="back" value="detail" />
              <input type="hidden" name="active" value={t.is_active ? "false" : "true"} />
              <Button type="submit" variant="secondary">
                {t.is_active ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            </form>
          }
        />
      </div>
      <Flash searchParams={sp} />

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan template</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTemplate} className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
            <input type="hidden" name="id" value={t.id} />
            <Field label="Nama template" required>
              <Input name="name" required defaultValue={t.name} />
            </Field>
            <Field label="Berlaku untuk site">
              <Select name="site_id" defaultValue={t.site_id ?? ""}>
                <option value="">— Umum (semua site) —</option>
                {sites.list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="secondary">Simpan pengaturan</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item checklist</CardTitle>
          <span className="text-sm text-slate-500">{items.length} item</span>
        </CardHeader>
        {items.length === 0 ? (
          <CardContent>
            <p className="text-sm text-slate-500">
              Belum ada item pemeriksaan. Tambahkan item lewat formulir di bawah agar template ini bisa diisi saat handover.
            </p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="hidden sm:table-cell">Urutan</TH>
                <TH className="hidden md:table-cell">Bagian</TH>
                <TH>Item</TH>
                <TH className="hidden sm:table-cell">Jenis isian</TH>
                <TH className="hidden lg:table-cell">Batas normal / pilihan</TH>
                <TH className="hidden sm:table-cell">Wajib</TH>
                <TH>
                  <span className="sr-only">Aksi</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD className="hidden tabular-nums sm:table-cell">{i.sort_order}</TD>
                  <TD className="hidden md:table-cell">{i.section ?? "Umum"}</TD>
                  <TD>
                    <p className="font-medium text-slate-900">
                      {i.label}
                      {i.is_required && <span className="ml-0.5 text-red-500 sm:hidden">*</span>}
                    </p>
                    <p className="text-xs text-slate-500 sm:hidden">
                      {i.section ?? "Umum"} · {typeLabel(i.input_type)}
                    </p>
                  </TD>
                  <TD className="hidden sm:table-cell">{typeLabel(i.input_type)}</TD>
                  <TD className="hidden text-xs text-slate-500 lg:table-cell">
                    {i.input_type === "number" && (
                      <>
                        {i.unit && <span>Satuan: {i.unit}. </span>}
                        {(i.min_value !== null || i.max_value !== null) && (
                          <span>
                            Normal: {i.min_value ?? "−∞"} – {i.max_value ?? "∞"}
                          </span>
                        )}
                      </>
                    )}
                    {i.input_type === "select" && Array.isArray(i.options) && <span>{i.options.join(", ")}</span>}
                  </TD>
                  <TD className="hidden sm:table-cell">{i.is_required ? "Ya" : "Tidak"}</TD>
                  <TD className="text-right">
                    <form action={deleteTemplateItem}>
                      <input type="hidden" name="template_id" value={t.id} />
                      <input type="hidden" name="item_id" value={i.id} />
                      <ConfirmSubmitButton
                        variant="ghost"
                        size="sm"
                        aria-label={`Hapus item ${i.label}`}
                        title="Hapus item"
                        pendingText="…"
                        confirm={`Hapus item "${i.label}" dari template ini?`}
                      >
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </ConfirmSubmitButton>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tambah item</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Satuan, batas normal, dan pilihan hanya dipakai sesuai jenis isian yang dipilih.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={addTemplateItem} className="space-y-4">
            <input type="hidden" name="template_id" value={t.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bagian" hint="Pengelompokan, mis. Power, Cooling, Network. Kosong = Umum.">
                <Input name="section" list="sections" />
                <datalist id="sections">
                  {sections.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="Nama item" required>
                <Input name="label" required placeholder="mis. Suhu ruang server" />
              </Field>
              <Field label="Jenis isian" required hint="Normal/Tidak normal, angka dengan batas, teks bebas, atau daftar pilihan.">
                <Select name="input_type" defaultValue="boolean">
                  {INPUT_TYPES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Satuan" hint="Untuk jenis Angka, mis. °C, %, V.">
                <Input name="unit" />
              </Field>
              <Field label="Batas normal minimum" hint="Untuk jenis Angka. Di bawah ini ditandai tidak normal.">
                <Input type="number" step="any" name="min_value" />
              </Field>
              <Field label="Batas normal maksimum" hint="Untuk jenis Angka. Di atas ini ditandai tidak normal.">
                <Input type="number" step="any" name="max_value" />
              </Field>
              <Field label="Daftar pilihan" hint="Untuk jenis Pilihan, pisahkan dengan koma." className="sm:col-span-2">
                <Input name="options" placeholder="mis. Normal, Warning, Down" />
              </Field>
              <Field label="Urutan tampil" hint="Angka kecil tampil lebih dulu.">
                <Input type="number" name="sort_order" defaultValue={nextSort} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input type="checkbox" name="is_required" defaultChecked className="size-4 rounded border-slate-300" />
                Wajib diisi
              </label>
            </div>
            <div className="flex justify-end">
              <SubmitButton pendingText="Menambahkan…">Tambah item</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
