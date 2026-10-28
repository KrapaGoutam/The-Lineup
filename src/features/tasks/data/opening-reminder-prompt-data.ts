import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  countIncompleteOpeningWork,
  type OpeningReminderPromptData,
} from "../domain/opening-reminder-popup";
import type { TaskViewer } from "../domain/task-types";
import {
  mapNotificationRow,
  mapTaskRow,
  NOTIFICATION_ROW_COLUMNS,
  TASK_ROW_COLUMNS,
  type NotificationRow,
  type TaskRow,
} from "./task-mapper";

// A location stores at most three reminders a day, so this spans more than a
// week of history while staying a single small read.
const MAX_REMINDERS = 30;
const MAX_OPENING_ITEMS = 500;

/**
 * The popup's read model (Tasks V1.1 T-5): a wake-up that asks the database to
 * evaluate, then reads back only the caller's own state.
 *
 * - The sweep takes the tenant and nothing else. The database decides which
 *   stage is due, whether work was incomplete, who is a recipient and whether
 *   the row already exists; this function never names a stage or a recipient.
 * - Reminders are the caller's own `opening_reminder` rows (RLS: own rows only).
 * - `currentIncomplete` is counted from live Opening items inside the caller's
 *   own work scope, so a reminder for work that has since been completed or
 *   cancelled does not interrupt anyone. Only the number leaves this function:
 *   a staff member never receives a coworker's item, name or count.
 *
 * Every read goes through the caller's session. A failed read returns null and
 * the client keeps whatever it last knew; it never treats a failure as "done".
 */
export async function getOpeningReminderPrompt(
  organizationId: string,
  viewer: TaskViewer,
): Promise<OpeningReminderPromptData | null> {
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const supabase = await createClient();
  const today = zonedWallTimeFromInstant(new Date(), location.time_zone).date;

  // Start today's checklists if nobody has yet (the same idempotent call the
  // Tasks snapshot makes), so a device left on another module still has the
  // day's Opening work for the sweep to judge.
  const generated = await supabase.rpc("checklist_generate_daily", {
    p_organization_id: organizationId,
    p_location_id: location.id,
  });
  if (generated.error) {
    console.error(
      "getOpeningReminderPrompt: checklist_generate_daily",
      generated.error,
    );
  }

  // Idempotent and best-effort; a failure only means no new reminder this wake.
  const swept = await supabase.rpc("task_opening_reminders_sweep", {
    p_organization_id: organizationId,
    p_location_id: location.id,
  });
  if (swept.error) {
    console.error(
      "getOpeningReminderPrompt: task_opening_reminders_sweep",
      swept.error,
    );
  }

  const [remindersResult, instancesResult] = await Promise.all([
    supabase
      .from("task_notifications")
      .select(NOTIFICATION_ROW_COLUMNS)
      .eq("recipient_profile_id", viewer.profileId)
      .eq("type", "opening_reminder")
      .order("id", { ascending: false })
      .limit(MAX_REMINDERS)
      .overrideTypes<NotificationRow[], { merge: false }>(),
    supabase
      .from("checklist_instances")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("location_id", location.id)
      .eq("service_date", today)
      .eq("kind", "opening"),
  ]);
  if (remindersResult.error || instancesResult.error) {
    console.error(
      "getOpeningReminderPrompt: read",
      remindersResult.error ?? instancesResult.error,
    );
    return null;
  }

  const instanceIds = (instancesResult.data ?? []).map((row) => row.id);
  let currentIncomplete = 0;
  if (instanceIds.length > 0) {
    const itemsResult = await supabase
      .from("tasks")
      .select(TASK_ROW_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("kind", "opening")
      .in("checklist_instance_id", instanceIds)
      .limit(MAX_OPENING_ITEMS)
      .overrideTypes<TaskRow[], { merge: false }>();
    if (itemsResult.error) {
      console.error("getOpeningReminderPrompt: items", itemsResult.error);
      return null;
    }
    currentIncomplete = countIncompleteOpeningWork(
      (itemsResult.data ?? []).map((row) => mapTaskRow(row, new Map())),
      new Set(instanceIds),
      viewer,
    );
  }

  return {
    today,
    locationId: location.id,
    currentIncomplete,
    reminders: (remindersResult.data ?? []).map(mapNotificationRow),
  };
}
