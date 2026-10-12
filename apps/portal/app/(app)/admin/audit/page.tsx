import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { Badge, buttonClass, Card, EmptyState, Forbidden, formatDateTime, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from "@noc/ui";

export const metadata = { title: "Audit Log" };

type Log = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
};

const IGNORED = new Set(["updated_at", "created_at"]);

function changedFields(log: Log): string[] {
  if (log.action !== "UPDATE" || !log.old_data || !log.new_data) return [];
  return Object.keys(log.new_data).filter(
    (k) => !IGNORED.has(k) && JSON.stringify(log.old_data![k]) !== JSON.stringify(log.new_data![k]),
  );
}

const TABLES = [
  "profiles",
  "user_roles",
  "role_permissions",
  "allowed_signup_emails",
  "allowed_signup_domains",
  "schedule_periods",
  "shift_schedules",
  "handovers",
  "handover_items",
  "permits",
  "permit_approvals",
  "leave_requests",
  "projects",
  "project_tasks",
  "incidents",
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const auth = await requireAuth();
  if (!auth.can("audit.view")) return <Forbidden />;
  const { table } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (table && TABLES.includes(table)) query = query.eq("table_name", table);
  const { data } = await query;
  const logs = (data ?? []) as Log[];

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const actorName = new Map(((actors ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));

  return (
    <div>
      <PageHeader title="Audit Log" description="200 perubahan terakhir pada data penting." />
      <form className="mb-4 flex gap-2">
        <Select name="table" defaultValue={table ?? ""} className="max-w-xs">
          <option value="">Semua tabel</option>
          {TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>

      {logs.length === 0 ? (
        <EmptyState title="Belum ada log" />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Waktu</TH>
                <TH>Aksi</TH>
                <TH>Tabel</TH>
                <TH>Perubahan</TH>
                <TH>Oleh</TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((l) => {
                const fields = changedFields(l);
                return (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</TD>
                    <TD>
                      <Badge tone={l.action === "INSERT" ? "green" : l.action === "DELETE" ? "red" : "blue"}>{l.action}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">{l.table_name}</TD>
                    <TD className="max-w-md text-xs">
                      {fields.length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-slate-600">{fields.join(", ")}</summary>
                          <ul className="mt-1 space-y-0.5">
                            {fields.map((f) => (
                              <li key={f} className="break-all">
                                <span className="font-mono text-slate-500">{f}</span>:{" "}
                                <span className="text-red-600 line-through">{JSON.stringify(l.old_data?.[f])}</span>{" "}
                                → <span className="text-emerald-700">{JSON.stringify(l.new_data?.[f])}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="font-mono text-slate-400">{l.record_id ?? "-"}</span>
                      )}
                    </TD>
                    <TD className="text-xs">{l.actor_id ? actorName.get(l.actor_id) ?? l.actor_id.slice(0, 8) : "sistem"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
