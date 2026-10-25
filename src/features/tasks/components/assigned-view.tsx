"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  PRIORITY_LABELS,
  isOverdue,
  personProgress,
  sortTasks,
} from "../domain/task-rules";
import {
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskView,
} from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { TaskList } from "./task-list";

type Scope = "all" | "mine";
type StatusChip =
  | "all"
  | "open"
  | "in_progress"
  | "blocked"
  | "overdue"
  | "completed";
type TypeFilter = "all" | "individual" | "team";

const STATUS_CHIPS: { id: StatusChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

type Props = {
  controller: TasksController;
  categoryName: (slug: string) => string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
};

/**
 * Management review: every normal task the caller may see, filterable by
 * person, date, status, priority, category and type, with a per-person
 * progress roll-up. Individual task state stays the source of truth; the
 * roll-up is only a summary of the same rows.
 */
export function AssignedView({
  controller,
  categoryName,
  onToggle,
  onOpen,
}: Props) {
  const snapshot = controller.snapshot;
  const [scope, setScope] = useState<Scope>("all");
  const [chip, setChip] = useState<StatusChip>("all");
  const [person, setPerson] = useState("");
  const [priority, setPriority] = useState<"" | TaskPriority>("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [dueOn, setDueOn] = useState("");

  const base = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks.filter((task) => {
      if (task.kind !== "task" || task.status === "cancelled") return false;
      if (
        scope === "mine" &&
        task.createdBy?.profileId !== controller.viewer.profileId
      )
        return false;
      if (person && !task.assignees.some((a) => a.profileId === person))
        return false;
      if (priority && task.priority !== priority) return false;
      if (category && task.category !== category) return false;
      if (type === "individual" && task.assignmentMode !== "individual")
        return false;
      if (type === "team" && task.assignmentMode === "individual") return false;
      if (dueOn && task.dueDate !== dueOn) return false;
      return true;
    });
  }, [
    snapshot,
    scope,
    person,
    priority,
    category,
    type,
    dueOn,
    controller.viewer.profileId,
  ]);

  const counts = useMemo(() => {
    const c: Record<StatusChip, number> = {
      all: base.length,
      open: 0,
      in_progress: 0,
      blocked: 0,
      overdue: 0,
      completed: 0,
    };
    for (const task of base) {
      if (task.status === "open") c.open += 1;
      if (task.status === "in_progress") c.in_progress += 1;
      if (task.status === "blocked") c.blocked += 1;
      if (task.status === "completed") c.completed += 1;
      if (isOverdue(task, controller.now)) c.overdue += 1;
    }
    return c;
  }, [base, controller.now]);

  const progress = useMemo(() => personProgress(base), [base]);

  if (!snapshot) return null;

  const visible = sortTasks(
    base.filter((task) => {
      if (chip === "all") return true;
      if (chip === "overdue") return isOverdue(task, controller.now);
      return task.status === chip;
    }),
    controller.now,
    snapshot.today,
  );

  return (
    <section aria-label="Assigned tasks" className="space-y-4">
      <div role="group" aria-label="Scope" className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All team tasks"],
            ["mine", "Assigned by me"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-xl border px-4 text-sm font-semibold outline-none focus-visible:ring-2",
              scope === id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-surface",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
        <label className="space-y-1 text-xs font-medium">
          Person
          <Select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {snapshot.team.map((m) => (
              <option key={m.profileId} value={m.profileId}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Priority
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "" | TaskPriority)}
          >
            <option value="">Any</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Category
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Any</option>
            {snapshot.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Type
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
          >
            <option value="all">Any</option>
            <option value="individual">Individual</option>
            <option value="team">Team</option>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Due on
          <Input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </label>
      </div>

      {progress.length > 0 ? (
        <section
          aria-label="Progress by person"
          className="border-border bg-card rounded-2xl border p-3.5"
        >
          <h2 className="mb-2 text-sm font-semibold">Progress</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {progress.map((row) => (
              <li
                key={row.profileId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{row.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.done} / {row.total} complete
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        role="group"
        aria-label="Status filter"
        className="flex flex-wrap gap-2"
      >
        {STATUS_CHIPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={chip === id}
            onClick={() => setChip(id)}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2",
              chip === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground",
            )}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-80">{counts[id]}</span>
          </button>
        ))}
      </div>

      <TaskList
        tasks={visible}
        controller={controller}
        categoryName={categoryName}
        showAssignees
        emptyText="No tasks match these filters."
        onToggle={onToggle}
        onOpen={onOpen}
      />
    </section>
  );
}
