"use client";

import { useMemo, useState } from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  STATUS_LABELS,
  isMine,
  sortTasks,
  taskBucket,
} from "../domain/task-rules";
import type { TaskStatus, TaskView } from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { TaskList } from "./task-list";

type Filter = "today" | "upcoming" | "overdue" | "completed";
type StatusFilter = "all" | Exclude<TaskStatus, "cancelled" | "completed">;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const EMPTY: Record<Filter, string> = {
  today: "Nothing to do right now. Nice work.",
  upcoming: "No upcoming tasks.",
  overdue: "Nothing is overdue.",
  completed: "No completed tasks in the last two weeks.",
};

type Props = {
  controller: TasksController;
  categoryName: (slug: string) => string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
};

/**
 * Every employee's own list: tasks assigned to them plus work open to the
 * whole team. "Today" is what can be acted on now (today's work and anything
 * overdue); the other chips narrow it.
 */
export function MyTasksView({
  controller,
  categoryName,
  onToggle,
  onOpen,
}: Props) {
  const snapshot = controller.snapshot;
  const [filter, setFilter] = useState<Filter>("today");
  const [status, setStatus] = useState<StatusFilter>("all");

  const mine = useMemo(
    () =>
      snapshot
        ? snapshot.tasks.filter(
            (task) => task.kind === "task" && isMine(controller.viewer, task),
          )
        : [],
    [snapshot, controller.viewer],
  );

  const bucketed = useMemo(() => {
    const groups: Record<Filter, TaskView[]> = {
      today: [],
      upcoming: [],
      overdue: [],
      completed: [],
    };
    if (!snapshot) return groups;
    for (const task of mine) {
      const bucket = taskBucket(task, controller.now, snapshot.today);
      if (bucket === "overdue") {
        groups.overdue.push(task);
        groups.today.push(task);
      } else if (bucket === "today") groups.today.push(task);
      else if (bucket === "upcoming") groups.upcoming.push(task);
      else if (bucket === "completed") {
        groups.completed.push(task);
        // Keep today's finished work on the Today list (faded, at the
        // bottom) so a check-off doesn't make the task vanish.
        if (
          task.completedAt &&
          zonedWallTimeFromInstant(
            new Date(task.completedAt),
            snapshot.timeZone,
          ).date === snapshot.today
        ) {
          groups.today.push(task);
        }
      }
    }
    return groups;
  }, [mine, snapshot, controller.now]);

  if (!snapshot) return null;

  const visible = sortTasks(
    bucketed[filter].filter(
      (task) => status === "all" || task.status === status,
    ),
    controller.now,
    snapshot.today,
  );

  return (
    <section aria-label="My tasks" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Task filter"
          className="flex flex-wrap gap-2"
        >
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "focus-visible:ring-ring min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2",
                filter === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-80">
                {id === "today"
                  ? bucketed.today.filter((t) => t.status !== "completed")
                      .length
                  : bucketed[id].length}
              </span>
            </button>
          ))}
        </div>
        {filter !== "completed" ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status</span>
            <Select
              className="w-auto min-w-36"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
            >
              <option value="all">All</option>
              <option value="open">{STATUS_LABELS.open}</option>
              <option value="in_progress">{STATUS_LABELS.in_progress}</option>
              <option value="blocked">{STATUS_LABELS.blocked}</option>
            </Select>
          </label>
        ) : null}
      </div>

      <TaskList
        tasks={visible}
        controller={controller}
        categoryName={categoryName}
        emptyText={EMPTY[filter]}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    </section>
  );
}
