"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@noc/supabase/client";
import { safeNextUrl } from "@noc/supabase/apps";
import { Alert, Button, Field, Input } from "@noc/ui";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { callbackUrl } from "../../../lib/callback-url";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      setLoading(false);
      setError(error.message === "Invalid login credentials" ? "Email atau password salah." : error.message);
      return;
    }
    // Navigasi penuh: tujuan bisa app lain (subdomain berbeda).
    window.location.href = safeNextUrl(next);
  }

  async function onMagicLink(email: string) {
    if (!email) {
      setError("Isi email terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: false },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setInfo("Link login sudah dikirim. Cek inbox email Anda.");
  }

  async function onGoogle() {
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) {
      setLoading(false);
      setError(error.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Selamat datang kembali</h1>
        <p className="mt-1.5 text-sm text-slate-500">Masuk untuk mengakses seluruh aplikasi Jarvis Ops.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <form onSubmit={onPassword} className="space-y-4" id="login-form">
        <Field label="Email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="nama@corp.jarvis.biz.id"
              className="h-11 pl-10"
            />
          </div>
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Link href="/lupa-password" className="text-xs font-medium text-brand-600 hover:underline">
              Lupa password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="h-11 px-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          className="group h-11 w-full bg-gradient-to-r from-brand-500 to-brand-600 shadow-md shadow-brand-500/15 hover:from-brand-500 hover:to-brand-500"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Memproses…
            </>
          ) : (
            <>
              Masuk <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> atau <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" className="h-11" disabled={loading} onClick={onGoogle}>
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
          </svg>
          Google
        </Button>
        <Button
          variant="secondary"
          className="h-11"
          disabled={loading}
          onClick={() => {
            const el = document.querySelector<HTMLInputElement>('#login-form input[name="email"]');
            void onMagicLink(el?.value.trim() ?? "");
          }}
        >
          <Sparkles className="size-4 text-brand-600" aria-hidden /> Link via email
        </Button>
      </div>

      <p className="text-center text-sm text-slate-500">
        Belum punya akun?{" "}
        <Link href={`/daftar?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-600 hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </div>
  );
}
