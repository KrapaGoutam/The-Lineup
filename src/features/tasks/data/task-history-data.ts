import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { createClient } from "@/lib/supabase/server";

import type { TaskHistoryData } from "../domain/task-history";
import {
  collectHistoryProfileIds,
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
): Promise<TaskHistoryData | null> {
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

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

  const names = new Map<string, string>();
  const profileIds = collectHistoryProfileIds(rows);
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.display_name);
    }
  }

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
