"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** Tombol submit yang otomatis disabled + teks loading selama server action berjalan. */
export function SubmitButton({ children, pendingText = "Menyimpan…", ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? pendingText : children}
    </Button>
  );
}
