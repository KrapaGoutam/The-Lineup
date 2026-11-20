"use client";

import { useMemo, useState } from "react";
import { Pencil, Search, Trash2, UserRoundPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import {
  QUICK_STATUS_LABELS,
  REGISTER_FILTERS,
  canManageTasks,
  filterRegister,
  hasChecklist,
  quickStatusOf,
  registerCounts,
  registerSummary,
  type QuickStatus,
  type RegisterFilter,
} from "../domain/task-register";
import { STATUS_LABELS, isActiveStatus, sortTasks } from "../domain/task-rules";
import type { TaskView } from "../domain/task-types";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";
import { TaskList } from "./task-list";
import { canToggleTask } from "./task-row";

type Props = {
  controller: TasksController;
  categoryName: (slug: string) => string;
  /** Active organization and branch, when the shell knows them. */
  contextLabel?: string | null;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  onReassign: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
};

/**
 * V2.0.13 All Tasks: one register of every ordinary task the viewer may see,
 * with search, status filters and the common actions on the row itself so a
 * status change or reassignment never needs a trip to a detail page. Who may
 * do what is decided by the database; the controls here only mirror it.
 */
export function AllTasksView({
  controller,
  categoryName,
  contextLabel,
  execute,
  onToggle,
  onOpen,
  onEdit,
  onReassign,
  onDelete,
}: Props) {
  const snapshot = controller.snapshot;
  const [filter, setFilter] = useState<RegisterFilter>("all");
  const [query, setQuery] = useState("");
  const manager = canManageTasks(controller.viewer);

  const all = useMemo(() => snapshot?.tasks ?? [], [snapshot]);
  const counts = useMemo(() => registerCounts(all), [all]);

  if (!snapshot) return null;

  const visible = sortTasks(
    filterRegister(all, filter, query, categoryName),
    controller.now,
    snapshot.today,
  );
  const chips = REGISTER_FILTERS.filter(
    ({ id }) =>
      id === "all" ||
      id === "open" ||
      id === "in_progress" ||
      id === "completed" ||
      counts[id] > 0 ||
      filter === id,
  );
  const filtering = filter !== "all" || query.trim() !== "";

  function setStatus(task: TaskView, status: QuickStatus) {
    void execute(
      status === "completed"
        ? { type: "complete", taskId: task.id }
        : { type: "setStatus", taskId: task.id, status },
    );
  }

  return (
    <section aria-label="All tasks" className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">All Tasks</h2>
        <p className="text-muted-foreground text-sm">
          {contextLabel ? `${contextLabel} · ` : ""}
          <span data-testid="register-summary">
            {registerSummary(all, controller.now)}
          </span>
        </p>
      </header>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search by title, person, category or checklist step"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div
        role="group"
        aria-label="Status filter"
        className="flex flex-wrap gap-2"
      >
        {chips.map(({ id, label }) => (
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
            <span className="ml-1.5 text-xs opacity-80">{counts[id]}</span>
          </button>
        ))}
      </div>

      <TaskList
        tasks={visible}
        controller={controller}
        categoryName={categoryName}
        showAssignees
        showPreview
        emptyText={
          filtering
            ? "No tasks match this search or filter."
            : "No tasks yet. Create one with New task."
        }
        onToggle={onToggle}
        onOpen={onOpen}
        renderFooter={(task) => (
          <RowActions
            task={task}
            controller={controller}
            manager={manager}
            onSetStatus={setStatus}
            onOpen={onOpen}
            onEdit={onEdit}
            onReassign={onReassign}
            onDelete={onDelete}
          />
        )}
      />
    </section>
  );
}

type RowActionsProps = {
  task: TaskView;
  controller: TasksController;
  manager: boolean;
  onSetStatus: (task: TaskView, status: QuickStatus) => void;
  onOpen: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  onReassign: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
};

const touch = "h-11 min-h-11";

function RowActions({
  task,
  controller,
  manager,
  onSetStatus,
  onOpen,
  onEdit,
  onReassign,
  onDelete,
}: RowActionsProps) {
  const pending = controller.pendingIds.has(task.id);
  const current = quickStatusOf(task);
  const canMove = !pending && canToggleTask(task, controller.viewer);
  // Structural actions: managers, on work that is still active (the database
  // refuses to edit or reassign completed or cancelled tasks).
  const active = isActiveStatus(task.status);
  const canEdit = manager && active;
  const canReassign = manager && active;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select
        aria-label={`Status: ${task.title}`}
        className="h-11 w-auto min-w-40"
        value={current ?? task.status}
        disabled={!canMove}
        onChange={(event) =>
          onSetStatus(task, event.target.value as QuickStatus)
        }
      >
        {current === null ? (
          <option value={task.status} disabled>
            {STATUS_LABELS[task.status]}
          </option>
        ) : null}
        {(Object.keys(QUICK_STATUS_LABELS) as QuickStatus[]).map((status) => (
          <option key={status} value={status}>
            {QUICK_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
      {hasChecklist(task) ? (
        <Button
          variant="outline"
          size="sm"
          className={touch}
          aria-label={`Open checklist: ${task.title}`}
          onClick={() => onOpen(task)}
        >
          Checklist
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          className={touch}
          aria-label={`Edit: ${task.title}`}
          onClick={() => onEdit(task)}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      ) : null}
      {canReassign ? (
        <Button
          variant="outline"
          size="sm"
          className={touch}
          aria-label={`Reassign: ${task.title}`}
          onClick={() => onReassign(task)}
        >
          <UserRoundPen aria-hidden="true" />
          Reassign
        </Button>
      ) : null}
      {manager ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn(touch, "text-destructive")}
          aria-label={`Delete: ${task.title}`}
          onClick={() => onDelete(task)}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      ) : null}
    </div>
  );
}
