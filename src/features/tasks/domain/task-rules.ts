import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  ACTIVE_STATUSES,
  type AssignmentMode,
  type ChecklistInstanceView,
  type DueWindow,
  type TaskKind,
  type TaskPriority,
  type TaskStatus,
  type TaskTeamMember,
  type TaskView,
  type TaskViewer,
  isTasksManager,
} from "./task-types";

/**
 * Pure Tasks rules. They mirror the database contract (RLS visibility,
 * `private.tasks_can_work`, derived overdue) so demo mode and the UI behave
 * like real mode -- but they never *grant* anything: every real-mode
 * mutation is re-authorized by the `public.task_*` RPCs.
 */

export function isActiveStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** OVERDUE is derived, never stored: due_at has passed and work remains. */
export function isOverdue(
  task: Pick<TaskView, "status" | "dueAt">,
  now: Date,
): boolean {
  if (!isActiveStatus(task.status) || !task.dueAt) return false;
  return new Date(task.dueAt).getTime() < now.getTime();
}

function isBroadMode(mode: AssignmentMode): boolean {
  return mode === "all_team" || mode === "anyone";
}

function isAssignee(viewer: TaskViewer, task: TaskView): boolean {
  return task.assignees.some((a) => a.profileId === viewer.profileId);
}

/** Mirrors `private.tasks_can_view` (the `tasks` SELECT policy). */
export function canViewTask(viewer: TaskViewer, task: TaskView): boolean {
  return (
    isTasksManager(viewer.designation) ||
    task.kind !== "task" ||
    isBroadMode(task.assignmentMode) ||
    isAssignee(viewer, task)
  );
}

/**
 * Mirrors `private.tasks_can_work`: who may start / block / complete /
 * reopen. Managers act on behalf of anyone; everyone may work team-wide or
 * shared tasks; otherwise only the assignees.
 */
export function canWorkTask(viewer: TaskViewer, task: TaskView): boolean {
  return (
    isTasksManager(viewer.designation) ||
    isBroadMode(task.assignmentMode) ||
    isAssignee(viewer, task)
  );
}

/** "Mine": assigned to me, or open to the whole team / anyone eligible. */
export function isMine(viewer: TaskViewer, task: TaskView): boolean {
  return isAssignee(viewer, task) || isBroadMode(task.assignmentMode);
}

export type TaskBucket =
  | "overdue"
  | "today"
  | "upcoming"
  | "completed"
  | "cancelled";

/**
 * Where a task belongs in the Today / Upcoming / Overdue / Completed
 * filters. `today` is the location-local calendar date (YYYY-MM-DD).
 */
export function taskBucket(
  task: TaskView,
  now: Date,
  today: string,
): TaskBucket {
  if (task.status === "completed") return "completed";
  if (task.status === "cancelled") return "cancelled";
  if (isOverdue(task, now)) return "overdue";
  const notStarted = task.startDate !== null && task.startDate > today;
  const dueLater =
    task.startDate === null && task.dueDate !== null && task.dueDate > today;
  return notStarted || dueLater ? "upcoming" : "today";
}

const BUCKET_ORDER: Record<TaskBucket, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  completed: 3,
  cancelled: 4,
};
const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

/** Overdue first, then urgent/high, then soonest due, then manual order. */
export function sortTasks(
  tasks: readonly TaskView[],
  now: Date,
  today: string,
): TaskView[] {
  return [...tasks].sort((a, b) => {
    const bucket =
      BUCKET_ORDER[taskBucket(a, now, today)] -
      BUCKET_ORDER[taskBucket(b, now, today)];
    if (bucket !== 0) return bucket;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    if (dueA !== dueB) return dueA - dueB;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title);
  });
}

export type Progress = { done: number; total: number; percent: number };

/** Completed / total, cancelled items excluded from both. */
export function taskProgress(tasks: readonly TaskView[]): Progress {
  const counted = tasks.filter((t) => t.status !== "cancelled");
  const done = counted.filter((t) => t.status === "completed").length;
  const total = counted.length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export type TodaySummary = {
  myOpen: number;
  myOverdue: number;
  teamOpen: number;
  teamOverdue: number;
  upcoming: number;
};

export function summarizeToday(
  tasks: readonly TaskView[],
  viewer: TaskViewer,
  now: Date,
  today: string,
): TodaySummary {
  const summary: TodaySummary = {
    myOpen: 0,
    myOverdue: 0,
    teamOpen: 0,
    teamOverdue: 0,
    upcoming: 0,
  };
  for (const task of tasks) {
    if (task.kind !== "task" || !isActiveStatus(task.status)) continue;
    const bucket = taskBucket(task, now, today);
    const mine = isMine(viewer, task);
    if (mine && bucket === "upcoming") summary.upcoming += 1;
    if (mine && (bucket === "today" || bucket === "overdue")) {
      summary.myOpen += 1;
      if (bucket === "overdue") summary.myOverdue += 1;
    }
    if (bucket === "today" || bucket === "overdue") {
      summary.teamOpen += 1;
      if (bucket === "overdue") summary.teamOverdue += 1;
    }
  }
  return summary;
}

export type PersonProgress = {
  profileId: string;
  name: string;
  done: number;
  total: number;
};

/**
 * "Bhoomi 4 / 5 complete". Counts every individually or multi-assigned
 * task per assignee (a shared task counts for each named person); tasks open
 * to the whole team have no named owner and are excluded. Individual task
 * state remains the source of truth -- this is only a roll-up.
 */
export function personProgress(tasks: readonly TaskView[]): PersonProgress[] {
  const byPerson = new Map<string, PersonProgress>();
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    for (const person of task.assignees) {
      const row = byPerson.get(person.profileId) ?? {
        profileId: person.profileId,
        name: person.name,
        done: 0,
        total: 0,
      };
      row.total += 1;
      if (task.status === "completed") row.done += 1;
      byPerson.set(person.profileId, row);
    }
  }
  return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------
// Management Today (Tasks V1.1 T-2, #169)
// ---------------------------------------------------------------------

/**
 * Which slice of Today a manager is looking at. This is a *view* over rows
 * the viewer may already read (RLS decides that, not this code); it never
 * grants access. People are always addressed by profile id, never by name.
 */
export type TodayScope =
  | { type: "all" }
  | { type: "mine" }
  | { type: "person"; profileId: string };

export const ALL_STAFF_SCOPE: TodayScope = { type: "all" };

/** `<select>` value for a scope: "all" | "mine" | "person:<profileId>". */
export function scopeToValue(scope: TodayScope): string {
  return scope.type === "person" ? `person:${scope.profileId}` : scope.type;
}

export function scopeFromValue(value: string): TodayScope {
  if (value === "mine") return { type: "mine" };
  if (value.startsWith("person:") && value.length > "person:".length) {
    return { type: "person", profileId: value.slice("person:".length) };
  }
  return ALL_STAFF_SCOPE;
}

/**
 * The scope actually applied. Staff always get "all" of what they can
 * already read (the control is never rendered for them, and a stale or
 * hand-edited value cannot widen anything); a person who is no longer on
 * the active team falls back to "all" rather than showing a silent blank.
 */
export function resolveScope(
  scope: TodayScope,
  viewer: TaskViewer,
  team: readonly TaskTeamMember[],
): TodayScope {
  if (!isTasksManager(viewer.designation)) return ALL_STAFF_SCOPE;
  if (
    scope.type === "person" &&
    !team.some((member) => member.profileId === scope.profileId)
  ) {
    return ALL_STAFF_SCOPE;
  }
  return scope;
}

/**
 * Who a row belongs to. individual / multiple: the named assignees;
 * all_team: "Whole team"; anyone: "Anyone". Nothing is invented (a task
 * with no named assignee yields ""), and "Completed by" stays a separate
 * fact shown elsewhere on the row.
 */
export function staffLabel(
  task: Pick<TaskView, "assignmentMode" | "assignees">,
): string {
  if (task.assignmentMode === "all_team") return "Whole team";
  if (task.assignmentMode === "anyone") return "Anyone";
  return task.assignees.map((a) => a.name).join(", ");
}

/**
 * Narrow rows to a scope.
 * - all: unchanged.
 * - mine: the existing "My Tasks" rule (assigned to me, or open to the whole
 *   team / anyone eligible) -- not "created by me".
 * - person: that person as a *named* assignee only; shared (all_team /
 *   anyone) work is not attributed to an individual.
 */
export function filterByScope(
  tasks: readonly TaskView[],
  scope: TodayScope,
  viewer: TaskViewer,
): TaskView[] {
  switch (scope.type) {
    case "all":
      return [...tasks];
    case "mine":
      return tasks.filter((task) => isMine(viewer, task));
    case "person":
      return tasks.filter(
        (task) =>
          !isBroadMode(task.assignmentMode) &&
          task.assignees.some((a) => a.profileId === scope.profileId),
      );
  }
}

export type TodayGroups = {
  opening: TaskView[];
  general: TaskView[];
  closing: TaskView[];
};

/**
 * Today's work for the service date, grouped Opening / General / Closing and
 * sorted overdue first. Same Today meaning as the My Tasks list: today's
 * work plus anything overdue, plus work finished today (so a check-off does
 * not make the row vanish). Cancelled work never appears; upcoming work
 * waits for its day. Opening / Closing come from today's checklist
 * instances only -- earlier days are history, not Today.
 */
export function buildTodayGroups(
  input: {
    tasks: readonly TaskView[];
    checklists: readonly ChecklistInstanceView[];
    today: string;
    timeZone: string;
    now: Date;
  },
  scope: TodayScope,
  viewer: TaskViewer,
): TodayGroups {
  const { today, timeZone, now } = input;
  const inToday = (task: TaskView): boolean => {
    const bucket = taskBucket(task, now, today);
    if (bucket === "overdue" || bucket === "today") return true;
    return (
      bucket === "completed" &&
      task.completedAt !== null &&
      zonedWallTimeFromInstant(new Date(task.completedAt), timeZone).date ===
        today
    );
  };
  const checklistItems = (kind: "opening" | "closing") =>
    input.checklists
      .filter((c) => c.kind === kind && c.serviceDate === today)
      .flatMap((c) => c.items)
      .filter((item) => item.status !== "cancelled");
  const arrange = (tasks: readonly TaskView[]) =>
    sortTasks(filterByScope(tasks, scope, viewer), now, today);

  return {
    opening: arrange(checklistItems("opening")),
    general: arrange(
      input.tasks.filter((task) => task.kind === "task" && inToday(task)),
    ),
    closing: arrange(checklistItems("closing")),
  };
}

// ---------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------
export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const WINDOW_LABELS: Record<DueWindow, string> = {
  before_opening: "Before opening",
  during_shift: "During shift",
  before_dinner: "Before dinner",
  closing: "Closing",
  end_of_night: "End of night",
};

export const ASSIGNMENT_LABELS: Record<AssignmentMode, string> = {
  individual: "One person",
  multiple: "Selected people",
  all_team: "All team",
  anyone: "Anyone eligible",
};

export function taskTypeLabel(
  task: Pick<TaskView, "kind" | "assignmentMode">,
): string {
  const kind: TaskKind = task.kind;
  if (kind === "opening") return "Opening";
  if (kind === "closing") return "Closing";
  return task.assignmentMode === "individual" ? "Individual" : "Team";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "15:00" -> "3:00 PM". */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** "Oct 30" for a YYYY-MM-DD date (no time-zone involvement). */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function dayLabel(date: string, today: string): string | null {
  if (date === today) return null;
  if (date === addDaysToDate(today, 1)) return "Tomorrow";
  if (date === addDaysToDate(today, -1)) return "Yesterday";
  return formatShortDate(date);
}

/**
 * Human due text: "Due 3:00 PM", "Due Closing", "Due Tomorrow 3:00 PM",
 * "Due Oct 30", or "No due date". Times are already location-local.
 */
export function dueText(
  task: Pick<TaskView, "dueDate" | "dueTime" | "dueWindow">,
  today: string,
): string {
  if (!task.dueDate) {
    return task.dueWindow
      ? `Due ${WINDOW_LABELS[task.dueWindow]}`
      : "No due date";
  }
  const day = dayLabel(task.dueDate, today);
  const when = task.dueTime
    ? formatClock(task.dueTime)
    : task.dueWindow
      ? WINDOW_LABELS[task.dueWindow]
      : null;
  return ["Due", day, when]
    .filter(Boolean)
    .join(" ")
    .replace(/^Due$/, `Due ${formatShortDate(task.dueDate)}`);
}
