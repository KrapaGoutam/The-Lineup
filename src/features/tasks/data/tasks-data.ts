import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";
import { addDaysToDate } from "../domain/task-rules";

import {
  DEFAULT_TASK_CATEGORIES,
  type ChecklistInstanceView,
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
  mapTemplateRow,
  TASK_ROW_COLUMNS,
  TEMPLATE_ROW_COLUMNS,
  type TemplateRow,
  type TaskEventRow,
  type TaskRow,
} from "./task-mapper";

// Finished work stays visible for a bounded window; open work never ages out.
const FINISHED_WINDOW_DAYS = 14;
const MAX_TASKS = 500;
const MAX_EVENTS = 400;
// Bounded checklist history: staff see the last week, managers the last month.
const STAFF_HISTORY_DAYS = 7;
const MANAGER_HISTORY_DAYS = 30;

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

  // Start today's checklists if nobody has yet. Idempotent and best-effort:
  // the snapshot below is still correct (just without a new day) if it fails.
  const generated = await supabase.rpc("checklist_generate_daily", {
    p_organization_id: organizationId,
    p_location_id: location.id,
  });
  if (generated.error) {
    console.error(
      "getTasksSnapshot: checklist_generate_daily",
      generated.error,
    );
  }

  const historyFrom = addDaysToDate(
    today,
    -(manager ? MANAGER_HISTORY_DAYS : STAFF_HISTORY_DAYS),
  );

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

  const instanceResult = await supabase
    .from("checklist_instances")
    .select("id, kind, name, service_date")
    .eq("organization_id", organizationId)
    .eq("location_id", location.id)
    .gte("service_date", historyFrom)
    .order("service_date", { ascending: false })
    .order("name", { ascending: true })
    .limit(200);
  if (instanceResult.error) {
    console.error("getTasksSnapshot: instances", instanceResult.error);
  }
  const instanceRows = instanceResult.data ?? [];
  let itemRows: TaskRow[] = [];
  if (instanceRows.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_ROW_COLUMNS)
      .eq("organization_id", organizationId)
      .in(
        "checklist_instance_id",
        instanceRows.map((row) => row.id),
      )
      .order("sort_order", { ascending: true })
      .limit(2000)
      .overrideTypes<TaskRow[], { merge: false }>();
    if (error) console.error("getTasksSnapshot: checklist items", error);
    itemRows = data ?? [];
  }

  let templateRows: TemplateRow[] = [];
  if (manager) {
    const { data, error } = await supabase
      .from("checklist_templates")
      .select(TEMPLATE_ROW_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("location_id", location.id)
      .order("kind", { ascending: true })
      .order("name", { ascending: true })
      .overrideTypes<TemplateRow[], { merge: false }>();
    if (error) console.error("getTasksSnapshot: templates", error);
    templateRows = data ?? [];
  }

  let eventRows: TaskEventRow[] = [];
  if (manager && rows.length + itemRows.length > 0) {
    const { data, error } = await supabase
      .from("task_events")
      .select("id, task_id, event_type, actor_profile_id, payload, created_at")
      .eq("organization_id", organizationId)
      .in(
        "task_id",
        [...rows, ...itemRows.filter((r) => r.checklist_instance_id)]
          .slice(0, 800)
          .map((row) => row.id),
      )
      .order("id", { ascending: false })
      .limit(MAX_EVENTS)
      .overrideTypes<TaskEventRow[], { merge: false }>();
    if (error) console.error("getTasksSnapshot: events", error);
    eventRows = data ?? [];
  }

  const profileIds = collectProfileIds([...rows, ...itemRows], eventRows);
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
  const itemsByInstance = new Map<string, TaskView[]>();
  for (const row of itemRows) {
    if (!row.checklist_instance_id) continue;
    const list = itemsByInstance.get(row.checklist_instance_id) ?? [];
    list.push(mapTaskRow(row, names));
    itemsByInstance.set(row.checklist_instance_id, list);
  }
  const checklists: ChecklistInstanceView[] = instanceRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    serviceDate: row.service_date,
    items: itemsByInstance.get(row.id) ?? [],
  }));
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
    checklists,
    templates: templateRows.map(mapTemplateRow),
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
