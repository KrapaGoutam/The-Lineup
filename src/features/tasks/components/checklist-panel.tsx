"use client";

import { Check, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { stepProgress, stepProgressText } from "../domain/task-register";
import type { TaskStepView, TaskView } from "../domain/task-types";

/** "3 of 5 completed" with a bar; the words carry the meaning, color only echoes it. */
export function StepProgressBar({
  task,
  className,
}: {
  task: Pick<TaskView, "steps" | "title">;
  className?: string;
}) {
  const progress = stepProgress(task);
  if (progress.total === 0) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-sm font-semibold tabular-nums">
        {stepProgressText(progress)}
      </p>
      <div
        role="progressbar"
        aria-label={`Checklist progress for ${task.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="bg-muted h-2 overflow-hidden rounded-full"
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

type Props = {
  task: TaskView;
  /** Whether this viewer may tick steps right now (see canTickSteps). */
  canTick: boolean;
  /** Step ids with a request in flight. */
  pendingStepIds?: ReadonlySet<string>;
  onToggle: (step: TaskStepView) => void;
  className?: string;
};

/**
 * A task's checklist: progress, then one large checkbox row per step. Ticking
 * a step never completes the parent task; that stays a deliberate action.
 */
export function ChecklistPanel({
  task,
  canTick,
  pendingStepIds,
  onToggle,
  className,
}: Props) {
  if (task.steps.length === 0) return null;
  return (
    <section
      aria-label={`Checklist for ${task.title}`}
      className={cn("space-y-2.5", className)}
    >
      <StepProgressBar task={task} />
      <ul className="space-y-1.5">
        {task.steps.map((step) => {
          const pending = pendingStepIds?.has(step.id) ?? false;
          return (
            <li key={step.id} className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={step.done}
                aria-label={`${step.done ? "Uncheck" : "Check"}: ${step.title}`}
                aria-busy={pending}
                disabled={!canTick || pending}
                onClick={() => onToggle(step)}
                className={cn(
                  "focus-visible:ring-ring focus-visible:ring-offset-background grid size-11 flex-none place-items-center rounded-xl border-2 transition outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                  step.done
                    ? "border-ok bg-ok text-white"
                    : "border-border bg-surface hover:border-primary",
                  !canTick && !step.done && "opacity-50",
                )}
              >
                {pending ? (
                  <LoaderCircle
                    className="size-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : step.done ? (
                  <Check className="size-6" aria-hidden="true" />
                ) : null}
              </button>
              <div className="min-w-0 flex-1 pt-2.5">
                <span
                  className={cn(
                    "block text-sm leading-snug",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                </span>
                {step.done && step.completedBy ? (
                  <span className="text-muted-foreground block text-xs">
                    Checked by {step.completedBy.name}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
