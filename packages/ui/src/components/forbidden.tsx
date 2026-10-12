import { ShieldX } from "lucide-react";

export function Forbidden({ message = "Anda tidak memiliki akses ke halaman ini." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <ShieldX className="size-10 text-slate-400" aria-hidden />
      <p className="mt-3 font-medium text-slate-900">Akses ditolak</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message} Hubungi admin atau supervisor jika Anda membutuhkan akses.</p>
    </div>
  );
}
