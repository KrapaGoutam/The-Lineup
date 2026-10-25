import type { Designation } from "@/features/auth/domain/passcode";

/**
 * Tasks V1 domain vocabulary. Mirrors the Postgres enums in
 * supabase/migrations/20261025090000_tasks_v1_foundation.sql one-to-one so
 * the database stays the single source of truth; the UI only ever labels
 * and groups these values.
 */
export const TASK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_KINDS = ["task", "opening", "closing"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const ASSIGNMENT_MODES = [
  "individual",
  "multiple",
  "all_team",
  "anyone",
] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export const DUE_WINDOWS = [
  "before_opening",
  "during_shift",
  "before_dinner",
  "closing",
  "end_of_night",
] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

/** Statuses in which work remains (and OVERDUE can be derived). */
export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
];

/**
 * Seeded in `task_categories`. The database is authoritative; this list is
 * the typed fallback (demo mode, and before the first snapshot arrives) so
 * labels live in exactly two places that tests keep in step.
 */
export const DEFAULT_TASK_CATEGORIES = [
  { slug: "cleaning", name: "Cleaning" },
  { slug: "opening", name: "Opening" },
  { slug: "closing", name: "Closing" },
  { slug: "inventory", name: "Inventory" },
  { slug: "maintenance", name: "Maintenance" },
  { slug: "guest_service", name: "Guest Service" },
  { slug: "kitchen", name: "Kitchen" },
  { slug: "bar", name: "Bar" },
  { slug: "safety", name: "Safety" },
  { slug: "other", name: "Other" },
] as const;

export type TaskCategory = { slug: string; name: string };

export type PersonRef = { profileId: string; name: string };

/** One row of the read model. Dates are location-local; instants are ISO. */
export type TaskView = {
  id: string;
  kind: TaskKind;
  title: string;
  instructions: string | null;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignmentMode: AssignmentMode;
  assignees: PersonRef[];
  startDate: string | null;
  dueDate: string | null;
  /** "HH:mm" in the location's time zone. */
  dueTime: string | null;
  dueWindow: DueWindow | null;
  /** Derived by the database from dueDate/dueTime in the location zone. */
  dueAt: string | null;
  blockedReason: string | null;
  completedBy: PersonRef | null;
  completedAt: string | null;
  completionNote: string | null;
  cancelledAt: string | null;
  groupId: string | null;
  recurrenceRuleId: string | null;
  checklistInstanceId: string | null;
  sortOrder: number;
  createdBy: PersonRef | null;
  createdAt: string;
};

/** Manager-only audit timeline row. */
export type TaskEventView = {
  id: number;
  taskId: string | null;
  type: string;
  actor: PersonRef | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TaskViewer = {
  profileId: string;
  name: string;
  designation: Designation;
};

/** Owner / Manager / Assistant Manager (DB roles owner, general_manager, shift_manager). */
export function isTasksManager(designation: Designation): boolean {
  return designation !== "staff";
}

export type TaskTeamMember = {
  profileId: string;
  name: string;
  designation: Designation;
};

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekdays",
  "weekly",
  "selected_weekdays",
  "monthly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_END_TYPES = [
  "never",
  "on_date",
  "after_count",
] as const;
export type RecurrenceEndType = (typeof RECURRENCE_END_TYPES)[number];

/** A recurring series definition (manager-only). Occurrences are normal tasks. */
export type RecurrenceRuleView = {
  id: string;
  title: string;
  instructions: string | null;
  category: string;
  priority: TaskPriority;
  assignmentMode: AssignmentMode;
  assigneeIds: string[];
  dueTime: string | null;
  dueWindow: DueWindow | null;
  frequency: RecurrenceFrequency;
  /** 0 = Sunday .. 6 = Saturday (weekly / selected weekdays). */
  weekdays: number[] | null;
  dayOfMonth: number | null;
  startsOn: string;
  endType: RecurrenceEndType;
  endsOn: string | null;
  maxOccurrences: number | null;
  active: boolean;
  createdBy: PersonRef | null;
};

export type ChecklistKind = "opening" | "closing";

/** One day's Opening or Closing checklist; its items are ordinary tasks. */
export type ChecklistInstanceView = {
  id: string;
  kind: ChecklistKind;
  name: string;
  /** Location-local operational date (YYYY-MM-DD). */
  serviceDate: string;
  items: TaskView[];
};

export type ChecklistTemplateItemView = {
  title: string;
  instructions: string | null;
  category: string;
  priority: TaskPriority;
  assignmentMode: AssignmentMode;
  assigneeIds: string[];
  dueWindow: DueWindow | null;
  /** "HH:mm" or null. */
  dueTime: string | null;
};

/** Reusable definition (manager-only). It is not the day's checklist. */
export type ChecklistTemplateView = {
  id: string;
  kind: ChecklistKind;
  name: string;
  /** 0 = Sunday .. 6 = Saturday. */
  daysOfWeek: number[];
  active: boolean;
  items: ChecklistTemplateItemView[];
};

/** Everything one signed-in person's Tasks screens render from. */
export type TasksSnapshot = {
  organizationId: string;
  locationId: string | null;
  timeZone: string;
  /** Location-local calendar date (YYYY-MM-DD) at `generatedAt`. */
  today: string;
  generatedAt: string;
  /** Normal (non-checklist) tasks, already limited to what this viewer may see. */
  tasks: TaskView[];
  /** Opening / Closing days, newest first (bounded history window). */
  checklists: ChecklistInstanceView[];
  /** Recurring series definitions; empty for staff. */
  series: RecurrenceRuleView[];
  /** Template definitions; empty for staff. */
  templates: ChecklistTemplateView[];
  /** Management audit timeline; always empty for staff. */
  events: TaskEventView[];
  /** Active members for assignment pickers; empty for staff. */
  team: TaskTeamMember[];
  categories: TaskCategory[];
};
