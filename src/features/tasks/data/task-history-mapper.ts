import type { TaskHistoryEntry } from "../domain/task-history";
import type { AssignmentMode, PersonRef, TaskKind } from "../domain/task-types";

/** The columns History reads from `public.tasks` (plus its assignment embed). */
export type TaskHistoryRow = {
  id: string;
  kind: TaskKind;
  title: string;
  assignment_mode: AssignmentMode;
  completed_by: string | null;
  completed_at: string | null;
  task_assignments: { profile_id: string; assigned_at: string }[];
};

export const TASK_HISTORY_COLUMNS =
  "id, kind, title, assignment_mode, completed_by, completed_at, task_assignments(profile_id, assigned_at)";

function person(
  profileId: string | null,
  names: ReadonlyMap<string, string>,
): PersonRef | null {
  if (!profileId) return null;
  return { profileId, name: names.get(profileId) ?? "Former team member" };
}

export function collectHistoryProfileIds(
  rows: readonly TaskHistoryRow[],
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.completed_by) ids.add(row.completed_by);
    for (const a of row.task_assignments) ids.add(a.profile_id);
  }
  return [...ids];
}

/** Rows without a completion instant are not history; callers filter them. */
export function mapHistoryRow(
  row: TaskHistoryRow & { completed_at: string },
  names: ReadonlyMap<string, string>,
): TaskHistoryEntry {
  const assignedTimes = row.task_assignments
    .map((a) => a.assigned_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    assignmentMode: row.assignment_mode,
    assignees: row.task_assignments
      .map((a) => person(a.profile_id, names))
      .filter((p): p is PersonRef => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    completedBy: person(row.completed_by, names),
    completedAt: row.completed_at,
    // The earliest stored assignment; null when nobody was named.
    assignedAt: assignedTimes[0] ?? null,
  };
}
