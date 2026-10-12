import { Badge } from "@noc/ui";
import type { Priority, TaskStatus } from "@noc/supabase/types";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";

// Label status task & prioritas versi aplikasi ini (bahasa Indonesia penuh).
// Status project tetap memakai <StatusBadge> dari @noc/ui.

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUSES.find((x) => x.value === status);
  return <Badge tone={s?.tone ?? "gray"}>{s?.label ?? status}</Badge>;
}

export function PriorityBadge({ priority, prefix }: { priority: Priority; prefix?: boolean }) {
  const p = PRIORITIES.find((x) => x.value === priority);
  return (
    <Badge tone={p?.tone ?? "gray"}>
      {prefix && "Prioritas "}
      {(prefix ? p?.label.toLowerCase() : p?.label) ?? priority}
    </Badge>
  );
}
