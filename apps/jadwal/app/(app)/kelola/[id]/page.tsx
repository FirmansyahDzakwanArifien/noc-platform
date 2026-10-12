import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Profile, SchedulePeriod, Shift } from "@noc/supabase/types";
import {
  Alert,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Flash,
  Forbidden,
  formatDateTime,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
} from "@noc/ui";
import { ArrowLeft, CalendarRange, X } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ShiftGridColors } from "@/components/shift-grid-colors";
import { dateRange, dayLabel, dayNumber, isWeekend, MONTH_NAMES, rangeLabel, todayWib } from "@/lib/dates";
import { cellKey, fetchPeriodCells } from "@/lib/schedule-diff";
import { shiftStyle, textOn, UUID_RE } from "@/lib/shift";
import { deletePeriod, fillRotation, saveGrid, setPeriodStatus } from "./actions";

export const metadata = { title: "Editor Jadwal" };

type PeriodRow = SchedulePeriod & { teams: { name: string } | null; sites: { name: string } | null };
type ProfileLite = Pick<Profile, "id" | "full_name" | "team_id" | "is_active">;
type SP = Promise<{ users?: string; add?: string; semua?: string; error?: string; success?: string }>;

export default async function PeriodEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("schedule.manage")) return <Forbidden />;
  if (!UUID_RE.test(id)) notFound();

  // ---- query string: ?users=<id,id> (baris tambahan), ?semua=1 (semua user aktif), ?add=<id> ----
  const extra = (sp.users ?? "").split(",").filter((u) => UUID_RE.test(u));
  const showAll = sp.semua === "1";
  const qs = (users: string[], all = showAll) => {
    const p = new URLSearchParams();
    if (users.length) p.set("users", [...new Set(users)].join(","));
    if (all) p.set("semua", "1");
    const s = p.toString();
    return `/kelola/${id}${s ? `?${s}` : ""}`;
  };
  if (sp.add) {
    redirect(qs(UUID_RE.test(sp.add) ? [...extra, sp.add] : extra));
  }
  const selfPath = qs(extra);

  const supabase = await createClient();
  const [{ data: periodData }, { data: shiftData }, { data: profileData }, cells] = await Promise.all([
    supabase.from("schedule_periods").select("*, teams(name), sites(name)").eq("id", id).maybeSingle(),
    supabase.from("shifts").select("*").order("sort_order"),
    supabase.from("profiles").select("id, full_name, team_id, is_active").order("full_name"),
    fetchPeriodCells(supabase, id),
  ]);
  const period = periodData as unknown as PeriodRow | null;
  if (!period) notFound();

  const allShifts = (shiftData as Shift[] | null) ?? [];
  const profiles = (profileData as ProfileLite[] | null) ?? [];
  const existing = cells.data;

  // ---- sel yang sudah ada ----
  const byCell = new Map<string, { shift_id: string; count: number; is_leader: boolean }>();
  const scheduledUsers = new Set<string>();
  for (const r of existing) {
    const k = cellKey(r.user_id, r.work_date);
    const cur = byCell.get(k);
    if (cur) cur.count++;
    else byCell.set(k, { shift_id: r.shift_id, count: 1, is_leader: r.is_leader });
    scheduledUsers.add(r.user_id);
  }
  const usedShiftIds = new Set(existing.map((r) => r.shift_id));
  const shifts = allShifts.filter((s) => s.is_active || usedShiftIds.has(s.id));
  const shiftById = new Map(allShifts.map((s) => [s.id, s]));

  // ---- baris user ----
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const baseIds = profiles
    .filter((p) => p.is_active && (showAll || !period.team_id || p.team_id === period.team_id))
    .map((p) => p.id);
  const rowIds = [...new Set([...baseIds, ...scheduledUsers, ...extra])];
  const rows = rowIds
    .map((uid) => ({ id: uid, name: profileById.get(uid)?.full_name ?? `(user ${uid.slice(0, 8)})`, active: profileById.get(uid)?.is_active ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const baseSet = new Set(baseIds);
  const rowSet = new Set(rowIds);
  const addable = profiles.filter((p) => p.is_active && !rowSet.has(p.id));

  const days = dateRange(period.start_date, period.end_date);
  const today = todayWib();
  const colors = Object.fromEntries(
    shifts.map((s) => [s.id, { bg: s.color || "#94a3b8", fg: textOn(s.color) }]),
  );
  const defaultPattern =
    ["P", "S", "M", "OFF"].every((c) => shifts.some((s) => s.code === c)) ? "P,P,S,S,M,M,OFF,OFF" : shifts.map((s) => s.code).join(",");
  const multiCells = [...byCell.values()].filter((c) => c.count > 1).length;

  return (
    <div className="space-y-6">
      <Link href="/kelola" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Semua periode
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {period.name} <StatusBadge status={period.status} />
          </span>
        }
        description={
          <>
            {rangeLabel(period.start_date, period.end_date)} · {days.length} hari
            {period.teams?.name && <> · Tim {period.teams.name}</>}
            {period.sites?.name && <> · {period.sites.name}</>}
            {period.published_at && <> · Dipublikasikan {formatDateTime(period.published_at)}</>}
          </>
        }
        actions={
          <>
            <Link href={`/kalender?period=${period.id}`} className={buttonClass("secondary")}>
              <CalendarRange className="size-4" aria-hidden /> Lihat kalender
            </Link>
            {period.status === "draft" && (
              <StatusForm id={id} back={selfPath} to="published">
                <ConfirmSubmit variant="success" pendingText="Memproses…" confirm="Publikasikan jadwal ini? Semua yang terjadwal akan mendapat notifikasi.">
                  Publish
                </ConfirmSubmit>
              </StatusForm>
            )}
            {period.status !== "draft" && (
              <StatusForm id={id} back={selfPath} to="draft">
                <ConfirmSubmit variant="secondary" pendingText="Memproses…" confirm="Kembalikan ke draft? Jadwal tidak akan terlihat oleh user biasa.">
                  Kembalikan ke draft
                </ConfirmSubmit>
              </StatusForm>
            )}
            {period.status !== "archived" && (
              <StatusForm id={id} back={selfPath} to="archived">
                <ConfirmSubmit variant="secondary" pendingText="Memproses…" confirm="Arsipkan periode ini?">
                  Arsipkan
                </ConfirmSubmit>
              </StatusForm>
            )}
            {period.status === "draft" && (
              <form action={deletePeriod}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={selfPath} />
                <ConfirmSubmit variant="danger" pendingText="Menghapus…" confirm="Hapus periode beserta seluruh jadwalnya? Tindakan ini tidak dapat dibatalkan.">
                  Hapus
                </ConfirmSubmit>
              </form>
            )}
          </>
        }
      />
      <Flash searchParams={sp} />

      {period.status === "published" && (
        <Alert tone="info">Periode ini sudah dipublikasikan — perubahan jadwal langsung terlihat oleh tim.</Alert>
      )}
      {period.notes && <p className="text-sm text-slate-600">Catatan: {period.notes}</p>}
      {cells.error && <Alert tone="error">Gagal memuat jadwal: {cells.error.message}</Alert>}
      {multiCells > 0 && (
        <Alert tone="warning">
          {multiCells} sel memiliki lebih dari satu shift (ditandai garis putus-putus). Editor hanya menampilkan/mengubah shift pertama; shift
          lainnya tidak disentuh kecuali sel dikosongkan.
        </Alert>
      )}

      {/* ---------------- Grid ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Jadwal</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {period.team_id && (
              <Link href={qs(extra, !showAll)} className="font-medium text-brand-600 hover:underline">
                {showAll ? `Hanya anggota tim ${period.teams?.name ?? ""}` : "Tampilkan semua user aktif"}
              </Link>
            )}
            <form method="get" className="flex items-center gap-2">
              {extra.length > 0 && <input type="hidden" name="users" value={extra.join(",")} />}
              {showAll && <input type="hidden" name="semua" value="1" />}
              <Select name="add" defaultValue="" className="h-8 w-48 text-xs" aria-label="Tambah user ke grid">
                <option value="">+ Tambah user…</option>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Tambah
              </button>
            </form>
          </div>
        </CardHeader>

        {rows.length === 0 ? (
          <CardContent className="text-sm text-slate-500">Tidak ada user aktif. Tambahkan user dari menu di atas.</CardContent>
        ) : (
          <form action={saveGrid}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={selfPath} />
            <ShiftGridColors colors={colors}>
              <div className="max-h-[70vh] overflow-auto">
                <table className="border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      <th className="sticky left-0 z-30 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500">
                        Nama
                      </th>
                      {days.map((d) => (
                        <th
                          key={d}
                          title={`${dayLabel(d)}, ${dayNumber(d)} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`}
                          className={cn(
                            "min-w-14 border-b border-r border-slate-100 px-1 py-1.5 text-center font-medium",
                            isWeekend(d) ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500",
                            d === today && "bg-brand-100 text-brand-700",
                          )}
                        >
                          <div className="text-[10px] font-normal">{dayLabel(d)}</div>
                          <div>{dayNumber(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const removable = !baseSet.has(u.id) && !scheduledUsers.has(u.id);
                      return (
                        <tr key={u.id}>
                          <th
                            scope="row"
                            className="sticky left-0 z-10 max-w-48 border-b border-r border-slate-200 bg-white px-3 py-1 text-left font-medium text-slate-800"
                          >
                            <div className="flex items-center gap-1">
                              <span className="truncate" title={u.name}>
                                {u.name}
                              </span>
                              {!u.active && <span className="text-[10px] font-normal text-slate-400">(nonaktif)</span>}
                              {removable && (
                                <Link
                                  href={qs(extra.filter((x) => x !== u.id))}
                                  className="ml-auto text-slate-400 hover:text-red-600"
                                  title="Hapus baris"
                                  aria-label={`Hapus baris ${u.name}`}
                                >
                                  <X className="size-3.5" />
                                </Link>
                              )}
                            </div>
                          </th>
                          {days.map((d) => {
                            const cur = byCell.get(cellKey(u.id, d));
                            const s = cur ? shiftById.get(cur.shift_id) : undefined;
                            return (
                              <td
                                key={d}
                                className={cn("border-b border-r border-slate-100 p-0.5", isWeekend(d) && "bg-rose-50/50")}
                              >
                                <select
                                  name={`cell:${u.id}:${d}`}
                                  defaultValue={cur?.shift_id ?? ""}
                                  data-shift-cell=""
                                  data-initial={cur?.shift_id ?? ""}
                                  aria-label={`${u.name} ${d}`}
                                  title={cur && cur.count > 1 ? `${cur.count} shift pada tanggal ini` : undefined}
                                  style={s ? shiftStyle(s.color) : undefined}
                                  className={cn(
                                    "h-8 w-full min-w-12 cursor-pointer appearance-none rounded border border-slate-200 bg-white px-1 text-center text-xs font-semibold text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 data-[dirty=1]:ring-2 data-[dirty=1]:ring-brand-500",
                                    cur && cur.count > 1 && "border-2 border-dashed border-slate-700",
                                  )}
                                >
                                  <option value="">—</option>
                                  {shifts.map((sh) => (
                                    <option key={sh.id} value={sh.id}>
                                      {sh.code}
                                      {!sh.is_active ? " (nonaktif)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ShiftGridColors>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3">
              <SubmitButton>Simpan jadwal</SubmitButton>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                {shifts.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    <span className="rounded px-1.5 py-0.5 font-semibold" style={shiftStyle(s.color)}>
                      {s.code}
                    </span>
                    {s.name}
                  </span>
                ))}
                <span className="text-slate-400">Sel yang diubah ditandai garis biru.</span>
              </div>
            </div>
          </form>
        )}
      </Card>

      {/* ---------------- Pola rotasi ---------------- */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Isi pola rotasi</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={fillRotation} className="space-y-4">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={selfPath} />
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">User</legend>
                <p className="text-xs text-slate-500">Urutan centang = urutan geser pola (sesuai urutan nama).</p>
                <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="rot_users" value={u.id} className="size-4 rounded border-slate-300" />
                      <span className="truncate">{u.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field
                  label="Pola"
                  required
                  className="sm:col-span-2"
                  hint={
                    <>
                      Kode shift dipisah koma, ulang terus. Pakai <code>-</code> untuk mengosongkan. Kode tersedia:{" "}
                      {shifts.filter((s) => s.is_active).map((s) => s.code).join(", ")}.
                    </>
                  }
                >
                  <Input name="pattern" required defaultValue={defaultPattern} />
                </Field>
                <Field label="Mulai tanggal" hint="Hari pertama pola (indeks 0). Sel sebelum tanggal ini tidak diubah.">
                  <Input type="date" name="rot_start" defaultValue={period.start_date} min={period.start_date} max={period.end_date} />
                </Field>
                <Field label="Geser per orang" hint="Orang ke-n mulai dari posisi n × geser.">
                  <Input type="number" name="offset" defaultValue={2} min={0} max={366} />
                </Field>
              </div>
              <ConfirmSubmit
                variant="secondary"
                pendingText="Menerapkan…"
                confirm="Terapkan pola? Jadwal user terpilih dari tanggal mulai s/d akhir periode akan ditimpa. Perubahan grid yang belum disimpan akan hilang."
              >
                Terapkan pola
              </ConfirmSubmit>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusForm({ id, back, to, children }: { id: string; back: string; to: string; children: React.ReactNode }) {
  return (
    <form action={setPeriodStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="to" value={to} />
      {children}
    </form>
  );
}
