import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import { buttonClass, Card, CardContent, CardHeader, CardTitle, Flash, Forbidden, PageHeader, SubmitButton } from "@noc/ui";
import { CalendarPlus, RefreshCw, Smartphone } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { enableFeed } from "./actions";

export const metadata = { title: "Sinkron ke HP" };

const BASE_URL = (process.env.NEXT_PUBLIC_JADWAL_URL ?? "http://localhost:3001").replace(/\/$/, "");

const STEPS = [
  {
    name: "Google Calendar (Android / web)",
    steps: ["Klik tombol “Tambah ke Google Calendar” di atas.", "Konfirmasi “Tambah” — jadwal muncul di semua perangkat yang memakai akun Google itu."],
  },
  {
    name: "iPhone / iPad",
    steps: ["Klik “Buka di Kalender Apple” dari iPhone, lalu pilih Langganan.", "Atau: Pengaturan → Kalender → Akun → Tambah Akun → Lainnya → Tambah Kalender Langganan → tempel link."],
  },
  {
    name: "Outlook",
    steps: ["Kalender → Tambah kalender → Berlangganan dari web → tempel link."],
  },
];

export default async function SyncPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("schedule.view") && !auth.can("schedule.manage")) return <Forbidden />;

  const supabase = await createClient();
  const { data } = await supabase.from("calendar_feeds").select("token").eq("user_id", auth.userId).maybeSingle();
  const token = (data as { token: string } | null)?.token;
  const url = token ? `${BASE_URL}/ical/${token}.ics` : null;
  const webcal = url?.replace(/^https?:/, "webcal:");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinkron ke HP"
        description="Jadwal shift Anda otomatis muncul di Google Calendar, kalender iPhone, atau Outlook — lengkap dengan pengingat 1 jam sebelum shift."
      />
      <Flash searchParams={sp} />

      <Card>
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Smartphone className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {url ? (
              <>
                <p className="font-semibold text-slate-900">Link kalender pribadi Anda</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Rahasiakan link ini — siapa pun yang memilikinya bisa melihat jadwal Anda. Kalender diperbarui otomatis (biasanya tiap
                  beberapa jam, tergantung aplikasi).
                </p>
                <code className="mt-3 block truncate rounded-2xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-700">{url}</code>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass("primary", "sm")}
                  >
                    <CalendarPlus className="size-3.5" aria-hidden /> Tambah ke Google Calendar
                  </a>
                  <a href={webcal} className={buttonClass("secondary", "sm")}>
                    Buka di Kalender Apple
                  </a>
                  <CopyButton text={url} />
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900">Aktifkan sinkron kalender</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Kami akan membuat link kalender pribadi untuk Anda. Hanya jadwal yang sudah dipublikasikan yang ikut tersinkron (30 hari
                  ke belakang s/d 6 bulan ke depan).
                </p>
                <form action={enableFeed} className="mt-4">
                  <SubmitButton pendingText="Mengaktifkan…">
                    <RefreshCw className="size-4" aria-hidden /> Aktifkan sekarang
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {url && (
        <Card>
          <CardHeader>
            <CardTitle>Cara menambahkan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.name}>
                <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-600">
                  {s.steps.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {url && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Link tersebar ke orang lain? Buat ulang — link lama langsung berhenti berlaku.
          </p>
          <form action={enableFeed}>
            <input type="hidden" name="reset" value="1" />
            <ConfirmSubmit
              confirm="Buat ulang link? Kalender yang sudah berlangganan dengan link lama akan berhenti diperbarui."
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              pendingText="Membuat ulang…"
            >
              <RefreshCw className="size-3.5" aria-hidden /> Buat ulang link
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}
