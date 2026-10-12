"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@noc/supabase/client";
import { safeNextUrl } from "@noc/supabase/apps";
import { Alert, Button, Field, Input } from "@noc/ui";
import { callbackUrl } from "../../../lib/callback-url";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
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
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-slate-900">Masuk</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <form onSubmit={onPassword} className="space-y-4" id="login-form">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required placeholder="nama@corp.jarvis.biz.id" />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link href="/lupa-password" className="text-xs font-medium text-brand-600 hover:underline">
            Lupa password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Memproses…" : "Masuk"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> atau <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-2">
        <Button variant="secondary" className="w-full" disabled={loading} onClick={onGoogle}>
          Masuk dengan Google
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={loading}
          onClick={() => {
            const el = document.querySelector<HTMLInputElement>('#login-form input[name="email"]');
            void onMagicLink(el?.value.trim() ?? "");
          }}
        >
          Kirim link login ke email
        </Button>
      </div>

      <p className="text-center text-sm text-slate-500">
        Belum punya akun?{" "}
        <Link href={`/daftar?next=${encodeURIComponent(next)}`} className="font-medium text-brand-600 hover:underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
