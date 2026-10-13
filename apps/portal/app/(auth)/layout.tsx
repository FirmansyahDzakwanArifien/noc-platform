import { Logo } from "@noc/ui";
import { ArrowLeftRight, CalendarDays, FileCheck2, ShieldCheck, TrendingUp } from "lucide-react";
import { LiveClock } from "../../components/live-clock";

const MODULES = [
  { icon: CalendarDays, name: "Jadwal", desc: "Roster shift & tukar shift" },
  { icon: ArrowLeftRight, name: "Handover", desc: "Serah terima antar shift" },
  { icon: FileCheck2, name: "Perizinan", desc: "Izin kerja, akses & cuti" },
  { icon: TrendingUp, name: "Perkembangan", desc: "Project & progress tim" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel brand */}
      <aside className="relative hidden overflow-hidden border-r border-slate-200/60 bg-gradient-to-br from-brand-50 via-white to-amber-50/60 text-slate-900 lg:flex lg:flex-col">
        {/* grid jaringan */}
        <svg className="absolute inset-0 size-full opacity-[0.35]" aria-hidden>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute -left-24 top-1/4 size-96 animate-float rounded-full bg-brand-200/50 blur-3xl" aria-hidden />
        <div
          className="absolute -right-20 bottom-10 size-80 animate-float rounded-full bg-amber-100/60 blur-3xl [animation-delay:-4s]"
          aria-hidden
        />

        {/* garis denyut monitoring */}
        <svg viewBox="0 0 600 120" className="absolute inset-x-0 top-[58%] w-full opacity-70" preserveAspectRatio="none" aria-hidden>
          <path
            d="M0 60 H170 L190 60 L205 25 L225 100 L245 40 L258 60 H380 L395 60 L408 35 L425 85 L438 60 H600"
            fill="none"
            stroke="url(#pulse)"
            strokeWidth="2"
            strokeDasharray="200 200"
            className="animate-pulse-line"
          />
          <defs>
            <linearGradient id="pulse" x1="0" x2="1">
              <stop offset="0" stopColor="#f77b7e" stopOpacity="0" />
              <stop offset="0.5" stopColor="#f77b7e" />
              <stop offset="1" stopColor="#f77b7e" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative flex flex-1 flex-col p-10 xl:p-14">
          <div className="flex items-center justify-between">
            <Logo />
            <span className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-soft backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <LiveClock />
            </span>
          </div>

          <div className="mt-auto max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Network Operations Center</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.1] tracking-tight xl:text-5xl">
              Satu pusat kendali untuk <span className="text-brand-600">operasional</span> NOC.
            </h1>
            <p className="mt-4 text-base text-slate-600">
              Jadwal shift, serah terima, perizinan site, dan progres project tim — semuanya terhubung dalam satu akun.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-3">
              {MODULES.map((m, i) => (
                <div
                  key={m.name}
                  className="animate-fade-up rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
                  style={{ animationDelay: `${150 + i * 90}ms` }}
                >
                  <m.icon className="size-5 text-brand-500" aria-hidden />
                  <p className="mt-3 text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-10 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="size-4" aria-hidden /> Akses khusus karyawan PT Jarvis Integrasi Solusi
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="relative flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-50 to-transparent lg:hidden"
          aria-hidden
        />
        <div className="relative w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
          <p className="mt-10 text-center text-xs text-slate-400">© {new Date().getFullYear()} Jarvis NOC</p>
        </div>
      </main>
    </div>
  );
}
