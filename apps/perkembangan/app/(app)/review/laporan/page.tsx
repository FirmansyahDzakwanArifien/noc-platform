import { redirect } from "next/navigation";

// Laporan lama (bisa dilihat yang dinilai) diganti halaman Hasil yang hanya untuk admin & supervisor.
export default async function LegacyReportPage({ searchParams }: { searchParams: Promise<{ bulan?: string; user?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.bulan) q.set("bulan", sp.bulan);
  redirect(sp.user ? `/review/hasil/${sp.user}?${q}` : `/review?${q}`);
}
