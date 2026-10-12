export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">NOC</span>
          <p className="mt-3 text-lg font-semibold text-slate-900">NOC Platform</p>
          <p className="text-sm text-slate-500">Jadwal · Handover · Perizinan · Perkembangan</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
