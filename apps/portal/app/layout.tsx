import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Portal NOC", template: "%s · Portal NOC" },
};

// Semua halaman bergantung pada session user → selalu dinamis.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
