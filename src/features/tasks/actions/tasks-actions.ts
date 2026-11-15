"use server";

import { z } from "zod";

import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import {
  guardModule,
  guardModuleForSlug,
} from "@/features/modules/data/module-enforcement";
import { getOpeningReminderPrompt } from "@/features/tasks/data/opening-reminder-prompt-data";
import { getTaskHistory } from "@/features/tasks/data/task-history-data";
import { getTasksSnapshot } from "@/features/tasks/data/tasks-data";
import {
  taskCommandSchema,
  type SeriesInput,
  type TaskCommand,
} from "@/features/tasks/domain/task-commands";
import type { OpeningReminderPromptData } from "@/features/tasks/domain/opening-reminder-popup";
import type { TaskHistoryData } from "@/features/tasks/domain/task-history";
import type { TasksSnapshot } from "@/features/tasks/domain/task-types";
import { getTasksActor } from "@/features/tasks/data/tasks-actor";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

/**
 * `contextStale`: the server refused because the workspace the tab shows is no
 * longer the one it would operate on (V2-003.005). No mutation was attempted.
 */
export type TasksActionResult =
  | { ok: true; data: TasksSnapshot }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Supabase = Awaited<ReturnType<typeof createClient>>;

const resolveCaller = getTasksActor;

type Caller = NonNullable<Awaited<ReturnType<typeof resolveCaller>>>;

/**
 * V2-003.005: the browser's `expectedContext` (profile, organization,
 * location it is showing) is an untrusted assertion. It must agree with the
 * identity and operational location the SERVER verifies itself; otherwise the
 * request is refused before any read or write, with nothing substituted.
 */
async function checkWorkspace(raw: unknown, caller: Caller) {
  const outcome = await assertWorkspaceExpectation(
    raw,
    {
      profileId: caller.viewer.profileId,
      organizationId: caller.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: caller.scope.locationId,
        time_zone: caller.scope.timeZone,
      }),
    },
  );
  if (outcome.ok) return { ok: true as const, location: outcome.location };
  if (outcome.code === "invalid") {
    return {
      ok: false as const,
      result: { ok: false as const, error: "That request is invalid." },
    };
  }
  return {
    ok: false as const,
    result: {
      ok: false as const,
      error: STALE_CONTEXT_MESSAGE,
      contextStale: true as const,
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
  const target =
    "taskId" in command
      ? { table: "tasks" as const, ids: [command.taskId] }
      : "taskIds" in command
        ? { table: "tasks" as const, ids: command.taskIds }
        : "ruleId" in command
          ? { table: "task_recurrence_rules" as const, ids: [command.ruleId] }
          : "templateId" in command && command.templateId
            ? {
                table: "checklist_templates" as const,
                ids: [command.templateId],
              }
            : null;
  if (target) {
    const found = await supabase
      .from(target.table)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .in("id", target.ids);
    if (found.error || found.data?.length !== new Set(target.ids).size) {
      return "That work is not available in this location.";
    }
  }
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
      const { error } = await supabase.rpc(
        "task_notifications_mark_location_read",
        {
          p_organization_id: organizationId,
          p_location_id: locationId,
          p_ids: command.ids,
        },
      );
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
  expectedContext?: unknown;
}): Promise<TasksActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, expectedContext: z.unknown() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) return { ok: false, error: "You need to sign in to see tasks." };

  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  // V2-004.004: the module must be turned on at the VERIFIED location.
  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const snapshot = await getTasksSnapshot(
    caller.organizationId,
    caller.viewer,
    caller.scope,
  );
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
  /** REQUIRED: the workspace the caller is looking at (see `checkWorkspace`). */
  expectedContext: unknown;
}): Promise<TasksActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      command: taskCommandSchema,
      expectedContext: z.unknown(),
    })
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
  if (!caller)
    return { ok: false, error: STALE_CONTEXT_MESSAGE, contextStale: true };

  // Refused here -- before ANY database write -- when what the tab shows is
  // not what the server authorizes. The location used below is the one the
  // server verified, never the one the browser asserted.
  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  // V2-004.004: no write when the module is off at the verified location.
  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const failure = await runCommand(
    supabase,
    caller.organizationId,
    workspace.location.id,
    parsed.data.command,
  );
  if (failure) return { ok: false, error: friendly(failure) };

  const snapshot = await getTasksSnapshot(
    caller.organizationId,
    caller.viewer,
    caller.scope,
  );
  if (!snapshot) return { ok: false, error: "Tasks could not be loaded." };
  return { ok: true, data: snapshot };
}

export type TaskHistoryActionResult =
  | { ok: true; data: TaskHistoryData }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

/** Read-only: completed tasks for Tasks → History, scoped by the caller's RLS. */
export async function getTaskHistoryAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<TaskHistoryActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, expectedContext: z.unknown() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) {
    return { ok: false, error: "You need to sign in to see task history." };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const history = await getTaskHistory(caller.organizationId, caller.scope);
  if (!history)
    return { ok: false, error: "Task history could not be loaded." };
  return { ok: true, data: history };
}

/**
 * Lightweight unread count for the Tasks tab badge. Reads only the caller's
 * own rows (RLS), so it is safe to call on every focus.
 */
export async function getTasksUnreadCountAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<{ ok: true; unread: number } | { ok: false }> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, expectedContext: z.unknown() })
    .safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  if (await requireLiveSession(supabase)) return { ok: false };
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) return { ok: false };
  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return { ok: false };
  if (
    await guardModuleForSlug("tasks", parsed.data.restaurantSlug, {
      resolveOrganizationId: async () => caller.organizationId,
      resolveLocation: async () => workspace.location,
    })
  )
    return { ok: false };
  const { count, error } = await supabase
    .from("task_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", caller.viewer.profileId)
    .eq("organization_id", caller.organizationId)
    .eq("location_id", workspace.location.id)
    .is("read_at", null);
  if (error) return { ok: false };
  return { ok: true, unread: count ?? 0 };
}

export type OpeningReminderPromptResult =
  | { ok: true; data: OpeningReminderPromptData }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

/**
 * Client wake-up for the Opening reminder popup. Takes the restaurant only:
 * the client cannot name a stage, a recipient or a time. The database sweeps
 * (idempotent, safe from many tabs) and this returns the caller's own reminders
 * plus whether Opening work in their scope is still incomplete.
 */
export async function getOpeningReminderPromptAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<OpeningReminderPromptResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, expectedContext: z.unknown() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (!caller) return { ok: false, error: "You need to sign in to see tasks." };

  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;
  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const data = await getOpeningReminderPrompt(
    caller.organizationId,
    caller.viewer,
    caller.scope,
  );
  if (!data) return { ok: false, error: "Reminders could not be loaded." };
  return { ok: true, data };
}

/**
 * Acknowledges (marks read) the caller's own reminder notification(s) through
 * the same RPC as the inbox. Read state only: no task, checklist or
 * assignment is touched, and the RPC only ever updates the caller's rows.
 */
export async function acknowledgeOpeningReminderAction(input: {
  restaurantSlug: string;
  ids: number[];
}): Promise<
  { ok: true } | { ok: false; error: string; sessionInvalid?: true }
> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      ids: z.array(z.number().int().positive()).min(1).max(10),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  // Dismissal is an own-recipient recovery operation, even after location
  // access is revoked or the optional module is disabled. SQL validates identity.
  const { error } = await supabase.rpc("task_notifications_mark_read", {
    p_ids: parsed.data.ids,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}
