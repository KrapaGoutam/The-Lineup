import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";

import { getTasksPeople } from "./tasks-people";

import type { TaskHistoryData } from "../domain/task-history";
import {
  mapHistoryRow,
  TASK_HISTORY_COLUMNS,
  type TaskHistoryRow,
} from "./task-history-mapper";

// One bounded read of the most recent completions (newest first).
export const MAX_HISTORY_TASKS = 1000;

/**
 * Completed tasks (normal, Opening and Closing) for the Tasks → History tab.
 * Read through the caller's own Supabase session, so the same RLS that
 * governs the other Tasks screens decides which rows come back. Read-only;
 * it never writes and needs no schema change (`completed_by`, `completed_at`
 * and `task_assignments.assigned_at` already exist).
 */
export async function getTaskHistory(
  organizationId: string,
  scope: VerifiedLocationScope,
): Promise<TaskHistoryData | null> {
  if (scope.organizationId !== organizationId) return null;
  const location = { id: scope.locationId, time_zone: scope.timeZone };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_HISTORY_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", location.id)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(MAX_HISTORY_TASKS + 1)
    .overrideTypes<TaskHistoryRow[], { merge: false }>();
  if (error) {
    console.error("getTaskHistory: tasks", error);
    return null;
  }

  const all = data ?? [];
  const truncated = all.length > MAX_HISTORY_TASKS;
  const rows = all.slice(0, MAX_HISTORY_TASKS);

  const people = await getTasksPeople(scope);
  if (!people) return null;
  const names = new Map(
    people.map((person) => [person.profileId, person.name]),
  );

  return {
    entries: rows
      .filter(
        (row): row is TaskHistoryRow & { completed_at: string } =>
          row.completed_at !== null,
      )
      .map((row) => mapHistoryRow(row, names)),
    truncated,
  };
}
