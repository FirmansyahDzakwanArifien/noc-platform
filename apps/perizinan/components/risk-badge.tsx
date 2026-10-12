import { Badge } from "@noc/ui";
import type { Priority } from "@noc/supabase/types";
import { RISK_LEVELS, RISK_TONES } from "@/lib/labels";

export function RiskBadge({ level }: { level: Priority }) {
  return <Badge tone={RISK_TONES[level] ?? "gray"}>Risiko {(RISK_LEVELS[level] ?? level).toLowerCase()}</Badge>;
}
