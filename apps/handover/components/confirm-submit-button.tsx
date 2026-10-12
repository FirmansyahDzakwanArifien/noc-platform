"use client";

import type { ComponentProps } from "react";
import { SubmitButton } from "@noc/ui";

/** <SubmitButton> yang meminta konfirmasi dulu — untuk aksi yang tidak bisa dibatalkan (hapus). */
export function ConfirmSubmitButton({ confirm: message, ...props }: ComponentProps<typeof SubmitButton> & { confirm: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
