import type { Division } from "@noc/supabase/types";
import { cn, Field, Input, Select, Textarea } from "@noc/ui";
import { ShieldAlert } from "lucide-react";
import { INCIDENT_CATEGORIES, SECURITY_TYPES, type Incident } from "@/lib/constants";
import { SecuritySection } from "./security-section";

type Values = Partial<
  Pick<Incident, "division_id" | "category" | "security_type" | "mitre_technique" | "iocs" | "affected_assets">
>;

/** Select Divisi + Kategori incident (dipakai di form buat & edit). */
export function DivisionCategoryFields({ divisions, values }: { divisions: Division[]; values: Values }) {
  return (
    <>
      <Field label="Divisi" hint="Divisi yang menangani. Pilih Umum bila lintas divisi.">
        <Select name="division_id" defaultValue={values.division_id ?? ""}>
          <option value="">Umum</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kategori" required>
        <Select name="category" defaultValue={values.category ?? "jaringan"} required>
          {INCIDENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/**
 * Bagian "Detail keamanan": muncul otomatis bila Kategori = Keamanan atau Divisi = SOC.
 * `compact` untuk kolom sempit (panel samping detail incident).
 */
export function SecurityFields({
  divisions,
  values,
  compact = false,
}: {
  divisions: Division[];
  values: Values;
  compact?: boolean;
}) {
  const socIds = divisions.filter((d) => d.code.toUpperCase() === "SOC").map((d) => d.id);
  const initialOpen = values.category === "keamanan" || (!!values.division_id && socIds.includes(values.division_id));
  return (
    <SecuritySection socDivisionIds={socIds} initialOpen={initialOpen} className={compact ? undefined : "sm:col-span-2"}>
      <div className={cn("rounded-2xl border border-violet-200 bg-violet-50/40 p-4", compact ? "space-y-3" : "grid gap-4 sm:grid-cols-2")}>
        <p className={cn("flex items-center gap-2 text-sm font-semibold text-violet-900", !compact && "sm:col-span-2")}>
          <ShieldAlert className="size-4" aria-hidden /> Detail keamanan
        </p>
        <Field label="Jenis serangan">
          <Select name="security_type" defaultValue={values.security_type ?? ""}>
            <option value="">Belum diketahui</option>
            {SECURITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teknik MITRE ATT&CK">
          <Input name="mitre_technique" defaultValue={values.mitre_technique ?? ""} placeholder="mis. T1566 Phishing" />
        </Field>
        <Field label="IOC" hint="Satu per baris: IP, domain, hash, URL" className={compact ? undefined : "sm:col-span-2"}>
          <Textarea name="iocs" rows={4} defaultValue={values.iocs ?? ""} className="font-mono text-xs" />
        </Field>
        <Field label="Aset terdampak" className={compact ? undefined : "sm:col-span-2"}>
          <Textarea name="affected_assets" rows={2} defaultValue={values.affected_assets ?? ""} placeholder="mis. Server mail-01, laptop staf keuangan" />
        </Field>
      </div>
    </SecuritySection>
  );
}
