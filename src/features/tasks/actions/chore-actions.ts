"use server";

import { z } from "zod";

import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import { guardModule } from "@/features/modules/data/module-enforcement";
import {
  getChoreHistory,
  getChoreRunDetail,
  getChoreSnapshot,
} from "@/features/tasks/data/chore-data";
import { getTasksActor } from "@/features/tasks/data/tasks-actor";
import {
  choreCommandSchema,
  type ChoreCommand,
} from "@/features/tasks/domain/chore-commands";
import type {
  ChoreHistoryData,
  ChoreRunDetail,
  ChoreSnapshot,
} from "@/features/tasks/domain/chore-types";
import { isTasksManager } from "@/features/tasks/domain/task-types";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

/**
 * V2.0.13 Batch B. `contextStale`: the server refused because the workspace the
 * tab shows is no longer the one it would operate on; nothing was attempted.
 */
export type ChoreActionResult =
  | {
      ok: true;
      data: ChoreSnapshot;
      /**
       * `cellSet`: "checked", "unchecked", "unchanged" or "checked_closed" (the tick
       * finished an auto-reset run). `cycleClose`: "closed" or "already_closed".
       * `cycleStart`: "started" or "already_open". `cycleCorrect`: "corrected" or "unchanged".
       */
      outcome?: string;
    }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Caller = NonNullable<Awaited<ReturnType<typeof getTasksActor>>>;

/** Every failure the database raises is already a plain-language sentence. */
function friendly(message: string | undefined): string {
  return message && message.length < 200
    ? message
    : "That didn't work. Please try again.";
}

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

const NOT_HERE = "That board is not available in this location.";

/**
 * The boards a command names must belong to the location the server verified.
 * The RPCs re-check the board's own location too; this keeps a person who
 * manages two branches from operating branch B while the tab shows branch A.
 */
async function boardsAreHere(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  boardIds: string[],
): Promise<boolean> {
  const unique = [...new Set(boardIds)];
  if (unique.length === 0) return true;
  const found = await supabase
    .from("chore_boards")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .in("id", unique);
  return !found.error && found.data?.length === unique.length;
}

/** Resolves the board of a column / chore id, then applies the same check. */
async function childBoardId(
  supabase: Supabase,
  table: "chore_columns" | "chore_rows" | "chore_cycles",
  id: string,
): Promise<string | null> {
  const found = await supabase
    .from(table)
    .select("board_id")
    .eq("id", id)
    .maybeSingle();
  return found.error ? null : (found.data?.board_id ?? null);
}

async function runCommand(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  command: ChoreCommand,
  out: { outcome?: string },
): Promise<string | null> {
  let boardIds: string[] = [];
  if ("boardId" in command && command.boardId) boardIds = [command.boardId];
  if (command.type === "boardsReorder") boardIds = command.boardIds;
  if (command.type === "columnSetState") {
    const board = await childBoardId(
      supabase,
      "chore_columns",
      command.columnId,
    );
    if (!board) return NOT_HERE;
    boardIds = [board];
  }
  if (command.type === "rowSetState") {
    const board = await childBoardId(supabase, "chore_rows", command.rowId);
    if (!board) return NOT_HERE;
    boardIds = [board];
  }
  if (command.type === "cycleCorrect") {
    const board = await childBoardId(supabase, "chore_cycles", command.cycleId);
    if (!board) return NOT_HERE;
    boardIds = [board];
  }
  if (!(await boardsAreHere(supabase, organizationId, locationId, boardIds))) {
    return NOT_HERE;
  }

  // Every RPC argument is sent explicitly (PostgREST needs the full list).
  switch (command.type) {
    case "boardSave": {
      const { error } = await supabase.rpc("chore_board_save", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_board_id: command.boardId,
        p_name: command.name,
        p_description: command.description,
        p_staff_access: command.staffAccess,
        p_manager_override: command.managerOverride,
        p_default_mode: command.defaultMode,
        p_recurrence_intent: command.recurrenceIntent,
        p_reset_intent: command.resetIntent,
        p_expected_version: command.expectedVersion,
      });
      return error?.message ?? null;
    }
    case "boardSetState": {
      const { error } = await supabase.rpc("chore_board_set_state", {
        p_board_id: command.boardId,
        p_state: command.state,
      });
      return error?.message ?? null;
    }
    case "boardDuplicate": {
      const { error } = await supabase.rpc("chore_board_duplicate", {
        p_board_id: command.boardId,
        p_name: command.name,
      });
      return error?.message ?? null;
    }
    case "boardsReorder": {
      const { error } = await supabase.rpc("chore_board_reorder", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_board_ids: command.boardIds,
      });
      return error?.message ?? null;
    }
    case "columnSave": {
      const { error } = await supabase.rpc("chore_column_save", {
        p_board_id: command.boardId,
        p_column_id: command.columnId,
        p_label: command.label,
        p_profile_id: command.profileId,
      });
      return error?.message ?? null;
    }
    case "columnSetState": {
      const { error } = await supabase.rpc("chore_column_set_state", {
        p_column_id: command.columnId,
        p_state: command.state,
      });
      return error?.message ?? null;
    }
    case "columnsReorder": {
      const { error } = await supabase.rpc("chore_columns_reorder", {
        p_board_id: command.boardId,
        p_column_ids: command.columnIds,
      });
      return error?.message ?? null;
    }
    case "rowSave": {
      const { error } = await supabase.rpc("chore_row_save", {
        p_board_id: command.boardId,
        p_row_id: command.rowId,
        p_title: command.title,
        p_instructions: command.instructions,
        p_required: command.required,
        p_mode: command.mode,
        p_column_ids: command.columnIds,
      });
      return error?.message ?? null;
    }
    case "rowSetState": {
      const { error } = await supabase.rpc("chore_row_set_state", {
        p_row_id: command.rowId,
        p_state: command.state,
      });
      return error?.message ?? null;
    }
    case "rowsReorder": {
      const { error } = await supabase.rpc("chore_rows_reorder", {
        p_board_id: command.boardId,
        p_row_ids: command.rowIds,
      });
      return error?.message ?? null;
    }
    case "cellSet": {
      // No actor argument exists: the database uses the authenticated caller.
      const { data, error } = await supabase.rpc("chore_cell_set", {
        p_board_id: command.boardId,
        p_row_id: command.rowId,
        p_column_id: command.columnId,
        p_done: command.done,
        p_expected_cycle_id: command.cycleId ?? null,
      });
      if (error) return error.message;
      out.outcome = typeof data === "string" ? data : undefined;
      return null;
    }
    case "cycleClose": {
      const { data, error } = await supabase.rpc("chore_cycle_close", {
        p_board_id: command.boardId,
        p_expected_cycle_id: command.cycleId,
        p_outcome: command.outcome,
        p_note: command.note,
        p_start_next: command.startNext,
      });
      if (error) return error.message;
      out.outcome = resultOf(data);
      return null;
    }
    case "cycleStart": {
      const { data, error } = await supabase.rpc("chore_cycle_start", {
        p_board_id: command.boardId,
      });
      if (error) return error.message;
      out.outcome = resultOf(data);
      return null;
    }
    case "cycleCorrect": {
      const { data, error } = await supabase.rpc("chore_cycle_correct", {
        p_cycle_id: command.cycleId,
        p_row_id: command.rowId,
        p_column_id: command.columnId,
        p_done: command.done,
        p_reason: command.reason,
      });
      if (error) return error.message;
      out.outcome = typeof data === "string" ? data : undefined;
      return null;
    }
    case "cyclesSweep": {
      const { error } = await supabase.rpc("chore_cycles_sweep", {
        p_organization_id: organizationId,
        p_location_id: locationId,
      });
      return error?.message ?? null;
    }
  }
}

/** The jsonb the cycle RPCs return carries a short `result` word. */
function resultOf(data: unknown): string | undefined {
  if (data && typeof data === "object" && "result" in data) {
    const result = (data as { result?: unknown }).result;
    return typeof result === "string" ? result : undefined;
  }
  return undefined;
}

export type ChoreHistoryActionResult =
  | { ok: true; data: ChoreHistoryData }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

export type ChoreRunDetailActionResult =
  | { ok: true; data: ChoreRunDetail }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

/**
 * What a read action needs before the module gate: live session, verified caller and
 * workspace. The module gate itself is called by each exported action (the
 * enforcement-coverage test requires it in the action body).
 */
async function readerFor(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}) {
  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return { ok: false as const, result: invalid };
  const caller = await getTasksActor(input.restaurantSlug);
  if (!caller) {
    return {
      ok: false as const,
      result: {
        ok: false as const,
        error: "You need to sign in to see chore history.",
      },
    };
  }
  const workspace = await checkWorkspace(input.expectedContext, caller);
  if (!workspace.ok) return { ok: false as const, result: workspace.result };
  return {
    ok: true as const,
    caller,
    location: workspace.location,
    viewer: {
      profileId: caller.viewer.profileId,
      name: caller.viewer.name,
      isManager: isTasksManager(caller.viewer.designation),
    },
  };
}

/** Finished chore runs for the History tab: bounded, by month and (optionally) by board. */
export async function getChoreHistoryAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
  /** "YYYY-MM" or null for the most recent runs of any month. */
  month: string | null;
  boardId: string | null;
}): Promise<ChoreHistoryActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      expectedContext: z.unknown(),
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .nullable(),
      boardId: z.string().trim().min(1).max(64).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const reader = await readerFor(parsed.data);
  if (!reader.ok) return reader.result;
  const blocked = await guardModule({
    module: "tasks",
    organizationId: reader.caller.organizationId,
    location: reader.location,
  });
  if (blocked) return blocked;
  const data = await getChoreHistory(
    reader.caller.organizationId,
    reader.caller.scope,
    { month: parsed.data.month, boardId: parsed.data.boardId },
  );
  if (!data) return { ok: false, error: "Chore history could not be loaded." };
  return { ok: true, data };
}

/** One finished run with its frozen matrix and corrections (managers only). */
export async function getChoreRunDetailAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
  cycleId: string;
}): Promise<ChoreRunDetailActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      expectedContext: z.unknown(),
      cycleId: z.string().trim().min(1).max(64),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const reader = await readerFor(parsed.data);
  if (!reader.ok) return reader.result;
  const blocked = await guardModule({
    module: "tasks",
    organizationId: reader.caller.organizationId,
    location: reader.location,
  });
  if (blocked) return blocked;
  if (!reader.viewer.isManager) {
    return { ok: false, error: "Only a manager can open a finished run." };
  }
  const data = await getChoreRunDetail(
    reader.caller.organizationId,
    reader.caller.scope,
    reader.viewer,
    parsed.data.cycleId,
  );
  if (!data) return { ok: false, error: "That run could not be found." };
  return { ok: true, data };
}

/** Authoritative read of the Chore Wheel for the verified workspace. */
export async function getChoreSnapshotAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ChoreActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, expectedContext: z.unknown() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await getTasksActor(parsed.data.restaurantSlug);
  if (!caller) {
    return { ok: false, error: "You need to sign in to see chore boards." };
  }
  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const snapshot = await getChoreSnapshot(
    caller.organizationId,
    {
      profileId: caller.viewer.profileId,
      name: caller.viewer.name,
      isManager: isTasksManager(caller.viewer.designation),
    },
    caller.scope,
  );
  if (!snapshot) {
    return { ok: false, error: "Chore boards could not be loaded." };
  }
  return { ok: true, data: snapshot };
}

/** One validated write, then the authoritative snapshot. */
export async function runChoreCommandAction(input: {
  restaurantSlug: string;
  command: ChoreCommand;
  /** REQUIRED: the workspace the caller is looking at (see `checkWorkspace`). */
  expectedContext: unknown;
}): Promise<ChoreActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      command: choreCommandSchema,
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

  const caller = await getTasksActor(parsed.data.restaurantSlug);
  if (!caller) {
    return { ok: false, error: STALE_CONTEXT_MESSAGE, contextStale: true };
  }

  // Refused here -- before ANY database write -- when what the tab shows is
  // not what the server authorizes. The location used below is the one the
  // server verified, never the one the browser asserted.
  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tasks",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const out: { outcome?: string } = {};
  const failure = await runCommand(
    supabase,
    caller.organizationId,
    workspace.location.id,
    parsed.data.command,
    out,
  );
  if (failure) return { ok: false, error: friendly(failure) };

  const snapshot = await getChoreSnapshot(
    caller.organizationId,
    {
      profileId: caller.viewer.profileId,
      name: caller.viewer.name,
      isManager: isTasksManager(caller.viewer.designation),
    },
    caller.scope,
  );
  if (!snapshot) {
    return { ok: false, error: "Chore boards could not be loaded." };
  }
  return { ok: true, data: snapshot, outcome: out.outcome };
}
