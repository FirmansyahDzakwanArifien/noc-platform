import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Announcement } from "@noc/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Flash,
  Forbidden,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  Textarea,
} from "@noc/ui";
import { createAnnouncement, deleteAnnouncement } from "./actions";

export const metadata = { title: "Pengumuman" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const auth = await requireAuth();
  if (!auth.can("portal.access")) return <Forbidden />;
  const canManage = auth.can("announcement.manage");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let query = supabase.from("announcements").select("*").order("publish_at", { ascending: false }).limit(50);
  if (!canManage) query = query.lte("publish_at", nowIso).or(`expire_at.is.null,expire_at.gt.${nowIso}`);
  const { data } = await query;
  const items = (data ?? []) as Announcement[];

  return (
    <div className="space-y-6">
      <PageHeader title="Pengumuman" description="Informasi untuk seluruh tim NOC" />
      <Flash searchParams={await searchParams} />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Buat pengumuman</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAnnouncement} className="grid gap-4 sm:grid-cols-2">
              <Field label="Judul" required className="sm:col-span-2">
                <Input name="title" required />
              </Field>
              <Field label="Isi" required className="sm:col-span-2">
                <Textarea name="body" rows={4} required />
              </Field>
              <Field label="Prioritas">
                <Select name="priority" defaultValue="low">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
              <Field label="Berakhir pada" hint="Kosongkan jika tidak ada batas.">
                <Input name="expire_at" type="datetime-local" />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>Publikasikan</SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState title="Belum ada pengumuman" />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const expired = a.expire_at && a.expire_at < nowIso;
            return (
              <Card key={a.id} className={expired ? "opacity-60" : undefined}>
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        {a.title} <StatusBadge status={a.priority} />
                        {expired && <StatusBadge status="expired" />}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDateTime(a.publish_at)}
                        {a.expire_at && ` · berakhir ${formatDateTime(a.expire_at)}`}
                      </p>
                    </div>
                    {canManage && (
                      <form action={deleteAnnouncement}>
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton variant="ghost" size="sm" pendingText="…" className="text-red-600">
                          Hapus
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
