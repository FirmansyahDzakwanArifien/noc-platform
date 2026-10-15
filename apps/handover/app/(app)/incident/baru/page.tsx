import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import {
  buttonClass,
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
  Textarea,
  toDateTimeInput,
} from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { PRIORITIES, SEVERITY_HINT } from "@/lib/constants";
import { DivisionCategoryFields, SecurityFields } from "@/components/incident-fields";
import { loadDivisions, loadMyDivision, loadProfiles, loadSites } from "@/lib/data";
import { createIncident } from "../actions";

export const metadata = { title: "Laporkan Incident" };

export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("incident.manage")) return <Forbidden />;

  const supabase = await createClient();
  const [profiles, sites, divisions, myDivision] = await Promise.all([
    loadProfiles(supabase),
    loadSites(supabase),
    loadDivisions(supabase),
    loadMyDivision(supabase),
  ]);
  const defaults = { division_id: divisions.get(myDivision)?.id ?? null, category: "jaringan" as const };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Laporkan Incident"
        description="Catat gangguan yang sedang terjadi agar penanganannya bisa dipantau lintas shift."
        actions={
          <Link href="/incident" className={buttonClass("secondary")}>
            <ArrowLeft className="size-4" aria-hidden /> Kembali
          </Link>
        }
      />
      <Flash searchParams={sp} />

      <form action={createIncident} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Gangguan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul" required className="sm:col-span-2" hint="Singkat dan spesifik: apa yang terganggu dan di mana.">
              <Input name="title" required placeholder="mis. Link uplink ISP A down di POP Surabaya" />
            </Field>
            <DivisionCategoryFields divisions={divisions.list} values={defaults} />
            <Field label="Tingkat keparahan (severity)" required>
              <Select name="severity" defaultValue="medium" required>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {SEVERITY_HINT[p.value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mulai terjadi (WIB)" hint="Default: sekarang. Ubah jika gangguan sudah terjadi lebih awal.">
              <Input type="datetime-local" name="started_at" defaultValue={toDateTimeInput()} />
            </Field>
            <Field label="Site">
              <Select name="site_id" defaultValue="">
                <option value="">Tidak spesifik / beberapa site</option>
                {sites.active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Layanan terdampak" hint="mis. Internet pelanggan korporat, VPN kantor cabang.">
              <Input name="affected_service" />
            </Field>
            <Field label="Deskripsi" className="sm:col-span-2">
              <Textarea name="description" rows={3} placeholder="Gejala, alarm yang muncul, langkah awal yang sudah dilakukan." />
            </Field>
            <SecurityFields divisions={divisions.list} values={defaults} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Penanganan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Ditangani oleh" hint="Bisa ditetapkan nanti.">
              <Select name="assigned_to" defaultValue={auth.userId}>
                <option value="">Belum ditugaskan</option>
                {profiles.active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {p.id === auth.userId ? " (saya)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="No. tiket eksternal" hint="Nomor tiket dari ISP/vendor, jika sudah dilaporkan.">
              <Input name="external_ticket" placeholder="mis. TT-123456" />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Nomor tiket incident (INC-…) dibuat otomatis. Perkembangan dicatat di timeline setelah disimpan.</p>
          <SubmitButton pendingText="Menyimpan…" className="shrink-0">
            Simpan incident
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
