import { formatBusinessTime } from "@/lib/date-time";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { addDaysToDate } from "./task-rules";
import type { PersonRef, TaskKind, AssignmentMode } from "./task-types";

/**
 * Tasks → History: a read-only audit view of completed work. Everything here
 * is derived presentation logic over rows exactly as persisted; nothing is
 * written back and no field is invented (Assigned To and Completed By are
 * two separate stored facts).
 */

/** One completed task as it was persisted. */
export type TaskHistoryEntry = {
  id: string;
  title: string;
  kind: TaskKind;
  assignmentMode: AssignmentMode;
  /** Who it was assigned to (empty for whole-team / anyone work). */
  assignees: PersonRef[];
  /** Who actually completed it; null only if the profile is unknown. */
  completedBy: PersonRef | null;
  /** ISO instant of completion (`tasks.completed_at`). */
  completedAt: string;
  /** Earliest `task_assignments.assigned_at`; null if nobody was named. */
  assignedAt: string | null;
};

export type TaskHistoryData = {
  entries: TaskHistoryEntry[];
  /** True when older completed tasks exist beyond the loaded window. */
  truncated: boolean;
};

export const DATE_PRESETS = [
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "Any time",
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  custom: "Custom range",
};

export type HistorySort = "newest" | "oldest";

export type HistoryFilters = {
  search: string;
  /** "all" or a profile id. */
  assignedTo: string;
  /** "all" or a profile id. */
  completedBy: string;
  type: "all" | TaskKind;
  datePreset: DatePreset;
  /** Inclusive location-local dates (YYYY-MM-DD) for the custom range. */
  from: string;
  to: string;
  /** "all" or a location-local "YYYY-MM" key. */
  month: string;
  sort: HistorySort;
};

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  search: "",
  assignedTo: "all",
  completedBy: "all",
  type: "all",
  datePreset: "all",
  from: "",
  to: "",
  month: "all",
  sort: "newest",
};

/** Filters (not search, not sort) that narrow the list. */
export function activeFilterCount(filters: HistoryFilters): number {
  let count = 0;
  if (filters.assignedTo !== "all") count += 1;
  if (filters.completedBy !== "all") count += 1;
  if (filters.type !== "all") count += 1;
  if (filters.datePreset !== "all") count += 1;
  if (filters.month !== "all") count += 1;
  return count;
}

export function hasActiveFilters(filters: HistoryFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.search.trim() !== "";
}

/** Existing `task_kind` values, labelled the way the restaurant says them. */
export function historyTypeLabel(kind: TaskKind): string {
  if (kind === "opening") return "Opening";
  if (kind === "closing") return "Closing";
  return "Regular";
}

/** Who the task was assigned to, as text ("Whole team" / "Anyone" aware). */
export function assignedToLabel(
  entry: Pick<TaskHistoryEntry, "assignmentMode" | "assignees">,
): string {
  if (entry.assignees.length > 0) {
    return entry.assignees.map((a) => a.name).join(", ");
  }
  if (entry.assignmentMode === "all_team") return "Whole team";
  if (entry.assignmentMode === "anyone") return "Anyone";
  return "—";
}

/** A completed entry plus the location-local day it falls on. */
type Dated = { entry: TaskHistoryEntry; date: string };

function withLocalDate(
  entries: readonly TaskHistoryEntry[],
  timeZone: string,
): Dated[] {
  return entries.map((entry) => ({
    entry,
    date: zonedWallTimeFromInstant(new Date(entry.completedAt), timeZone).date,
  }));
}

/** Inclusive local-date bounds for a preset, or null when it does not narrow. */
export function presetRange(
  preset: DatePreset,
  today: string,
  custom: { from: string; to: string },
): { from: string | null; to: string | null } | null {
  switch (preset) {
    case "all":
      return null;
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addDaysToDate(today, -1);
      return { from: day, to: day };
    }
    case "last7":
      return { from: addDaysToDate(today, -6), to: today };
    case "last30":
      return { from: addDaysToDate(today, -29), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "custom":
      return { from: custom.from || null, to: custom.to || null };
  }
}

function matchesSearch(entry: TaskHistoryEntry, needle: string): boolean {
  if (entry.title.toLowerCase().includes(needle)) return true;
  if (entry.completedBy?.name.toLowerCase().includes(needle)) return true;
  return entry.assignees.some((a) => a.name.toLowerCase().includes(needle));
}

/**
 * Filter then order. Ordering always uses the real completion instant
 * (newest first by default), with the id as a stable tiebreak.
 */
export function filterHistory(
  entries: readonly TaskHistoryEntry[],
  filters: HistoryFilters,
  ctx: { today: string; timeZone: string },
): TaskHistoryEntry[] {
  const needle = filters.search.trim().toLowerCase();
  const range = presetRange(filters.datePreset, ctx.today, filters);

  const kept = withLocalDate(entries, ctx.timeZone).filter(
    ({ entry, date }) => {
      if (needle && !matchesSearch(entry, needle)) return false;
      if (
        filters.assignedTo !== "all" &&
        !entry.assignees.some((a) => a.profileId === filters.assignedTo)
      ) {
        return false;
      }
      if (
        filters.completedBy !== "all" &&
        entry.completedBy?.profileId !== filters.completedBy
      ) {
        return false;
      }
      if (filters.type !== "all" && entry.kind !== filters.type) return false;
      if (range?.from && date < range.from) return false;
      if (range?.to && date > range.to) return false;
      if (filters.month !== "all" && date.slice(0, 7) !== filters.month) {
        return false;
      }
      return true;
    },
  );

  const direction = filters.sort === "oldest" ? 1 : -1;
  return kept
    .map(({ entry }) => entry)
    .sort((a, b) => {
      const byTime =
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      if (byTime !== 0) return direction * byTime;
      return direction * a.id.localeCompare(b.id);
    });
}

export type HistoryMonthGroup = {
  /** Location-local "YYYY-MM". */
  key: string;
  /** "November 2026". */
  label: string;
  entries: TaskHistoryEntry[];
};

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Group by the location-local month of completion. `entries` must already be
 * ordered (see `filterHistory`); group order follows that same direction, so
 * newest-first yields newest month → oldest month.
 */
export function groupByMonth(
  entries: readonly TaskHistoryEntry[],
  timeZone: string,
): HistoryMonthGroup[] {
  const groups: HistoryMonthGroup[] = [];
  const byKey = new Map<string, HistoryMonthGroup>();
  for (const { entry, date } of withLocalDate(entries, timeZone)) {
    const key = date.slice(0, 7);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: monthLabel(key), entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();

function shortDate(iso: string, timeZone: string): string {
  let formatter = shortDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone,
    });
    shortDateFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(iso));
}

/** "Nov 2 · 9:42 PM" in the restaurant's business time zone. */
export function formatHistoryStamp(iso: string, timeZone: string): string {
  return `${shortDate(iso, timeZone)} · ${formatBusinessTime(iso, timeZone)}`;
}

/**
 * The assigned time next to its completion: just the clock when both fall on
 * the same local day, the full stamp otherwise. "—" when it was never stored.
 */
export function formatAssignedStamp(
  assignedAt: string | null,
  completedAt: string,
  timeZone: string,
): string {
  if (!assignedAt) return "—";
  const sameDay =
    zonedWallTimeFromInstant(new Date(assignedAt), timeZone).date ===
    zonedWallTimeFromInstant(new Date(completedAt), timeZone).date;
  return sameDay
    ? formatBusinessTime(assignedAt, timeZone)
    : formatHistoryStamp(assignedAt, timeZone);
}

/** Distinct months present in the data, newest first, for the Month filter. */
export function availableMonths(
  entries: readonly TaskHistoryEntry[],
  timeZone: string,
): { key: string; label: string }[] {
  const keys = new Set<string>();
  for (const { date } of withLocalDate(entries, timeZone)) {
    keys.add(date.slice(0, 7));
  }
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

/** People appearing in a role, for the Assigned To / Completed By pickers. */
export function peopleIn(
  entries: readonly TaskHistoryEntry[],
  pick: (entry: TaskHistoryEntry) => PersonRef[],
): PersonRef[] {
  const people = new Map<string, PersonRef>();
  for (const entry of entries) {
    for (const person of pick(entry)) people.set(person.profileId, person);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Demo mode: History from the in-memory engine. Mirrors the real query
 * (completed tasks of every kind). The engine keeps no per-assignee
 * timestamp, so the assigned time is the task's last assign/reassign event
 * (or its creation), never a guess.
 */
export function demoHistoryEntries(
  tasks: readonly {
    id: string;
    title: string;
    kind: TaskKind;
    assignmentMode: AssignmentMode;
    assignees: PersonRef[];
    completedBy: PersonRef | null;
    completedAt: string | null;
    status: string;
  }[],
  events: readonly { taskId: string | null; type: string; createdAt: string }[],
): TaskHistoryEntry[] {
  const assignedAt = new Map<string, string>();
  for (const event of events) {
    if (
      !event.taskId ||
      (event.type !== "created" &&
        event.type !== "assigned" &&
        event.type !== "reassigned")
    ) {
      continue;
    }
    const current = assignedAt.get(event.taskId);
    if (!current || event.createdAt > current) {
      assignedAt.set(event.taskId, event.createdAt);
    }
  }
  return tasks
    .filter((t) => t.status === "completed" && t.completedAt)
    .map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      assignmentMode: t.assignmentMode,
      assignees: t.assignees,
      completedBy: t.completedBy,
      completedAt: t.completedAt as string,
      assignedAt:
        t.assignees.length > 0 ? (assignedAt.get(t.id) ?? null) : null,
    }));
}
