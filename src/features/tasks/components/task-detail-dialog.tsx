"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatBusinessDateTime } from "@/lib/date-time";

import type { TaskCommand } from "../domain/task-commands";
import { recurrenceSummary } from "../domain/recurrence";
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
  type RecurrenceRuleView,
  type TaskEventView,
  type TaskTeamMember,
  type TaskView,
  type TaskViewer,
} from "../domain/task-types";
import {
  QUICK_STATUS_LABELS,
  canTickSteps,
  quickStatusOf,
  type QuickStatus,
} from "../domain/task-register";
import { useStepToggle } from "../hooks/use-step-toggle";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";
import { ChecklistPanel } from "./checklist-panel";
import { DeleteTaskPanel } from "./delete-task-dialog";
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
  series?: RecurrenceRuleView;
  onEdit: (task: TaskView) => void;
  onEditSeries?: (series: RecurrenceRuleView) => void;
  run: (command: TaskCommand) => Promise<TaskRunResult>;
};

type Panel = null | "complete" | "block" | "reassign" | "cancel" | "delete";

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
  status_changed: "Status changed",
  checklist_edited: "Checklist edited",
  checklist_step_checked: "Step checked",
  checklist_step_unchecked: "Step unchecked",
  archived: "Archived",
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
    case "archived":
      return p.reason ? `Reason: ${String(p.reason)}` : null;
    case "status_changed":
      return `${String(p.from)} → ${String(p.to)}`;
    case "checklist_edited":
      return `${String(p.steps ?? 0)} steps`;
    case "checklist_step_checked":
    case "checklist_step_unchecked":
      return p.title ? String(p.title) : null;
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
  series,
  onEdit,
  onEditSeries,
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
  const { pendingStepIds, toggleStep } = useStepToggle(run);
  const quick = quickStatusOf(task);
  const canMove = canToggleTask(task, viewer);

  function moveTo(status: QuickStatus) {
    if (status === quick) return;
    void act(
      status === "completed"
        ? { type: "complete", taskId: task.id }
        : { type: "setStatus", taskId: task.id, status },
    );
  }

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
        {series ? (
          <>
            <dt className="text-muted-foreground">Repeats</dt>
            <dd>{recurrenceSummary(series)}</dd>
          </>
        ) : null}
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

      {canMove ? (
        <div
          role="group"
          aria-label="Task status"
          className="flex flex-wrap gap-1.5"
        >
          {(Object.keys(QUICK_STATUS_LABELS) as QuickStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={quick === status}
              disabled={busy}
              onClick={() => moveTo(status)}
              className={cn(
                "focus-visible:ring-ring min-h-11 rounded-xl border px-4 text-sm font-semibold outline-none focus-visible:ring-2 disabled:opacity-50",
                quick === status
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {QUICK_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      ) : null}

      <ChecklistPanel
        task={task}
        canTick={canTickSteps(task, viewer)}
        pendingStepIds={pendingStepIds}
        onToggle={(step) => void toggleStep(task, step)}
      />

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

      {manager && task.kind === "task" && panel === null ? (
        <div className="border-border flex flex-wrap gap-2 border-t pt-3">
          {active ? (
            <>
              <Button variant="outline" onClick={() => onEdit(task)}>
                {series ? "Edit this occurrence" : "Edit"}
              </Button>
              {series && onEditSeries ? (
                <Button variant="outline" onClick={() => onEditSeries(series)}>
                  Edit series…
                </Button>
              ) : null}
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
            </>
          ) : null}
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setPanel("delete")}
          >
            Delete…
          </Button>
        </div>
      ) : null}

      {panel === "delete" ? (
        <DeleteTaskPanel
          task={task}
          run={run}
          onCancel={() => setPanel(null)}
          onDone={onClose}
        />
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
