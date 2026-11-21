import { canWorkTask, isOverdue } from "./task-rules";
import {
  isTasksManager,
  type TaskStatus,
  type TaskView,
  type TaskViewer,
} from "./task-types";

/**
 * V2.0.13 All Tasks / Checklists register logic. Pure: the same rules run in
 * demo mode and against the database snapshot, and the database (not this
 * file) remains the authority on who may change what.
 */

export type RegisterFilter = "all" | TaskStatus;

/** Display order of the register's status chips. `open` is shown as "Not Started". */
export const REGISTER_FILTERS: { id: RegisterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export type StepProgress = { done: number; total: number; percent: number };

export function stepProgress(task: Pick<TaskView, "steps">): StepProgress {
  const total = task.steps.length;
  const done = task.steps.filter((step) => step.done).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function hasChecklist(task: Pick<TaskView, "steps">): boolean {
  return task.steps.length > 0;
}

/** "3 of 5 completed" */
export function stepProgressText(progress: StepProgress): string {
  return `${progress.done} of ${progress.total} completed`;
}

/** Steps can be ticked while the task is still open work, by anyone who may work it. */
export function canTickSteps(task: TaskView, viewer: TaskViewer): boolean {
  if (task.status === "completed" || task.status === "cancelled") return false;
  return canWorkTask(viewer, task);
}

/** Case-insensitive match over everything a person would search a task by. */
export function matchesQuery(
  task: TaskView,
  query: string,
  categoryName: (slug: string) => string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    task.title,
    task.instructions ?? "",
    categoryName(task.category),
    ...task.assignees.map((a) => a.name),
    ...task.steps.map((s) => s.title),
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

export function registerCounts(
  tasks: readonly TaskView[],
): Record<RegisterFilter, number> {
  const counts: Record<RegisterFilter, number> = {
    all: tasks.length,
    open: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

export function filterRegister(
  tasks: readonly TaskView[],
  filter: RegisterFilter,
  query: string,
  categoryName: (slug: string) => string,
): TaskView[] {
  return tasks.filter(
    (task) =>
      (filter === "all" || task.status === filter) &&
      matchesQuery(task, query, categoryName),
  );
}

/** "12 tasks · 3 in progress · 2 overdue" */
export function registerSummary(tasks: readonly TaskView[], now: Date): string {
  const counts = registerCounts(tasks);
  const overdue = tasks.filter((task) => isOverdue(task, now)).length;
  const parts = [`${counts.all} ${counts.all === 1 ? "task" : "tasks"}`];
  if (counts.in_progress > 0) parts.push(`${counts.in_progress} in progress`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.join(" · ");
}

/** Only managers get structural actions; the database enforces the same. */
export function canManageTasks(viewer: TaskViewer): boolean {
  return isTasksManager(viewer.designation);
}

/** The status a quick control may move a task to, or null when it may not move. */
export type QuickStatus = "open" | "in_progress" | "completed";

export const QUICK_STATUS_LABELS: Record<QuickStatus, string> = {
  open: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
};

export function quickStatusOf(task: TaskView): QuickStatus | null {
  if (task.status === "open") return "open";
  if (task.status === "in_progress") return "in_progress";
  if (task.status === "completed") return "completed";
  return null;
}
