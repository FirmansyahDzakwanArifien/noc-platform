import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Role, Team } from "@noc/supabase/types";
import { Card, CardContent, Field, Flash, Forbidden, Input, PageHeader, Select, SubmitButton } from "@noc/ui";
import { ArrowLeft, MailPlus } from "lucide-react";
import { inviteUser } from "../actions";

export const metadata = { title: "Undang User" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const auth = await requireAuth();
  if (!auth.can("user.manage")) return <Forbidden />;
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: roles }, { data: teams }, { data: myRank }] = await Promise.all([
    supabase.from("roles").select("*").order("rank", { ascending: false }),
    supabase.from("teams").select("*").order("name"),
    supabase.rpc("my_max_rank"),
  ]);
  const assignable = ((roles ?? []) as Role[]).filter((r) => r.rank <= ((myRank as number | null) ?? 0));
  const defaultRole = assignable.find((r) => r.key === "staff") ?? assignable[assignable.length - 1];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Kembali ke daftar user
      </Link>
      <PageHeader
        title="Undang user"
        description="User menerima email berisi link untuk membuat password. Akunnya langsung muncul di daftar dengan status Menunggu."
      />
      <Flash searchParams={sp} />

      <Card>
        <CardContent>
          <form action={inviteUser} className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" required className="sm:col-span-2">
              <Input name="email" type="email" required autoComplete="off" placeholder="nama@corp.jarvis.biz.id" />
            </Field>
            <Field label="Nama lengkap" hint="Boleh dikosongkan; user bisa mengisinya sendiri." className="sm:col-span-2">
              <Input name="full_name" autoComplete="off" />
            </Field>
            <Field label="Role" required>
              <Select name="role_id" required defaultValue={defaultRole?.id ?? ""}>
                {assignable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tim">
              <Select name="team_id" defaultValue="">
                <option value="">Tanpa tim</option>
                {((teams ?? []) as Team[]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Email di luar domain perusahaan otomatis ditambahkan ke allowlist pendaftaran.
            </p>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Mengirim undangan…">
                <MailPlus className="size-4" aria-hidden /> Kirim undangan
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
