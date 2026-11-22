"use client";

import { useCallback, useState } from "react";

import type { TaskCommand } from "../domain/task-commands";
import type { TaskStepView, TaskView } from "../domain/task-types";
import type { TaskRunResult } from "./use-tasks-controller";

/**
 * Ticks / unticks one checklist step through the shared command runner and
 * tracks which steps have a request in flight, so a single step shows its own
 * spinner instead of freezing the whole task.
 */
export function useStepToggle(
  execute: (command: TaskCommand) => Promise<TaskRunResult>,
) {
  const [pendingStepIds, setPending] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleStep = useCallback(
    async (task: TaskView, step: TaskStepView) => {
      setPending((current) => new Set([...current, step.id]));
      try {
        await execute({
          type: "stepSet",
          taskId: task.id,
          stepId: step.id,
          done: !step.done,
        });
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(step.id);
          return next;
        });
      }
    },
    [execute],
  );

  return { pendingStepIds, toggleStep };
}
