import { Field, Input, Select, Textarea } from "@noc/ui";
import type { Project, Site } from "@noc/supabase/types";
import { CATEGORY_SUGGESTIONS, PRIORITIES } from "@/lib/constants";

/** Field form project yang dipakai di halaman "Project baru" dan form edit. */
export function ProjectFields({
  sites,
  project,
}: {
  sites: Pick<Site, "id" | "code" | "name">[];
  project?: Partial<Project>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nama project" required className="sm:col-span-2">
        <Input name="name" required maxLength={200} defaultValue={project?.name ?? ""} placeholder="mis. Migrasi core router POP Surabaya" />
      </Field>
      <Field label="Deskripsi" className="sm:col-span-2">
        <Textarea name="description" rows={4} defaultValue={project?.description ?? ""} placeholder="Tujuan, ruang lingkup, catatan penting" />
      </Field>
      <Field label="Kategori">
        <Input name="category" list="category-suggestions" defaultValue={project?.category ?? ""} placeholder="upgrade, deployment, migrasi…" />
        <datalist id="category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Site">
        <Select name="site_id" defaultValue={project?.site_id ?? ""}>
          <option value="">— Tidak terkait site —</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prioritas">
        <Select name="priority" defaultValue={project?.priority ?? "medium"}>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hidden sm:block" />
      <Field label="Tanggal mulai">
        <Input type="date" name="start_date" defaultValue={project?.start_date ?? ""} />
      </Field>
      <Field label="Target selesai">
        <Input type="date" name="target_date" defaultValue={project?.target_date ?? ""} />
      </Field>
    </div>
  );
}
