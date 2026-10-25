"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatBusinessDateTime } from "@/lib/date-time";

import type { TaskCommand } from "../domain/task-commands";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  canWorkTask,
  dueText,
  isActiveStatus,
  isOverdue,
  taskTypeLabel,
} from "../domain/task-rules";
import {
  isTasksManager,
  type AssignmentMode,
  type TaskEventView,
  type TaskTeamMember,
  type TaskView,
  type TaskViewer,
} from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";
import { canToggleTask } from "./task-row";

type Props = {
  task: TaskView;
  viewer: TaskViewer;
  now: Date;
  today: string;
  timeZone: string;
  categoryName: string;
  events: readonly TaskEventView[];
  team: readonly TaskTeamMember[];
  onClose: () => void;
  onEdit: (task: TaskView) => void;
  run: (command: TaskCommand) => Promise<TaskRunResult>;
};

type Panel = null | "complete" | "block" | "reassign" | "cancel";

const textareaClass =
  "border-input bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 min-h-20 w-full rounded-xl border px-3 py-2.5 text-sm transition outline-none focus-visible:ring-2";

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  assigned: "Assigned",
  reassigned: "Reassigned",
  edited: "Edited",
  started: "Started",
  blocked: "Blocked",
  unblocked: "Unblocked",
  completed: "Completed",
  reopened: "Reopened",
  cancelled: "Cancelled",
  carried_forward: "Carried forward",
  recurrence_created: "Recurrence created",
  recurrence_changed: "Recurrence changed",
  checklist_generated: "Checklist generated",
};

function eventDetail(
  event: TaskEventView,
  nameOf: (id: string) => string,
): string | null {
  const p = event.payload;
  const names = (value: unknown) =>
    Array.isArray(value) && value.length > 0
      ? value.map((id) => nameOf(String(id))).join(", ")
      : "nobody named";
  switch (event.type) {
    case "created":
      return `Assigned to ${names(p.assignees)}`;
    case "reassigned": {
      const to = p.to as { assignees?: unknown } | undefined;
      return `Now assigned to ${names(to?.assignees)}`;
    }
    case "completed":
      return (
        [
          p.on_behalf ? "Completed on behalf of the assignee" : null,
          p.note ? `Note: ${String(p.note)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null
      );
    case "blocked":
      return p.reason ? `Reason: ${String(p.reason)}` : null;
    case "carried_forward":
      return `Due ${String(p.from_due_date ?? "—")} → ${String(p.to_due_date)}`;
    case "cancelled":
      return p.reason ? `Reason: ${String(p.reason)}` : null;
    case "edited": {
      const after = (p.after ?? {}) as Record<string, unknown>;
      const before = (p.before ?? {}) as Record<string, unknown>;
      const changed = Object.keys(after).filter(
        (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
      );
      return changed.length ? `Changed: ${changed.join(", ")}` : null;
    }
    default:
      return null;
  }
}

/**
 * Everything about one task. Operational actions (start, block, complete,
 * reopen) appear for anyone who may work the task; edit, reassign, cancel and
 * the audit timeline appear for manager+ only -- and the database enforces
 * the same split, so hiding a control is never the security boundary.
 */
export function TaskDetailDialog({
  task,
  viewer,
  now,
  today,
  timeZone,
  categoryName,
  events,
  team,
  onClose,
  onEdit,
  run,
}: Props) {
  const manager = isTasksManager(viewer.designation);
  const active = isActiveStatus(task.status);
  const canWork = canWorkTask(viewer, task);
  const overdue = isOverdue(task, now);

  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<AssignmentMode>(task.assignmentMode);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees.map((a) => a.profileId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(command: TaskCommand, closeAfter = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run(command);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPanel(null);
    setNote("");
    setReason("");
    if (closeAfter) onClose();
  }

  const nameOf = (id: string) =>
    team.find((m) => m.profileId === id)?.name ??
    task.assignees.find((a) => a.profileId === id)?.name ??
    (id === viewer.profileId ? viewer.name : "Team member");

  const assignedTo =
    task.assignmentMode === "all_team"
      ? "All team"
      : task.assignmentMode === "anyone"
        ? "Anyone eligible"
        : task.assignees.map((a) => a.name).join(", ") || "Nobody";

  const history = [...events].filter((e) => e.taskId === task.id).reverse();

  return (
    <Dialog
      open
      onClose={onClose}
      title={task.title}
      description={`${taskTypeLabel(task)} task · ${categoryName}`}
      className="max-w-[min(94vw,38rem)] sm:w-[min(94vw,38rem)]"
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={task.status === "completed" ? "success" : "neutral"}>
          {STATUS_LABELS[task.status]}
        </Badge>
        {overdue ? <Badge tone="danger">Overdue</Badge> : null}
        {task.priority !== "normal" ? (
          <Badge tone={task.priority === "urgent" ? "danger" : "warning"}>
            {PRIORITY_LABELS[task.priority]} priority
          </Badge>
        ) : null}
      </div>

      {task.instructions ? (
        <p className="bg-muted/50 rounded-xl p-3 text-sm whitespace-pre-wrap">
          {task.instructions}
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Due</dt>
        <dd>{dueText(task, today)}</dd>
        <dt className="text-muted-foreground">Assigned to</dt>
        <dd>{assignedTo}</dd>
        {task.status === "blocked" && task.blockedReason ? (
          <>
            <dt className="text-muted-foreground">Blocked</dt>
            <dd>{task.blockedReason}</dd>
          </>
        ) : null}
        {task.completedBy ? (
          <>
            <dt className="text-muted-foreground">Completed by</dt>
            <dd>
              {task.completedBy.name}
              {task.completedAt
                ? ` · ${formatBusinessDateTime(task.completedAt, timeZone)}`
                : ""}
            </dd>
          </>
        ) : null}
        {task.completionNote ? (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd>{task.completionNote}</dd>
          </>
        ) : null}
        {task.createdBy ? (
          <>
            <dt className="text-muted-foreground">Created by</dt>
            <dd>{task.createdBy.name}</dd>
          </>
        ) : null}
      </dl>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {canWork && active && panel === null ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setPanel("complete")}>
            Complete with note…
          </Button>
          {task.status === "open" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act({
                  type: "setStatus",
                  taskId: task.id,
                  status: "in_progress",
                })
              }
            >
              Start
            </Button>
          ) : null}
          {task.status === "blocked" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act({ type: "setStatus", taskId: task.id, status: "open" })
              }
            >
              Unblock
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPanel("block")}
            >
              Block…
            </Button>
          )}
        </div>
      ) : null}

      {task.status === "completed" && canToggleTask(task, viewer) ? (
        <div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void act({ type: "reopen", taskId: task.id })}
          >
            Reopen
          </Button>
        </div>
      ) : null}

      {panel === "complete" ? (
        <div className="space-y-2">
          <Label htmlFor="task-note">Completion note (optional)</Label>
          <textarea
            id="task-note"
            className={textareaClass}
            value={note}
            maxLength={500}
            autoFocus
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. One patio heater needs maintenance"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act(
                  {
                    type: "complete",
                    taskId: task.id,
                    note: note.trim() || null,
                  },
                  true,
                )
              }
            >
              Mark complete
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "block" ? (
        <div className="space-y-2">
          <Label htmlFor="task-block-reason">What is blocking it?</Label>
          <textarea
            id="task-block-reason"
            className={textareaClass}
            value={reason}
            maxLength={300}
            autoFocus
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Back
            </Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={() =>
                void act({
                  type: "setStatus",
                  taskId: task.id,
                  status: "blocked",
                  reason: reason.trim(),
                })
              }
            >
              Mark blocked
            </Button>
          </div>
        </div>
      ) : null}

      {manager && active && panel === null ? (
        <div className="border-border flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => onEdit(task)}>
            Edit
          </Button>
          <Button variant="outline" onClick={() => setPanel("reassign")}>
            Reassign…
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setPanel("cancel")}
          >
            Cancel task…
          </Button>
        </div>
      ) : null}

      {panel === "reassign" ? (
        <div className="space-y-3">
          <AssigneePicker
            idPrefix="reassign"
            mode={mode}
            onModeChange={setMode}
            assigneeIds={assigneeIds}
            onAssigneeIdsChange={setAssigneeIds}
            team={team}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act({
                  type: "assign",
                  taskId: task.id,
                  assignmentMode: mode,
                  assigneeIds,
                })
              }
            >
              Save assignment
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="space-y-2">
          <Label htmlFor="task-cancel-reason">Reason (optional)</Label>
          <textarea
            id="task-cancel-reason"
            className={textareaClass}
            value={reason}
            maxLength={300}
            autoFocus
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Keep task
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={busy}
              onClick={() =>
                void act(
                  {
                    type: "cancel",
                    taskId: task.id,
                    reason: reason.trim() || null,
                  },
                  true,
                )
              }
            >
              Cancel task
            </Button>
          </div>
        </div>
      ) : null}

      {manager ? (
        <section
          aria-label="Task history"
          className="border-border space-y-2 border-t pt-3"
        >
          <h3 className="text-sm font-semibold">History</h3>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet.</p>
          ) : (
            <ol className="space-y-2">
              {history.map((event) => {
                const detail = eventDetail(event, nameOf);
                return (
                  <li key={event.id} className="text-sm">
                    <span className="font-medium">
                      {EVENT_LABELS[event.type] ?? event.type}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {event.actor?.name ?? "System"} ·{" "}
                      {formatBusinessDateTime(event.createdAt, timeZone)}
                    </span>
                    {detail ? (
                      <span className="text-muted-foreground block text-xs">
                        {detail}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : null}
    </Dialog>
  );
}
