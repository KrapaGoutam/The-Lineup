import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeToInstant } from "@/lib/timezone";

import type { FeedTask } from "../domain/history-feed";
import type { TaskEventView } from "../domain/task-types";
import { getTasksPeople } from "./tasks-people";
import {
  mapEventRow,
  mapTaskRow,
  TASK_ROW_COLUMNS,
  TASK_STEP_EMBED,
  type TaskEventRow,
  type TaskRow,
} from "./task-mapper";

// Activity for the most recent tasks only (managers); the detail dialog shows it.
const MAX_FEED_EVENT_TASKS = 300;
const MAX_FEED_EVENTS = 600;

/** One bounded read per group; older work is reached by choosing its month. */
export const MAX_FEED_TASKS = 1000;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

type FeedRow = Omit<TaskRow, "task_assignments"> & {
  task_assignments: { profile_id: string; assigned_at: string }[];
  archived_at: string | null;
};

const FEED_COLUMNS = `${TASK_ROW_COLUMNS.replace(
  "task_assignments(profile_id)",
  "task_assignments(profile_id, assigned_at)",
)}, archived_at${TASK_STEP_EMBED}`;

export type TaskHistoryFeed = {
  tasks: FeedTask[];
  /** Manager-only audit timeline rows for the most recent tasks above. */
  events: TaskEventView[];
  /** More work exists than one bounded read returned (choose a month to narrow). */
  truncated: boolean;
};

function monthBounds(
  month: string,
  timeZone: string,
): { startDate: string; endDate: string; start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const at = (date: string) =>
    zonedWallTimeToInstant({ date, time: "00:00", timeZone }).toISOString();
  return { startDate, endDate, start: at(startDate), end: at(endDate) };
}

/**
 * Everything Tasks -> History groups: completed tasks of every kind, plus the
 * ordinary tasks that are NOT completed (Not Started, In Progress, Blocked,
 * Cancelled; archived ones left the register and are not listed). Read through the
 * caller's own session, so the same RLS as every other Tasks screen decides what
 * comes back. With `month` ("YYYY-MM", location-local) each group is bounded to that
 * month by the same rule the History view groups by.
 */
export async function getTaskHistoryFeed(
  organizationId: string,
  scope: VerifiedLocationScope,
  month: string | null,
  manager: boolean,
): Promise<TaskHistoryFeed | null> {
  if (scope.organizationId !== organizationId) return null;
  if (month !== null && !MONTH.test(month)) return null;
  const supabase = await createClient();
  const bounds = month ? monthBounds(month, scope.timeZone) : null;

  let completed = supabase
    .from("tasks")
    .select(FEED_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", scope.locationId)
    .eq("status", "completed")
    .not("completed_at", "is", null);
  if (bounds) {
    completed = completed
      .gte("completed_at", bounds.start)
      .lt("completed_at", bounds.end);
  }

  let open = supabase
    .from("tasks")
    .select(FEED_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", scope.locationId)
    .eq("kind", "task")
    .is("archived_at", null)
    .in("status", ["open", "in_progress", "blocked", "cancelled"]);
  if (bounds) {
    open = open.or(
      `and(due_date.gte.${bounds.startDate},due_date.lt.${bounds.endDate}),and(due_date.is.null,created_at.gte.${bounds.start},created_at.lt.${bounds.end})`,
    );
  }

  const [done, notDone, people] = await Promise.all([
    completed
      .order("completed_at", { ascending: false })
      .limit(MAX_FEED_TASKS + 1)
      .overrideTypes<FeedRow[], { merge: false }>(),
    open
      .order("created_at", { ascending: false })
      .limit(MAX_FEED_TASKS + 1)
      .overrideTypes<FeedRow[], { merge: false }>(),
    getTasksPeople(scope),
  ]);
  if (done.error || notDone.error || !people) {
    console.error(
      "getTaskHistoryFeed",
      done.error?.message ?? notDone.error?.message,
    );
    return null;
  }
  const names = new Map(people.map((p) => [p.profileId, p.name]));
  const doneRows = done.data ?? [];
  const openRows = notDone.data ?? [];
  const truncated =
    doneRows.length > MAX_FEED_TASKS || openRows.length > MAX_FEED_TASKS;

  const tasks = [
    ...doneRows.slice(0, MAX_FEED_TASKS),
    ...openRows.slice(0, MAX_FEED_TASKS),
  ].map((row): FeedTask => {
    const assigned = row.task_assignments
      .map((a) => a.assigned_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return {
      task: mapTaskRow(row, names),
      assignedAt: assigned[0] ?? null,
      archived: row.archived_at !== null,
    };
  });

  let events: TaskEventView[] = [];
  if (manager && tasks.length > 0) {
    const { data, error } = await supabase
      .from("task_events")
      .select("id, task_id, event_type, actor_profile_id, payload, created_at")
      .eq("organization_id", organizationId)
      .in(
        "task_id",
        tasks.slice(0, MAX_FEED_EVENT_TASKS).map((t) => t.task.id),
      )
      .order("id", { ascending: false })
      .limit(MAX_FEED_EVENTS)
      .overrideTypes<TaskEventRow[], { merge: false }>();
    if (error) {
      console.error("getTaskHistoryFeed: events", error.message);
    } else {
      events = (data ?? []).map((row) => mapEventRow(row, names));
    }
  }
  return { tasks, events, truncated };
}
