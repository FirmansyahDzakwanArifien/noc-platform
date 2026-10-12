import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Team } from "@noc/supabase/types";
import { Alert, Card, CardContent, CardHeader, CardTitle, Field, Flash, Input, PageHeader, SubmitButton } from "@noc/ui";
import { updateProfile } from "./actions";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Profil" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  const supabase = await createClient();
  const p = auth.profile;
  const { data: team } = p?.team_id
    ? await supabase.from("teams").select("*").eq("id", p.team_id).maybeSingle<Team>()
    : { data: null };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profil saya" description={auth.email} />
      <Flash searchParams={sp} />
      {sp.reset && <Alert tone="info">Silakan buat password baru di bawah.</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Data diri</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama lengkap" required className="sm:col-span-2">
              <Input name="full_name" defaultValue={p?.full_name ?? ""} required />
            </Field>
            <Field label="NIK karyawan">
              <Input name="employee_no" defaultValue={p?.employee_no ?? ""} />
            </Field>
            <Field label="No. HP">
              <Input name="phone" type="tel" defaultValue={p?.phone ?? ""} />
            </Field>
            <Field label="Tim" hint="Diatur oleh admin.">
              <Input value={team?.name ?? "-"} disabled readOnly />
            </Field>
            <Field label="Role" hint="Diatur oleh admin.">
              <Input value={auth.roles.join(", ") || "-"} disabled readOnly />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Simpan</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ganti password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
