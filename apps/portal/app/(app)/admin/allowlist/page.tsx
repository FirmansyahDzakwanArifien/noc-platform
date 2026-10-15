import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Role } from "@noc/supabase/types";
import {
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
import { addEntry, removeEntry } from "./actions";

export const metadata = { title: "Allowlist Email" };

type Entry = { email?: string; domain?: string; default_role: string; note: string | null };

export default async function AllowlistPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const auth = await requireAuth();
  if (!auth.can("user.manage")) return <Forbidden />;
  const supabase = await createClient();
  const [{ data: emails }, { data: domains }, { data: roles }, { data: myRank }] = await Promise.all([
    supabase.from("allowed_signup_emails").select("*").order("email"),
    supabase.from("allowed_signup_domains").select("*").order("domain"),
    supabase.from("roles").select("*").order("rank", { ascending: false }),
    supabase.rpc("my_max_rank"),
  ]);
  const roleList = (roles ?? []) as Role[];
  const assignable = roleList.filter((r) => r.rank <= ((myRank as number | null) ?? 0));
  const defaultRole = assignable.find((r) => r.key === "viewer")?.key ?? assignable[assignable.length - 1]?.key ?? "";

  const sections = [
    { kind: "domain" as const, title: "Domain", hint: "Semua email dengan domain ini boleh mendaftar (dicocokkan persis, tanpa subdomain).", rows: (domains ?? []) as Entry[], placeholder: "jarvis.biz.id" },
    { kind: "email" as const, title: "Email spesifik", hint: "Email tertentu di luar domain di atas.", rows: (emails ?? []) as Entry[], placeholder: "nama@gmail.com" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allowlist pendaftaran"
        description="Hanya email/domain di daftar ini yang bisa membuat akun. Role awal diberikan otomatis saat pendaftaran."
      />
      <Flash searchParams={await searchParams} />

      {sections.map((s) => (
        <Card key={s.kind}>
          <CardHeader>
            <div>
              <CardTitle>{s.title}</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">{s.hint}</p>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>{s.title}</TH>
                <TH>Role awal</TH>
                <TH>Catatan</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {s.rows.map((r) => {
                const value = (s.kind === "domain" ? r.domain : r.email)!;
                return (
                  <TR key={value}>
                    <TD className="font-medium text-slate-900">{s.kind === "domain" ? `@${value}` : value}</TD>
                    <TD>{roleList.find((x) => x.key === r.default_role)?.name ?? r.default_role}</TD>
                    <TD className="text-slate-500">{r.note ?? "-"}</TD>
                    <TD className="text-right">
                      <form action={removeEntry}>
                        <input type="hidden" name="kind" value={s.kind} />
                        <input type="hidden" name="value" value={value} />
                        <SubmitButton variant="ghost" size="sm" className="text-red-600" pendingText="…">
                          Hapus
                        </SubmitButton>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <CardContent className="border-t border-slate-100">
            <form action={addEntry} className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
              <input type="hidden" name="kind" value={s.kind} />
              <Field label={s.title}>
                <Input name="value" required placeholder={s.placeholder} type={s.kind === "email" ? "email" : "text"} />
              </Field>
              <Field label="Role awal">
                <Select name="default_role" defaultValue={defaultRole}>
                  {assignable.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catatan">
                <Input name="note" />
              </Field>
              <SubmitButton>Tambah</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
