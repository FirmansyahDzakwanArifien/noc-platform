"use client";

import { useState } from "react";
import { buttonClass } from "@noc/ui";
import { Check, Copy } from "lucide-react";

/** Salin teks (URL share) ke clipboard, dengan umpan balik singkat. */
export function CopyButton({ text, label = "Salin link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(copied ? "secondary" : "primary", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Salin link ini:", text);
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Tersalin" : label}
    </button>
  );
}
