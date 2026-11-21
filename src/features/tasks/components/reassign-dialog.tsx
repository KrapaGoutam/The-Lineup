"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import type { TaskCommand } from "../domain/task-commands";
import type {
  AssignmentMode,
  TaskTeamMember,
  TaskView,
} from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";

type Props = {
  task: TaskView;
  /** Only people who may be assigned at this location (server-provided). */
  team: readonly TaskTeamMember[];
  run: (command: TaskCommand) => Promise<TaskRunResult>;
  onClose: () => void;
};

/**
 * Assign an unassigned task, move it to someone else, or open it to the whole
 * team / anyone eligible (the "unassigned" modes). The picker offers only the
 * location's eligible people and the database re-checks every choice.
 */
export function ReassignDialog({ task, team, run, onClose }: Props) {
  const [mode, setMode] = useState<AssignmentMode>(task.assignmentMode);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees.map((a) => a.profileId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run({
      type: "assign",
      taskId: task.id,
      assignmentMode: mode,
      assigneeIds,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reassign task"
      description={task.title}
      className="max-w-[min(94vw,32rem)] sm:w-[min(94vw,32rem)]"
    >
      <div className="space-y-3">
        <AssigneePicker
          idPrefix="reassign-dialog"
          mode={mode}
          onModeChange={setMode}
          assigneeIds={assigneeIds}
          onAssigneeIdsChange={setAssigneeIds}
          team={team}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save assignment"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
