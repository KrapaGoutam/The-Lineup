import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { monthLabel } from "./task-history";
import { STATUS_LABELS } from "./task-rules";
import {
  RUN_STATUS_LABELS,
  type ChoreRunSummary,
  type RunStatus,
} from "./chore-types";
import type { TaskStatus, TaskView } from "./task-types";

/**
 * V2.0.13 Batch C: the unified Tasks -> History feed. Ordinary tasks and chore-wheel
 * runs are different records; this module only decides how they are GROUPED and
 * FILTERED, never what they mean:
 *
 *  - Month: a COMPLETED task by the location-local month it was completed; a task
 *    that is NOT completed by the month of its due date (or, with no due date, the
 *    month it was created). A chore run by the month of its business day (see the
 *    Batch C migration: the scheduled day for daily / weekly runs, otherwise the day
 *    it closed; an in-progress run by the day it opened).
 *  - Completed / Not completed: a task is Completed only when its status is
 *    Completed. Not Started, In Progress, Blocked and Cancelled are all Not
 *    Completed and keep their own label. A run is Completed only when it closed
 *    as completed; in-progress, cancelled and expired runs are Not Completed.
 */

export type HistoryScope = "all" | "tasks" | "chores";
export const HISTORY_SCOPE_LABELS: Record<HistoryScope, string> = {
  all: "All",
  tasks: "Tasks",
  chores: "Chore Wheel",
};

/** A task as History loads it: the full task (so the same dialogs and actions work) plus context. */
export type FeedTask = {
  task: TaskView;
  /** Earliest assignment instant; null when nobody was named. */
  assignedAt: string | null;
  /** Archived tasks leave the active register; History keeps the completed ones. */
  archived: boolean;
};

export type TaskMonthBasis = "completed" | "due" | "created";

export type HistoryItem =
  | {
      source: "task";
      id: string;
      completed: boolean;
      /** "YYYY-MM" */
      month: string;
      basis: TaskMonthBasis;
      /** Location-local calendar day the month comes from. */
      basisDate: string;
      /** ISO instant used to order within a group. */
      stamp: string;
      entry: FeedTask;
    }
  | {
      source: "chore";
      id: string;
      completed: boolean;
      month: string;
      basisDate: string;
      stamp: string;
      run: ChoreRunSummary;
    };

export function taskMonthInfo(
  task: TaskView,
  timeZone: string,
): { month: string; basis: TaskMonthBasis; date: string; stamp: string } {
  const local = (iso: string) =>
    zonedWallTimeFromInstant(new Date(iso), timeZone).date;
  if (task.status === "completed" && task.completedAt) {
    const date = local(task.completedAt);
    return {
      month: date.slice(0, 7),
      basis: "completed",
      date,
      stamp: task.completedAt,
    };
  }
  if (task.dueDate) {
    return {
      month: task.dueDate.slice(0, 7),
      basis: "due",
      date: task.dueDate,
      stamp: task.dueAt ?? `${task.dueDate}T00:00:00Z`,
    };
  }
  const date = local(task.createdAt);
  return {
    month: date.slice(0, 7),
    basis: "created",
    date,
    stamp: task.createdAt,
  };
}

export function buildHistoryItems(input: {
  tasks: readonly FeedTask[];
  runs: readonly ChoreRunSummary[];
  timeZone: string;
}): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const entry of input.tasks) {
    const info = taskMonthInfo(entry.task, input.timeZone);
    items.push({
      source: "task",
      id: `task:${entry.task.id}`,
      completed: entry.task.status === "completed",
      month: info.month,
      basis: info.basis,
      basisDate: info.date,
      stamp: info.stamp,
      entry,
    });
  }
  for (const run of input.runs) {
    items.push({
      source: "chore",
      id: `run:${run.cycleId}`,
      completed: run.completed,
      month: run.businessDate.slice(0, 7),
      basisDate: run.businessDate,
      stamp: run.closedAt ?? run.openedAt,
      run,
    });
  }
  return items;
}

export type FeedFilters = {
  scope: HistoryScope;
  /** "all" or a location-local "YYYY-MM". */
  month: string;
  search: string;
  /** "all", "task:<status>" or "run:<status>". */
  status: string;
  /** "all" or a profile id (applies to tasks; runs have no single employee). */
  employee: string;
  /** "all" or a chore board id (shows only that board's runs). */
  boardId: string;
  sort: "newest" | "oldest";
};

export const DEFAULT_FEED_FILTERS: FeedFilters = {
  scope: "all",
  month: "all",
  search: "",
  status: "all",
  employee: "all",
  boardId: "all",
  sort: "newest",
};

export function activeFeedFilterCount(f: FeedFilters): number {
  let n = 0;
  if (f.month !== "all") n += 1;
  if (f.status !== "all") n += 1;
  if (f.employee !== "all") n += 1;
  if (f.boardId !== "all") n += 1;
  return n;
}

export function itemStatusKey(item: HistoryItem): string {
  return item.source === "task"
    ? `task:${item.entry.task.status}`
    : `run:${item.run.status}`;
}

export function statusKeyLabel(key: string): string {
  const [source, status] = key.split(":");
  if (source === "task") {
    return `Task · ${STATUS_LABELS[status as TaskStatus] ?? status}`;
  }
  return `Run · ${RUN_STATUS_LABELS[status as RunStatus] ?? status}`;
}

function matchesSearch(item: HistoryItem, needle: string): boolean {
  if (item.source === "task") {
    const t = item.entry.task;
    return (
      t.title.toLowerCase().includes(needle) ||
      (t.completedBy?.name.toLowerCase().includes(needle) ?? false) ||
      t.assignees.some((a) => a.name.toLowerCase().includes(needle))
    );
  }
  const r = item.run;
  return (
    r.boardName.toLowerCase().includes(needle) ||
    `run ${r.sequence}`.includes(needle) ||
    (r.closedByName?.toLowerCase().includes(needle) ?? false) ||
    (r.note?.toLowerCase().includes(needle) ?? false)
  );
}

export function filterHistoryItems(
  items: readonly HistoryItem[],
  f: FeedFilters,
): HistoryItem[] {
  const needle = f.search.trim().toLowerCase();
  return items.filter((item) => {
    if (f.scope === "tasks" && item.source !== "task") return false;
    if (f.scope === "chores" && item.source !== "chore") return false;
    if (f.month !== "all" && item.month !== f.month) return false;
    if (f.status !== "all" && itemStatusKey(item) !== f.status) return false;
    if (f.boardId !== "all") {
      if (item.source !== "chore" || item.run.boardId !== f.boardId) {
        return false;
      }
    }
    if (f.employee !== "all") {
      if (item.source !== "task") return false;
      const t = item.entry.task;
      const involved =
        t.assignees.some((a) => a.profileId === f.employee) ||
        t.completedBy?.profileId === f.employee;
      if (!involved) return false;
    }
    if (needle && !matchesSearch(item, needle)) return false;
    return true;
  });
}

export type FeedMonthGroup = {
  key: string;
  label: string;
  completed: HistoryItem[];
  notCompleted: HistoryItem[];
};

/** Month -> Completed / Not completed. Group order follows `sort` (newest month first by default). */
export function groupHistoryItems(
  items: readonly HistoryItem[],
  sort: FeedFilters["sort"],
): FeedMonthGroup[] {
  const direction = sort === "oldest" ? 1 : -1;
  const ordered = [...items].sort((a, b) => {
    const byStamp = new Date(a.stamp).getTime() - new Date(b.stamp).getTime();
    return byStamp !== 0 ? direction * byStamp : a.id.localeCompare(b.id);
  });
  const groups = new Map<string, FeedMonthGroup>();
  for (const item of ordered) {
    let group = groups.get(item.month);
    if (!group) {
      group = {
        key: item.month,
        label: monthLabel(item.month),
        completed: [],
        notCompleted: [],
      };
      groups.set(item.month, group);
    }
    (item.completed ? group.completed : group.notCompleted).push(item);
  }
  return [...groups.values()].sort((a, b) =>
    direction === 1 ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key),
  );
}

export function feedMonths(
  items: readonly HistoryItem[],
  extra: readonly string[] = [],
): { key: string; label: string }[] {
  const keys = new Set<string>(extra);
  for (const item of items) keys.add(item.month);
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

export function feedStatusOptions(
  items: readonly HistoryItem[],
): { key: string; label: string }[] {
  const keys = new Set(items.map(itemStatusKey));
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, label: statusKeyLabel(key) }));
}

/** The line that tells the reader which date placed an item under its month. */
export function basisLabel(item: HistoryItem): string {
  if (item.source === "chore") return "Business day";
  return item.basis === "completed"
    ? "Completed"
    : item.basis === "due"
      ? "Due"
      : "Created";
}
