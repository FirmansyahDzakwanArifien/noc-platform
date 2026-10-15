import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Announcement } from "@noc/supabase/types";
import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
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
  toDateTimeInput,
} from "@noc/ui";
import { Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmSubmit } from "../../../components/confirm-submit";
import { deleteAnnouncement, saveAnnouncement } from "./actions";

export const metadata = { title: "Pengumuman" };

type Row = Announcement & { author: { full_name: string } | null; division: { code: string } | null };

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; baru?: string; error?: string; success?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.can("portal.access")) return <Forbidden />;
  const canManage = auth.can("announcement.manage");
  const sp = await searchParams;
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("announcements")
    .select("*, author:profiles!announcements_created_by_fkey(full_name), division:divisions(code)")
    .order("publish_at", { ascending: false })
    .limit(50);
  if (!canManage) query = query.lte("publish_at", nowIso).or(`expire_at.is.null,expire_at.gt.${nowIso}`);
  const [{ data }, { data: divData }] = await Promise.all([
    query,
    canManage ? supabase.from("divisions").select("id, code, name").order("sort_order") : Promise.resolve({ data: [] }),
  ]);
  const divisions = (divData ?? []) as { id: string; code: string; name: string }[];
  const items = (data ?? []) as unknown as Row[];
  const editing = canManage && sp.edit ? items.find((a) => a.id === sp.edit) : undefined;
  const showForm = canManage && (!!editing || sp.baru === "1");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengumuman"
        description="Informasi resmi untuk seluruh tim. Pengumuman aktif juga tampil di dashboard."
        actions={
          canManage &&
          !showForm && (
            <Link href="/pengumuman?baru=1" className={buttonClass()}>
              <Plus className="size-4" aria-hidden /> Buat pengumuman
            </Link>
          )
        }
      />
      <Flash searchParams={sp} />

      {showForm && (
        <Card className="border-brand-200 ring-2 ring-brand-100">
          <CardHeader>
            <CardTitle>{editing ? "Ubah pengumuman" : "Buat pengumuman"}</CardTitle>
            <Link href="/pengumuman" className={buttonClass("ghost", "sm")}>
              <X className="size-3.5" aria-hidden /> Batal
            </Link>
          </CardHeader>
          <CardContent>
            <form action={saveAnnouncement} key={editing?.id ?? "new"} className="grid gap-4 sm:grid-cols-2">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Judul" required className="sm:col-span-2">
                <Input name="title" required defaultValue={editing?.title} placeholder="mis. Maintenance link backbone Sabtu malam" />
              </Field>
              <Field label="Isi" required className="sm:col-span-2">
                <Textarea name="body" rows={5} required defaultValue={editing?.body} />
              </Field>
              <Field label="Untuk divisi" hint="Semua divisi = tampil untuk semua orang.">
                <Select name="division_id" defaultValue={editing?.division_id ?? ""}>
                  <option value="">Semua divisi</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prioritas" hint="Tinggi & Kritis ditonjolkan di dashboard.">
                <Select name="priority" defaultValue={editing?.priority ?? "low"}>
                  <option value="low">Rendah — informasi umum</option>
                  <option value="medium">Sedang — perlu diketahui</option>
                  <option value="high">Tinggi — perlu tindakan</option>
                  <option value="critical">Kritis — segera</option>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tayang mulai" hint="Kosong = sekarang.">
                  <Input name="publish_at" type="datetime-local" defaultValue={editing ? toDateTimeInput(new Date(editing.publish_at)) : ""} />
                </Field>
                <Field label="Berakhir" hint="Kosong = tanpa batas.">
                  <Input name="expire_at" type="datetime-local" defaultValue={editing?.expire_at ? toDateTimeInput(new Date(editing.expire_at)) : ""} />
                </Field>
              </div>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton>{editing ? "Simpan perubahan" : "Publikasikan"}</SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Belum ada pengumuman"
          description={canManage ? "Buat pengumuman pertama untuk tim." : "Pengumuman dari supervisor atau lead akan muncul di sini."}
        />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const expired = !!a.expire_at && a.expire_at < nowIso;
            const scheduled = a.publish_at > nowIso;
            const important = a.priority === "high" || a.priority === "critical";
            return (
              <Card
                key={a.id}
                className={cn(
                  expired && "opacity-60",
                  important && !expired && "border-l-4 border-l-brand-600",
                  a.id === editing?.id && "ring-2 ring-brand-100",
                )}
              >
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span
                        className={cn(
                          "mt-0.5 hidden size-9 shrink-0 place-items-center rounded-lg sm:grid",
                          important ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-500",
                        )}
                      >
                        <Megaphone className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          {a.title}
                          {a.priority !== "low" && <StatusBadge status={a.priority} />}
                          {a.division && <Badge tone="gray">{a.division.code}</Badge>}
                          {scheduled && <Badge tone="purple">Terjadwal</Badge>}
                          {expired && <StatusBadge status="expired" />}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {a.author?.full_name ?? "—"} · {scheduled ? "tayang " : ""}
                          {formatDateTime(a.publish_at)}
                          {a.expire_at && ` · berakhir ${formatDateTime(a.expire_at)}`}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Link href={`/pengumuman?edit=${a.id}`} className={buttonClass("ghost", "sm")}>
                          <Pencil className="size-3.5" aria-hidden /> Ubah
                        </Link>
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <ConfirmSubmit message={`Hapus pengumuman "${a.title}"?`} className="text-red-600 hover:bg-red-50">
                            <Trash2 className="size-3.5" aria-hidden /> Hapus
                          </ConfirmSubmit>
                        </form>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:pl-12">{a.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
