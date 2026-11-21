import type {
  ChoreAssignmentView,
  ChoreBoardView,
  ChoreColumnView,
  ChoreCompletionView,
  ChoreCycleView,
  ChoreEntryKind,
  ChoreRowView,
  RecurrenceIntent,
  RequirementMode,
  ResetIntent,
  StaffAccess,
} from "../domain/chore-types";

/** Row shapes as PostgREST returns them (columns selected below, nothing else). */
export type ChoreBoardRow = {
  id: string;
  organization_id: string;
  location_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  archived_at: string | null;
  sort_order: number;
  staff_access: string;
  manager_override: boolean;
  default_requirement_mode: string;
  recurrence_intent: string;
  reset_intent: string;
  version: number;
};
export type ChoreCycleRow = {
  id: string;
  board_id: string;
  sequence: number;
  opened_at: string;
};
export type ChoreColumnRow = {
  id: string;
  board_id: string;
  label: string;
  profile_id: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
};
export type ChoreRowRow = {
  id: string;
  board_id: string;
  title: string;
  instructions: string | null;
  is_required: boolean;
  requirement_mode: string;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
};
export type ChoreRowColumnRow = { row_id: string; column_id: string };
export type ChoreCompletionRow = {
  board_id: string;
  row_id: string;
  column_id: string;
  completed_by: string;
  completed_by_name: string;
  completed_at: string;
  entered_as: string;
};
export type ChoreAssignmentRow = {
  column_id: string;
  board_id: string;
  profile_id: string | null;
  assigned_at: string;
  ended_at: string | null;
};

export const CHORE_BOARD_COLUMNS =
  "id, organization_id, location_id, name, description, is_active, archived_at, sort_order, staff_access, manager_override, default_requirement_mode, recurrence_intent, reset_intent, version";
export const CHORE_CYCLE_COLUMNS = "id, board_id, sequence, opened_at";
export const CHORE_COLUMN_COLUMNS =
  "id, board_id, label, profile_id, sort_order, is_active, archived_at";
export const CHORE_ROW_COLUMNS =
  "id, board_id, title, instructions, is_required, requirement_mode, sort_order, is_active, archived_at";
export const CHORE_ROW_COLUMN_COLUMNS = "row_id, column_id";
export const CHORE_COMPLETION_COLUMNS =
  "board_id, row_id, column_id, completed_by, completed_by_name, completed_at, entered_as";
export const CHORE_ASSIGNMENT_COLUMNS =
  "column_id, board_id, profile_id, assigned_at, ended_at";

const MODES: readonly RequirementMode[] = [
  "all_columns",
  "selected_columns",
  "any_one",
];
const ACCESS: readonly StaffAccess[] = ["own_column", "any_workforce"];
const RECURRENCE: readonly RecurrenceIntent[] = [
  "continuous",
  "daily",
  "per_shift",
  "weekly",
  "manual",
];
const RESET: readonly ResetIntent[] = [
  "automatic_after_completion",
  "manual_restart",
];
const ENTRY: readonly ChoreEntryKind[] = [
  "self",
  "position",
  "shared",
  "manager_correction",
];

function oneOf<T extends string>(
  list: readonly T[],
  value: string,
  fallback: T,
): T {
  return (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function group<T extends { board_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.board_id);
    if (list) list.push(row);
    else map.set(row.board_id, [row]);
  }
  return map;
}

export type ChoreRows = {
  boards: readonly ChoreBoardRow[];
  cycles: readonly ChoreCycleRow[];
  columns: readonly ChoreColumnRow[];
  rows: readonly ChoreRowRow[];
  rowColumns: readonly ChoreRowColumnRow[];
  completions: readonly ChoreCompletionRow[];
  assignments: readonly ChoreAssignmentRow[];
};

/** Pure: the database rows of one location -> the board views. Unknown enum text degrades to a safe default. */
export function mapChoreBoards(input: ChoreRows): ChoreBoardView[] {
  const cycles = new Map<string, ChoreCycleView>();
  for (const c of input.cycles) {
    cycles.set(c.board_id, {
      id: c.id,
      sequence: c.sequence,
      openedAt: c.opened_at,
    });
  }
  const columns = group(input.columns);
  const rows = group(input.rows);
  const completions = group(input.completions);
  const assignments = group(input.assignments);
  const selected = new Map<string, string[]>();
  for (const rc of input.rowColumns) {
    const list = selected.get(rc.row_id);
    if (list) list.push(rc.column_id);
    else selected.set(rc.row_id, [rc.column_id]);
  }

  return input.boards.map((b): ChoreBoardView => {
    const mappedColumns: ChoreColumnView[] = (columns.get(b.id) ?? []).map(
      (c) => ({
        id: c.id,
        label: c.label,
        profileId: c.profile_id,
        sortOrder: c.sort_order,
        isActive: c.is_active,
        archived: c.archived_at !== null,
      }),
    );
    const mappedRows: ChoreRowView[] = (rows.get(b.id) ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      instructions: r.instructions,
      isRequired: r.is_required,
      mode: oneOf(MODES, r.requirement_mode, "all_columns"),
      selectedColumnIds: selected.get(r.id) ?? [],
      sortOrder: r.sort_order,
      isActive: r.is_active,
      archived: r.archived_at !== null,
    }));
    const mappedCompletions: ChoreCompletionView[] = (
      completions.get(b.id) ?? []
    ).map((c) => ({
      rowId: c.row_id,
      columnId: c.column_id,
      completedBy: c.completed_by,
      completedByName: c.completed_by_name,
      completedAt: c.completed_at,
      enteredAs: oneOf(ENTRY, c.entered_as, "self"),
    }));
    const mappedAssignments: ChoreAssignmentView[] = (
      assignments.get(b.id) ?? []
    ).map((a) => ({
      columnId: a.column_id,
      profileId: a.profile_id,
      assignedAt: a.assigned_at,
      endedAt: a.ended_at,
    }));
    return {
      id: b.id,
      organizationId: b.organization_id,
      locationId: b.location_id,
      name: b.name,
      description: b.description,
      isActive: b.is_active,
      archived: b.archived_at !== null,
      sortOrder: b.sort_order,
      staffAccess: oneOf(ACCESS, b.staff_access, "own_column"),
      managerOverride: b.manager_override,
      defaultMode: oneOf(MODES, b.default_requirement_mode, "all_columns"),
      recurrenceIntent: oneOf(RECURRENCE, b.recurrence_intent, "continuous"),
      resetIntent: oneOf(RESET, b.reset_intent, "manual_restart"),
      version: b.version,
      cycle: cycles.get(b.id) ?? null,
      columns: mappedColumns,
      rows: mappedRows,
      completions: mappedCompletions,
      assignments: mappedAssignments,
    };
  });
}
