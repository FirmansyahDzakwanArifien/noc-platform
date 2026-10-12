"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@noc/supabase/client";
import { ALLOWED_SIGNUP_DOMAINS, isEmailAllowed } from "@noc/supabase/env";
import { Alert, Button, Field, Input } from "@noc/ui";
import { callbackUrl } from "../../../lib/callback-url";

export function SignupForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("full_name")).trim();
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));

    if (!isEmailAllowed(email)) {
      setError(`Pendaftaran hanya untuk email ${ALLOWED_SIGNUP_DOMAINS.map((d) => "@" + d).join(" atau ")}.`);
      return;
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: callbackUrl(next) },
    });
    setLoading(false);
    if (error) {
      setError(/database error/i.test(error.message) ? "Email ini tidak diizinkan untuk mendaftar." : error.message);
      return;
    }
    if (data.session) {
      window.location.href = "/";
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Cek email Anda</h1>
        <p className="text-sm text-slate-600">
          Link verifikasi sudah dikirim ke <span className="font-medium">{sentTo}</span>. Klik link tersebut untuk mengaktifkan akun.
        </p>
        <Link href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Daftar akun</h1>
        <p className="mt-1 text-xs text-slate-500">
          Khusus email {ALLOWED_SIGNUP_DOMAINS.map((d) => "@" + d).join(" / ")}. Role awal: viewer, admin akan menyesuaikan akses Anda.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama lengkap" required>
          <Input name="full_name" required autoComplete="name" />
        </Field>
        <Field label="Email kantor" required>
          <Input name="email" type="email" required autoComplete="email" placeholder="nama@corp.jarvis.biz.id" />
        </Field>
        <Field label="Password" required hint="Minimal 8 karakter.">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Ulangi password" required>
          <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Mendaftarkan…" : "Daftar"}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-500">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
