"use server";

import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getTasksSnapshot } from "@/features/tasks/data/tasks-data";
import {
  taskCommandSchema,
  type SeriesInput,
  type TaskCommand,
} from "@/features/tasks/domain/task-commands";
import type { TasksSnapshot } from "@/features/tasks/domain/task-types";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type TasksActionResult =
  | { ok: true; data: TasksSnapshot }
  | { ok: false; error: string; sessionInvalid?: true };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function resolveCaller(restaurantSlug: string) {
  const user = await getCurrentUser(restaurantSlug);
  if (!user) return null;
  return {
    organizationId: user.organizationId,
    viewer: {
      profileId: user.profileId,
      name: user.name,
      designation: user.designation,
    },
  };
}

/** SeriesInput -> the shared argument list of task_series_create / _update. */
function seriesArgs(i: SeriesInput) {
  return {
    p_title: i.title,
    p_instructions: i.instructions ?? null,
    p_category: i.category,
    p_priority: i.priority,
    p_assignment_mode: i.assignmentMode,
    p_assignee_ids: i.assigneeIds,
    p_due_time: i.dueTime ?? null,
    p_due_window: i.dueWindow ?? null,
    p_frequency: i.frequency,
    p_weekdays: i.weekdays ?? null,
    p_day_of_month: i.dayOfMonth ?? null,
    p_starts_on: i.startsOn,
    p_end_type: i.endType,
    p_ends_on: i.endsOn ?? null,
    p_max_occurrences: i.maxOccurrences ?? null,
  };
}

/** Every failure the database raises is already a plain-language sentence. */
function friendly(message: string | undefined): string {
  return message && message.length < 200
    ? message
    : "That didn't work. Please try again.";
}

async function runCommand(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  command: TaskCommand,
): Promise<string | null> {
  switch (command.type) {
    case "create": {
      const i = command.input;
      const { error } = await supabase.rpc("task_create", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_title: i.title,
        p_instructions: i.instructions ?? null,
        p_category: i.category,
        p_priority: i.priority,
        p_assignment_mode: i.assignmentMode,
        p_assignee_ids: i.assigneeIds,
        p_each_person: i.eachPerson,
        p_start_date: i.startDate ?? null,
        p_due_date: i.dueDate ?? null,
        p_due_time: i.dueTime ?? null,
        p_due_window: i.dueWindow ?? null,
      });
      return error?.message ?? null;
    }
    case "update": {
      const i = command.input;
      const { error } = await supabase.rpc("task_update", {
        p_task_id: command.taskId,
        p_title: i.title,
        p_instructions: i.instructions ?? null,
        p_category: i.category,
        p_priority: i.priority,
        p_start_date: i.startDate ?? null,
        p_due_date: i.dueDate ?? null,
        p_due_time: i.dueTime ?? null,
        p_due_window: i.dueWindow ?? null,
      });
      return error?.message ?? null;
    }
    case "assign": {
      const { error } = await supabase.rpc("task_assign", {
        p_task_id: command.taskId,
        p_assignment_mode: command.assignmentMode,
        p_assignee_ids: command.assigneeIds,
      });
      return error?.message ?? null;
    }
    case "setStatus": {
      const { error } = await supabase.rpc("task_set_status", {
        p_task_id: command.taskId,
        p_status: command.status,
        p_reason: command.reason ?? null,
      });
      return error?.message ?? null;
    }
    case "complete": {
      const { error } = await supabase.rpc("task_complete", {
        p_task_id: command.taskId,
        p_note: command.note ?? null,
      });
      return error?.message ?? null;
    }
    case "reopen": {
      const { error } = await supabase.rpc("task_reopen", {
        p_task_id: command.taskId,
      });
      return error?.message ?? null;
    }
    case "cancel": {
      const { error } = await supabase.rpc("task_cancel", {
        p_task_id: command.taskId,
        p_reason: command.reason ?? null,
      });
      return error?.message ?? null;
    }
    case "notificationsRead": {
      const { error } = await supabase.rpc("task_notifications_mark_read", {
        p_ids: command.ids ?? null,
      });
      return error?.message ?? null;
    }
    case "seriesCreate": {
      const i = command.input;
      const { error } = await supabase.rpc("task_series_create", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        ...seriesArgs(i),
      });
      return error?.message ?? null;
    }
    case "seriesUpdate": {
      const { error } = await supabase.rpc("task_series_update", {
        p_rule_id: command.ruleId,
        ...seriesArgs(command.input),
      });
      return error?.message ?? null;
    }
    case "seriesStop": {
      const { error } = await supabase.rpc("task_series_stop", {
        p_rule_id: command.ruleId,
      });
      return error?.message ?? null;
    }
    case "templateSave": {
      const i = command.input;
      const { error } = await supabase.rpc("checklist_template_save", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_template_id: command.templateId ?? null,
        p_kind: i.kind,
        p_name: i.name,
        p_days_of_week: i.daysOfWeek,
        p_active: i.active,
        p_items: i.items.map((item) => ({
          title: item.title,
          instructions: item.instructions,
          category: item.category,
          priority: item.priority,
          assignment_mode: item.assignmentMode,
          assignee_ids: item.assigneeIds,
          due_window: item.dueWindow,
          due_time: item.dueTime,
        })),
      });
      return error?.message ?? null;
    }
    case "templateSetActive": {
      const { error } = await supabase.rpc("checklist_template_set_active", {
        p_template_id: command.templateId,
        p_active: command.active,
      });
      return error?.message ?? null;
    }
    case "carryForward": {
      const { error } = await supabase.rpc("task_carry_forward", {
        p_task_ids: command.taskIds,
        p_new_due_date: command.newDueDate,
      });
      return error?.message ?? null;
    }
  }
}

/**
 * Authoritative read. Called on mount, on window focus and after reconnects
 * so a missed update (Realtime or otherwise) can never leave stale state.
 */
export async function getTasksSnapshotAction(input: {
  restaurantSlug: string;
}): Promise<TasksActionResult> {
  const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) return { ok: false, error: "You need to sign in to see tasks." };

  const snapshot = await getTasksSnapshot(caller.organizationId, caller.viewer);
  if (!snapshot) return { ok: false, error: "Tasks could not be loaded." };
  return { ok: true, data: snapshot };
}

/**
 * One validated write, then the authoritative snapshot. The client never
 * treats its own optimistic state as truth: whatever this returns replaces
 * it, and on failure the client discards its optimistic state and refetches.
 */
export async function runTaskCommandAction(input: {
  restaurantSlug: string;
  command: TaskCommand;
}): Promise<TasksActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, command: taskCommandSchema })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That request is invalid.",
    };
  }

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) return { ok: false, error: "You need to sign in to do that." };

  const location = await getPrimaryLocation(caller.organizationId);
  if (!location) return { ok: false, error: "No location is set up yet." };

  const failure = await runCommand(
    supabase,
    caller.organizationId,
    location.id,
    parsed.data.command,
  );
  if (failure) return { ok: false, error: friendly(failure) };

  const snapshot = await getTasksSnapshot(caller.organizationId, caller.viewer);
  if (!snapshot) return { ok: false, error: "Tasks could not be loaded." };
  return { ok: true, data: snapshot };
}

/**
 * Lightweight unread count for the Tasks tab badge. Reads only the caller's
 * own rows (RLS), so it is safe to call on every focus.
 */
export async function getTasksUnreadCountAction(input: {
  restaurantSlug: string;
}): Promise<{ ok: true; unread: number } | { ok: false }> {
  const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  const { count, error } = await supabase
    .from("task_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", data.user.id)
    .is("read_at", null);
  if (error) return { ok: false };
  return { ok: true, unread: count ?? 0 };
}
