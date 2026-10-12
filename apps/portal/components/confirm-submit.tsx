"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@noc/ui";

/** Tombol submit yang meminta konfirmasi dulu (untuk aksi hapus). */
export function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("ghost", "sm", className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
