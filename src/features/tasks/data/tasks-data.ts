import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  DEFAULT_TASK_CATEGORIES,
  isTasksManager,
  type TaskEventView,
  type TaskView,
  type TaskViewer,
  type TasksSnapshot,
} from "../domain/task-types";
import {
  collectProfileIds,
  mapEventRow,
  mapTaskRow,
  TASK_ROW_COLUMNS,
  type TaskEventRow,
  type TaskRow,
} from "./task-mapper";

// Finished work stays visible for a bounded window; open work never ages out.
const FINISHED_WINDOW_DAYS = 14;
const MAX_TASKS = 500;
const MAX_EVENTS = 400;

/**
 * The authoritative Tasks read model for one signed-in person. Everything is
 * read through the caller's own Supabase session, so RLS (not this function)
 * decides which tasks and which audit rows come back; the manager gate on
 * events/team below only avoids pointless queries for staff.
 */
export async function getTasksSnapshot(
  organizationId: string,
  viewer: TaskViewer,
): Promise<TasksSnapshot | null> {
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const supabase = await createClient();
  const now = new Date();
  const today = zonedWallTimeFromInstant(now, location.time_zone).date;
  const cutoff = new Date(
    now.getTime() - FINISHED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const manager = isTasksManager(viewer.designation);

  const [tasksResult, categoriesResult, roster] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_ROW_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("location_id", location.id)
      .eq("kind", "task")
      .or(`status.in.(open,in_progress,blocked),updated_at.gte.${cutoff}`)
      .order("created_at", { ascending: false })
      .limit(MAX_TASKS)
      .overrideTypes<TaskRow[], { merge: false }>(),
    supabase
      .from("task_categories")
      .select("slug, name")
      .order("sort_order", { ascending: true }),
    manager ? getOrganizationRoster(organizationId) : Promise.resolve([]),
  ]);

  if (tasksResult.error) {
    console.error("getTasksSnapshot: tasks", tasksResult.error);
    return null;
  }
  const rows = tasksResult.data ?? [];

  let eventRows: TaskEventRow[] = [];
  if (manager && rows.length > 0) {
    const { data, error } = await supabase
      .from("task_events")
      .select("id, task_id, event_type, actor_profile_id, payload, created_at")
      .eq("organization_id", organizationId)
      .in(
        "task_id",
        rows.map((row) => row.id),
      )
      .order("id", { ascending: false })
      .limit(MAX_EVENTS)
      .overrideTypes<TaskEventRow[], { merge: false }>();
    if (error) console.error("getTasksSnapshot: events", error);
    eventRows = data ?? [];
  }

  const profileIds = collectProfileIds(rows, eventRows);
  const names = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const profile of data ?? [])
      names.set(profile.id, profile.display_name);
  }

  const tasks: TaskView[] = rows.map((row) => mapTaskRow(row, names));
  const events: TaskEventView[] = eventRows.map((row) =>
    mapEventRow(row, names),
  );

  return {
    organizationId,
    locationId: location.id,
    timeZone: location.time_zone,
    today,
    generatedAt: now.toISOString(),
    tasks,
    events,
    team: roster
      .filter((member) => member.active !== false)
      .map((member) => ({
        profileId: member.id,
        name: member.name,
        designation: member.designation,
      })),
    categories:
      categoriesResult.data && categoriesResult.data.length > 0
        ? categoriesResult.data
        : DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c })),
  };
}
