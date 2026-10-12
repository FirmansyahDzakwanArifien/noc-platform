/** Kerangka halaman saat data dimuat (dipakai di app/(app)/loading.tsx). */
export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Memuat">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-12 border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0">
            <div className="h-4 w-1/4 rounded bg-slate-100" />
            <div className="h-4 flex-1 rounded bg-slate-100" />
            <div className="h-4 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
