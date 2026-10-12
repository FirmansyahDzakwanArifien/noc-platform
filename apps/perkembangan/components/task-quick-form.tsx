import { Select, SubmitButton } from "@noc/ui";
import type { ProjectTask } from "@noc/supabase/types";
import { quickUpdateTask } from "@/app/(app)/actions";
import { TASK_STATUSES } from "@/lib/constants";

/** Form ringkas: ubah status + progress % sebuah task. */
export function TaskQuickForm({
  task,
  back,
}: {
  task: Pick<ProjectTask, "id" | "status" | "progress_pct">;
  back: string;
}) {
  return (
    <form action={quickUpdateTask} className="flex items-center gap-1.5">
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="prev_status" value={task.status} />
      <Select name="status" defaultValue={task.status} aria-label="Status" className="h-8 w-32 text-xs">
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <input
        type="number"
        name="progress_pct"
        min={0}
        max={100}
        step={1}
        defaultValue={Number(task.progress_pct)}
        aria-label="Progress %"
        className="h-8 w-16 rounded-lg border border-slate-300 bg-white px-2 text-xs tabular-nums shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <span className="text-xs text-slate-400">%</span>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Simpan
      </SubmitButton>
    </form>
  );
}
