import "server-only";
import { redirect } from "next/navigation";
import { getAuth, type Auth } from "./auth";
import { createClient } from "./server";

/** Redirect kembali dengan pesan error (ditampilkan oleh <Flash /> di halaman). */
export function fail(path: string, message: string): never {
  redirect(withParam(path, "error", message));
}

/** Redirect dengan pesan sukses. */
export function done(path: string, message: string): never {
  redirect(withParam(path, "success", message));
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("success");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Awal setiap server action: pastikan login (+ permission jika diberikan) lalu kembalikan
 * client Supabase. RLS tetap jadi penegak utama; cek ini untuk pesan error yang ramah.
 */
export async function actionContext(
  backTo: string,
  permission?: string,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; auth: Auth }> {
  const auth = await getAuth();
  if (!auth) fail(backTo, "Sesi berakhir, silakan login ulang.");
  if (permission && !auth.can(permission)) fail(backTo, "Anda tidak memiliki izin untuk aksi ini.");
  const supabase = await createClient();
  return { supabase, auth };
}

/** Ambil string dari FormData; "" → null. */
export function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Sama seperti str() tapi wajib ada. */
export function req(form: FormData, key: string, backTo: string, label = key): string {
  const v = str(form, key);
  if (v === null) fail(backTo, `${label} wajib diisi.`);
  return v;
}

export function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Pesan error Postgres/RLS → bahasa manusia. */
export function dbError(error: { message: string; code?: string } | null): string {
  if (!error) return "Terjadi kesalahan.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "Anda tidak memiliki izin untuk aksi ini.";
  if (error.code === "23505") return "Data sudah ada (duplikat).";
  if (error.code === "23503") return "Data masih dipakai atau referensi tidak valid.";
  if (error.code === "23514") return "Data tidak memenuhi aturan validasi.";
  return error.message;
}
