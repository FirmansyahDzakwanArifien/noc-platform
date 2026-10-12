import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Satu .env.local di root repo dipakai semua app.
const here = dirname(fileURLToPath(import.meta.url));
// forceReload: Next sudah memuat env dari folder app lebih dulu dan menyimpan cache-nya.
nextEnv.loadEnvConfig(resolve(here, "../.."), process.env.NODE_ENV !== "production", console, true);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@noc/ui", "@noc/supabase"],
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: resolve(here, "../.."),
};

export default nextConfig;
