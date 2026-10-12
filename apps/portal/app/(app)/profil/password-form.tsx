"use client";

import { useState } from "react";
import { createClient } from "@noc/supabase/client";
import { Alert, Button, Field, Input } from "@noc/ui";

export function PasswordForm() {
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const password = String(form.get("password"));
    if (password.length < 8) return setMsg({ tone: "error", text: "Password minimal 8 karakter." });
    if (password !== String(form.get("confirm"))) return setMsg({ tone: "error", text: "Konfirmasi password tidak sama." });

    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) setMsg({ tone: "error", text: error.message });
    else {
      formEl.reset();
      setMsg({ tone: "success", text: "Password berhasil diganti." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {msg && (
        <Alert tone={msg.tone} className="sm:col-span-2">
          {msg.text}
        </Alert>
      )}
      <Field label="Password baru">
        <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
      </Field>
      <Field label="Ulangi password baru">
        <Input name="confirm" type="password" minLength={8} required autoComplete="new-password" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Menyimpan…" : "Ganti password"}
        </Button>
      </div>
    </form>
  );
}
