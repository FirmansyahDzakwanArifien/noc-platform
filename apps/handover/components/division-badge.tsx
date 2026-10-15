import { Badge, type Tone } from "@noc/ui";

const TONE: Record<string, Tone> = { NOC: "blue", SOC: "purple" };

/** Badge kecil kode divisi (NOC/SOC). Tidak merender apa pun bila kode kosong. */
export function DivisionBadge({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code) return null;
  return (
    <Badge tone={TONE[code.toUpperCase()] ?? "gray"} className={className}>
      {code}
    </Badge>
  );
}
