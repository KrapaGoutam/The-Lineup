"use client";

import {
  Ban,
  Check,
  CircleAlert,
  Flag,
  LoaderCircle,
  Play,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  PRIORITY_LABELS,
  canWorkTask,
  dueText,
  isOverdue,
  taskTypeLabel,
} from "../domain/task-rules";
import type { TaskView, TaskViewer } from "../domain/task-types";
import { isTasksManager } from "../domain/task-types";

type Props = {
  task: TaskView;
  viewer: TaskViewer;
  now: Date;
  today: string;
  pending: boolean;
  categoryName: string;
  /** Show who the task is assigned to (management views). */
  showAssignees?: boolean;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
};

/** A completed task can be un-checked by a manager or whoever checked it. */
export function canToggleTask(task: TaskView, viewer: TaskViewer): boolean {
  if (task.status === "cancelled") return false;
  if (!canWorkTask(viewer, task)) return false;
  if (task.status !== "completed") return true;
  return (
    isTasksManager(viewer.designation) ||
    task.completedBy?.profileId === viewer.profileId
  );
}

function assigneeText(task: TaskView): string {
  if (task.assignmentMode === "all_team") return "All team";
  if (task.assignmentMode === "anyone") return "Anyone";
  return task.assignees.map((a) => a.name).join(", ");
}

/**
 * One task as a large, one-tap row. Status is always carried by text and an
 * icon as well as color (overdue / blocked / in progress / priority).
 */
export function TaskRow({
  task,
  viewer,
  now,
  today,
  pending,
  categoryName,
  showAssignees = false,
  onToggle,
  onOpen,
}: Props) {
  const done = task.status === "completed";
  const cancelled = task.status === "cancelled";
  const overdue = isOverdue(task, now);
  const toggleable = canToggleTask(task, viewer);
  const verb = done ? "Reopen" : "Mark complete";

  return (
    <li
      data-testid="task-row"
      data-task-title={task.title}
      data-status={task.status}
      className={cn(
        "border-border bg-card flex items-start gap-3 rounded-2xl border p-3.5",
        overdue && "border-destructive/50",
        (done || cancelled) && "opacity-75",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${verb}: ${task.title}`}
        aria-busy={pending}
        disabled={!toggleable || pending}
        onClick={() => onToggle(task)}
        className={cn(
          "focus-visible:ring-ring focus-visible:ring-offset-background grid size-11 flex-none place-items-center rounded-xl border-2 transition outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
          done
            ? "border-ok bg-ok text-white"
            : "border-border bg-surface hover:border-primary",
          !toggleable && !done && "opacity-50",
        )}
      >
        {pending ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : done ? (
          <Check className="size-6" aria-hidden="true" />
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onOpen(task)}
        className="focus-visible:ring-ring -m-1 min-w-0 flex-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2"
      >
        <span
          className={cn(
            "block text-[15px] leading-snug font-semibold",
            (done || cancelled) && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {cancelled
            ? "Cancelled"
            : done
              ? `Completed${task.completedBy ? ` by ${task.completedBy.name}` : ""}`
              : dueText(task, today)}
          {" · "}
          {categoryName}
          {showAssignees ? ` · ${assigneeText(task)}` : null}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {overdue ? (
            <Badge tone="danger">
              <CircleAlert className="size-3.5" aria-hidden="true" />
              Overdue
            </Badge>
          ) : null}
          {task.status === "blocked" ? (
            <Badge tone="warning">
              <Ban className="size-3.5" aria-hidden="true" />
              Blocked
            </Badge>
          ) : null}
          {task.status === "in_progress" ? (
            <Badge tone="accent">
              <Play className="size-3.5" aria-hidden="true" />
              In progress
            </Badge>
          ) : null}
          {task.priority !== "normal" && !done && !cancelled ? (
            <Badge tone={task.priority === "urgent" ? "danger" : "warning"}>
              <Flag className="size-3.5" aria-hidden="true" />
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          ) : null}
          {task.kind !== "task" || task.assignmentMode !== "individual" ? (
            <Badge>
              <Users className="size-3.5" aria-hidden="true" />
              {taskTypeLabel(task)}
            </Badge>
          ) : null}
        </span>
        {task.status === "blocked" && task.blockedReason ? (
          <span className="text-warn mt-1.5 block text-xs">
            Blocked: {task.blockedReason}
          </span>
        ) : null}
        {done && task.completionNote ? (
          <span className="text-muted-foreground mt-1.5 block text-xs italic">
            “{task.completionNote}”
          </span>
        ) : null}
      </button>
    </li>
  );
}
