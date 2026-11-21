"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import {
  canManageTasks,
  canTickSteps,
  hasChecklist,
  matchesQuery,
  stepProgress,
} from "../domain/task-register";
import {
  STATUS_LABELS,
  isActiveStatus,
  staffLabel,
} from "../domain/task-rules";
import type { TaskView } from "../domain/task-types";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";
import { useStepToggle } from "../hooks/use-step-toggle";
import { ChecklistPanel } from "./checklist-panel";

type Filter = "all" | "in_progress" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Not finished" },
  { id: "done", label: "All steps checked" },
];

type Props = {
  controller: TasksController;
  categoryName: (slug: string) => string;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
  onOpen: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  /** Start a new checklist-enabled task. */
  onNew: () => void;
};

/**
 * V2.0.13 Checklists: every ordinary task that carries checklist steps, with
 * its progress and the steps themselves so a step can be ticked without
 * opening anything. A checklist is always a task, so it always has an owner,
 * a location and an audit trail. (Opening / Closing days live in their own tabs.)
 */
export function ChecklistsView({
  controller,
  categoryName,
  execute,
  onOpen,
  onEdit,
  onNew,
}: Props) {
  const snapshot = controller.snapshot;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { pendingStepIds, toggleStep } = useStepToggle(execute);
  const manager = canManageTasks(controller.viewer);

  const withSteps = useMemo(
    () =>
      (snapshot?.tasks ?? []).filter(
        (task) => hasChecklist(task) && task.status !== "cancelled",
      ),
    [snapshot],
  );

  if (!snapshot) return null;

  const visible = withSteps
    .filter((task) => matchesQuery(task, query, categoryName))
    .filter((task) => {
      const progress = stepProgress(task);
      if (filter === "done") return progress.done === progress.total;
      if (filter === "in_progress") return progress.done < progress.total;
      return true;
    });

  return (
    <section aria-label="Checklists" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Checklists</h2>
          <p className="text-muted-foreground text-sm">
            Tasks with steps to tick off. Checking every step does not complete
            the task; that stays your call.
          </p>
        </div>
        {manager ? (
          <Button variant="outline" onClick={onNew}>
            <Plus aria-hidden="true" />
            New checklist
          </Button>
        ) : null}
      </header>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label="Search checklists"
          placeholder="Search by checklist, person or step"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div
        role="group"
        aria-label="Checklist filter"
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
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
          {withSteps.length === 0
            ? "No checklists yet. Create one with New checklist, or add steps to any task."
            : "No checklists match this search or filter."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((task) => (
            <li
              key={task.id}
              data-testid="checklist-card"
              data-task-title={task.title}
              className="border-border bg-card space-y-3 rounded-2xl border p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[15px] leading-snug font-semibold">
                    {task.title}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {categoryName(task.category)}
                    {staffLabel(task) ? ` · ${staffLabel(task)}` : ""}
                  </p>
                </div>
                <Badge
                  tone={task.status === "completed" ? "success" : "neutral"}
                >
                  {STATUS_LABELS[task.status]}
                </Badge>
              </div>
              <ChecklistPanel
                task={task}
                canTick={canTickSteps(task, controller.viewer)}
                pendingStepIds={pendingStepIds}
                onToggle={(step) => void toggleStep(task, step)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 min-h-11"
                  aria-label={`Open task: ${task.title}`}
                  onClick={() => onOpen(task)}
                >
                  Open task
                </Button>
                {manager && isActiveStatus(task.status) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 min-h-11"
                    aria-label={`Edit steps: ${task.title}`}
                    onClick={() => onEdit(task)}
                  >
                    <Pencil aria-hidden="true" />
                    Edit steps
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
