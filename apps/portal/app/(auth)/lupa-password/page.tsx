"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@noc/supabase/client";
import { Alert, Button, Field, Input } from "@noc/ui";
import { callbackUrl } from "../../../lib/callback-url";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/profil?reset=1"),
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Lupa password</h1>
      {sent ? (
        <Alert tone="success">Jika email terdaftar, link untuk mengatur ulang password sudah dikirim.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email">
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Mengirim…" : "Kirim link reset"}
          </Button>
        </form>
      )}
      <Link href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
        Kembali ke halaman masuk
      </Link>
    </div>
  );
}
