/**
 * V2.0.13 Batch B: the Chore Wheel read model.
 *
 * A BOARD is a template (columns = people / responsibility positions, rows =
 * chores) plus the one open CYCLE it is currently executing. Completions belong
 * to the cycle and name rows and columns by stable id, never by label or
 * position. Batch C builds cycle completion, reset and History on this shape.
 */

export const REQUIREMENT_MODES = [
  "all_columns",
  "selected_columns",
  "any_one",
] as const;
export type RequirementMode = (typeof REQUIREMENT_MODES)[number];

export const REQUIREMENT_MODE_LABELS: Record<RequirementMode, string> = {
  all_columns: "All columns required",
  selected_columns: "Selected people required",
  any_one: "Any one person",
};

export const REQUIREMENT_MODE_HELP: Record<RequirementMode, string> = {
  all_columns: "Every active column must complete the chore.",
  selected_columns: "Only the people you select must complete the chore.",
  any_one: "One completion by any column finishes the chore.",
};

export const STAFF_ACCESS = ["own_column", "any_workforce"] as const;
export type StaffAccess = (typeof STAFF_ACCESS)[number];

export const STAFF_ACCESS_LABELS: Record<StaffAccess, string> = {
  own_column: "Each person updates their own column",
  any_workforce: "Anyone on the team can update any column (shared tablet)",
};

/** How a board's runs repeat. Daily and weekly follow the LOCATION's calendar (not UTC); per-shift is not available. */
export const RECURRENCE_INTENTS = [
  "continuous",
  "daily",
  "per_shift",
  "weekly",
  "manual",
] as const;
export type RecurrenceIntent = (typeof RECURRENCE_INTENTS)[number];

export const RECURRENCE_INTENT_LABELS: Record<RecurrenceIntent, string> = {
  continuous: "Continuous",
  daily: "Daily",
  per_shift: "Per shift (not available yet)",
  weekly: "Weekly",
  manual: "Manual",
};

export const RESET_INTENTS = [
  "automatic_after_completion",
  "manual_restart",
] as const;
export type ResetIntent = (typeof RESET_INTENTS)[number];

export const RESET_INTENT_LABELS: Record<ResetIntent, string> = {
  automatic_after_completion: "Automatic after completion",
  manual_restart: "Manual restart",
};

export type ChoreEntryKind =
  | "self"
  | "position"
  | "shared"
  | "manager_correction";

export type ChoreColumnView = {
  id: string;
  /** What the board shows. Independent of the employee's account name. */
  label: string;
  /** The underlying employee, or null for an unassigned responsibility position. */
  profileId: string | null;
  sortOrder: number;
  isActive: boolean;
  archived: boolean;
};

export type ChoreRowView = {
  id: string;
  title: string;
  instructions: string | null;
  /** Optional chores can be ticked but never count toward the board total. */
  isRequired: boolean;
  mode: RequirementMode;
  /** Used when `mode` is `selected_columns`. */
  selectedColumnIds: string[];
  sortOrder: number;
  isActive: boolean;
  archived: boolean;
};

export type ChoreCompletionView = {
  rowId: string;
  columnId: string;
  completedBy: string;
  /** Name at the time of completion (profiles can be renamed later). */
  completedByName: string;
  completedAt: string;
  enteredAs: ChoreEntryKind;
};

export type ChoreAssignmentView = {
  columnId: string;
  profileId: string | null;
  assignedAt: string;
  endedAt: string | null;
};

export type ChoreCycleView = {
  id: string;
  sequence: number;
  openedAt: string;
  /** Location-local business day the run belongs to (YYYY-MM-DD). */
  businessDate: string;
  openedBySystem: boolean;
};

export type ChoreBoardView = {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  archived: boolean;
  sortOrder: number;
  staffAccess: StaffAccess;
  managerOverride: boolean;
  defaultMode: RequirementMode;
  recurrenceIntent: RecurrenceIntent;
  resetIntent: ResetIntent;
  /** Optimistic-concurrency token for settings edits. */
  version: number;
  cycle: ChoreCycleView | null;
  /** Most recent finished run (shown while the board is between runs). */
  lastRun?: ChoreRunSummary | null;
  columns: ChoreColumnView[];
  rows: ChoreRowView[];
  completions: ChoreCompletionView[];
  /** Managers only; empty for staff. */
  assignments: ChoreAssignmentView[];
};

export type ChoreSnapshot = {
  boards: ChoreBoardView[];
};

export const EMPTY_CHORE_SNAPSHOT: ChoreSnapshot = { boards: [] };

export type ChoreViewer = {
  profileId: string;
  name: string;
  isManager: boolean;
};

// ---------------------------------------------------------------------------
// Batch C: runs, immutable snapshots, corrections
// ---------------------------------------------------------------------------

/** Run status. "open" is the live run; the rest are FINISHED and frozen. */
export const RUN_STATUSES = [
  "open",
  "completed",
  "cancelled",
  "expired",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  open: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired (not completed)",
};

export type RunCloseTrigger = "manual" | "automatic" | "cancelled" | "expired";

/** One run of a board: what History lists. Finished runs come from their frozen snapshot. */
export type ChoreRunSummary = {
  cycleId: string;
  boardId: string;
  /** The board name when the run closed (renames never rewrite it). */
  boardName: string;
  sequence: number;
  status: RunStatus;
  /** Completed vs Not Completed (open, cancelled and expired are Not Completed). */
  completed: boolean;
  /** Location-local business day; History groups by its month. */
  businessDate: string;
  requiredTotal: number;
  requiredDone: number;
  optionalTotal: number;
  optionalDone: number;
  openedAt: string;
  closedAt: string | null;
  /** "user" = a manager, "system" = automatic (never an employee who ticked the last cell). */
  closedByKind: "user" | "system" | null;
  closedByName: string | null;
  closeTrigger: RunCloseTrigger | null;
  note: string | null;
  /** The configuration changed after the first cell of the run was checked. */
  structureChanged: boolean;
};

export type ChoreCorrectionView = {
  id: number;
  rowId: string;
  columnId: string;
  doneBefore: boolean;
  doneAfter: boolean;
  beforeCompletedByName: string | null;
  beforeCompletedAt: string | null;
  reason: string;
  correctedByName: string;
  createdAt: string;
};

/**
 * A finished run exactly as it was: titles, labels, order, assignees and cells are
 * COPIES, so a later template edit never changes it. `board` reuses the live board
 * shape so the same counting rules apply (rows / columns that were not live at close
 * carry isActive = false and never count).
 */
export type ChoreRunDetail = {
  summary: ChoreRunSummary;
  /** Frozen structure + cells. Cells are the ORIGINAL recorded events, never corrected ones. */
  board: ChoreBoardView;
  corrections: ChoreCorrectionView[];
  /** Whether this viewer may append a correction (manager and the board allows it). */
  canCorrect: boolean;
};

export type ChoreHistoryData = {
  runs: ChoreRunSummary[];
  /** More finished runs exist than were loaded. */
  truncated: boolean;
};
