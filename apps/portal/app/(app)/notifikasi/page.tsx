import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Notification } from "@noc/supabase/types";
import { Badge, buttonClass, Card, EmptyState, Flash, formatDateTime, PageHeader, SubmitButton } from "@noc/ui";
import { APPS } from "@noc/supabase/apps";
import { markAllRead, markRead } from "./actions";

export const metadata = { title: "Notifikasi" };

/** Link notifikasi berupa path relatif ke app asalnya (mis. "/kalender?period=..." dari app jadwal). */
function resolveLink(n: Notification): string | null {
  if (!n.link) return null;
  if (/^https?:\/\//.test(n.link)) return n.link;
  const app = APPS.find((a) => a.key === n.app);
  return app ? app.url + n.link : n.link;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireAuth();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  const items = (data ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div>
      <PageHeader
        title="Notifikasi"
        description={unread ? `${unread} belum dibaca` : "Semua sudah dibaca"}
        actions={
          unread > 0 && (
            <form action={markAllRead}>
              <SubmitButton variant="secondary" size="sm" pendingText="…">
                Tandai semua dibaca
              </SubmitButton>
            </form>
          )
        }
      />
      <Flash searchParams={await searchParams} />
      {items.length === 0 ? (
        <EmptyState title="Belum ada notifikasi" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const link = resolveLink(n);
              return (
                <li key={n.id} className={n.read_at ? "px-5 py-4" : "bg-brand-50/40 px-5 py-4"}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {!n.read_at && <span className="size-2 rounded-full bg-brand-500" aria-label="Belum dibaca" />}
                        {n.title}
                        <Badge>{n.app}</Badge>
                      </p>
                      {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
                    </div>
                    <div className="flex gap-2">
                      {link && (
                        <a href={link} className={buttonClass("secondary", "sm")}>
                          Buka
                        </a>
                      )}
                      {!n.read_at && (
                        <form action={markRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <SubmitButton variant="ghost" size="sm" pendingText="…">
                            Dibaca
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
