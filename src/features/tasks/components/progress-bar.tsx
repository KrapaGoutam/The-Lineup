import { cn } from "@/lib/utils";

import type { Progress } from "../domain/task-rules";

/** Simple completion bar; the numbers carry the meaning, color only echoes it. */
export function ProgressBar({
  progress,
  label,
  className,
}: {
  progress: Progress;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold tabular-nums">
          {progress.done} / {progress.total} complete
        </span>
        <span className="text-muted-foreground tabular-nums">
          {progress.percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="bg-muted h-2.5 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] motion-reduce:transition-none",
            progress.percent === 100 ? "bg-ok" : "bg-primary",
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}
