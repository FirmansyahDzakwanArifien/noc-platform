import Link from "next/link";
import { buttonClass } from "@noc/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
        <Link href="/" className={buttonClass("secondary", "md", "mt-4")}>
          Kembali
        </Link>
      </div>
    </div>
  );
}
