"use client";

import { SubmitButton } from "@noc/ui";
import type { ComponentProps } from "react";

/** SubmitButton yang meminta konfirmasi browser sebelum aksi destruktif dikirim. */
export function ConfirmSubmit({ confirm: message, ...props }: ComponentProps<typeof SubmitButton> & { confirm: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
