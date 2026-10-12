"use client";

import { SubmitButton } from "@noc/ui";
import type { ComponentProps } from "react";

/** SubmitButton yang meminta konfirmasi sebelum form dikirim. */
export function ConfirmSubmit({ confirm, ...props }: ComponentProps<typeof SubmitButton> & { confirm: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    />
  );
}
