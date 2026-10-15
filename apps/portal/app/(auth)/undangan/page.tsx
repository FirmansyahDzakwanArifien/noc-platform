"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createManualClient } from "@noc/supabase/client";
import { Alert, Button, Field, Input } from "@noc/ui";

type State = { step: "loading" } | { step: "error"; message: string } | { step: "form"; email: string; name: string };

/** Tujuan link email undangan: token datang di hash URL (#access_token=…), lalu user membuat password. */
export default function AcceptInvitePage() {
  const supabase = useMemo(() => createManualClient(), []);
  const [state, setState] = useState<State>({ step: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const query = new URLSearchParams(window.location.search);
      const errDesc = hash.get("error_description") ?? query.get("error_description");
      if (errDesc) {
        const expired = /expired|invalid/i.test(errDesc);
        return setState({
          step: "error",
          message: expired ? "Link undangan sudah kedaluwarsa atau sudah dipakai. Minta admin mengirim ulang undangan." : errDesc,
        });
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = query.get("token_hash");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) return setState({ step: "error", message: error.message });
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
        if (error) return setState({ step: "error", message: error.message });
      }
      // Bersihkan token dari address bar.
      window.history.replaceState(null, "", window.location.pathname);

      const { data } = await supabase.auth.getUser();
      if (!data.user) return setState({ step: "error", message: "Link undangan tidak valid. Buka link langsung dari email undangan." });
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      setState({ step: "form", email: data.user.email ?? "", name: (prof as { full_name: string } | null)?.full_name ?? "" });
    })();
  }, [supabase]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("full_name")).trim();
    const password = String(form.get("password"));
    if (!fullName) return setError("Nama lengkap wajib diisi.");
    if (password.length < 8) return setError("Password minimal 8 karakter.");
    if (password !== String(form.get("confirm"))) return setError("Konfirmasi password tidak sama.");

    setSaving(true);
    setError(null);
    const { data, error } = await supabase.auth.updateUser({ password, data: { full_name: fullName } });
    if (error || !data.user) {
      setSaving(false);
      return setError(error?.message ?? "Gagal menyimpan password.");
    }
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
    window.location.replace("/");
  }

  if (state.step === "loading") {
    return <p className="text-sm text-slate-500">Memeriksa undangan…</p>;
  }

  if (state.step === "error") {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Undangan tidak bisa dibuka</h1>
        <Alert tone="error">{state.message}</Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
          Ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Selamat datang 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lengkapi akun <span className="font-medium text-slate-700">{state.email}</span> dengan membuat password.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Nama lengkap">
          <Input name="full_name" defaultValue={state.name} required autoComplete="name" />
        </Field>
        <Field label="Password" hint="Minimal 8 karakter.">
          <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Ulangi password">
          <Input name="confirm" type="password" minLength={8} required autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Menyimpan…" : "Buat password & masuk"}
        </Button>
      </form>
    </div>
  );
}
