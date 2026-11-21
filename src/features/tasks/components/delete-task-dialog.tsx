"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import type { TaskCommand } from "../domain/task-commands";
import type { TaskView } from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";

type PanelProps = {
  task: TaskView;
  run: (command: TaskCommand) => Promise<TaskRunResult>;
  onCancel: () => void;
  /** Called after the database accepted the delete (or archive). */
  onDone: () => void;
};

/**
 * The explicit confirmation for removing a task. A task nobody has touched is
 * deleted for good; anything with history is archived instead, so the audit
 * trail and checklist record survive. The database decides which; this copy
 * only tells the person what to expect.
 */
export function DeleteTaskPanel({ task, run, onCancel, onDone }: PanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run({ type: "delete", taskId: task.id });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <div className="space-y-3" role="group" aria-label="Confirm delete">
      <p className="text-sm">
        Delete <strong>{task.title}</strong>? A task that was never worked on is
        removed permanently. A task with any history (progress, completion,
        reassignment or checklist activity) is <strong>archived instead</strong>
        : it leaves the active list but its record is kept.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Keep task
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete task"}
        </Button>
      </div>
    </div>
  );
}

type DialogProps = {
  task: TaskView;
  run: (command: TaskCommand) => Promise<TaskRunResult>;
  onClose: () => void;
};

export function DeleteTaskDialog({ task, run, onClose }: DialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete task"
      className="max-w-[min(94vw,30rem)] sm:w-[min(94vw,30rem)]"
    >
      <DeleteTaskPanel
        task={task}
        run={run}
        onCancel={onClose}
        onDone={onClose}
      />
    </Dialog>
  );
}
