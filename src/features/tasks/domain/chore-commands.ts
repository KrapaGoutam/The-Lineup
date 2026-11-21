import { z } from "zod";

import {
  RECURRENCE_INTENTS,
  REQUIREMENT_MODES,
  RESET_INTENTS,
  STAFF_ACCESS,
} from "./chore-types";

/**
 * Everything the Chore Wheel can ask the server (or the demo engine) to do.
 * There is deliberately no actor, location or timestamp in any command: the
 * server derives them from the verified session, so a completion can never be
 * attributed to someone else and a client can never aim at another location.
 */
const id = z.string().trim().min(1).max(64);
const state = z.enum(["active", "inactive", "archived"]);

export const choreCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("boardSave"),
    boardId: id.nullable(),
    name: z.string().trim().min(1, "Give the board a name.").max(80),
    description: z.string().trim().max(500).nullable(),
    staffAccess: z.enum(STAFF_ACCESS),
    managerOverride: z.boolean(),
    defaultMode: z.enum(REQUIREMENT_MODES),
    recurrenceIntent: z.enum(RECURRENCE_INTENTS),
    resetIntent: z.enum(RESET_INTENTS),
    expectedVersion: z.number().int().nullable(),
  }),
  z.object({ type: z.literal("boardSetState"), boardId: id, state }),
  z.object({
    type: z.literal("boardDuplicate"),
    boardId: id,
    name: z.string().trim().min(1, "Give the new board a name.").max(80),
  }),
  z.object({
    type: z.literal("boardsReorder"),
    boardIds: z.array(id).max(100),
  }),
  z.object({
    type: z.literal("columnSave"),
    boardId: id,
    columnId: id.nullable(),
    label: z.string().trim().max(60),
    profileId: id.nullable(),
  }),
  z.object({ type: z.literal("columnSetState"), columnId: id, state }),
  z.object({
    type: z.literal("columnsReorder"),
    boardId: id,
    columnIds: z.array(id).max(100),
  }),
  z.object({
    type: z.literal("rowSave"),
    boardId: id,
    rowId: id.nullable(),
    title: z.string().trim().min(1, "Give the chore a name.").max(120),
    instructions: z.string().trim().max(500).nullable(),
    required: z.boolean(),
    mode: z.enum(REQUIREMENT_MODES),
    columnIds: z.array(id).max(100),
  }),
  z.object({ type: z.literal("rowSetState"), rowId: id, state }),
  z.object({
    type: z.literal("rowsReorder"),
    boardId: id,
    rowIds: z.array(id).max(200),
  }),
  z.object({
    type: z.literal("cellSet"),
    boardId: id,
    rowId: id,
    columnId: id,
    done: z.boolean(),
    /** The run the screen shows. A tick that names a finished run is refused (stale tab). */
    cycleId: id.nullish(),
  }),
  // Batch C: close / start / correct a run. The server re-evaluates everything; the
  // client only names the run it is looking at.
  z.object({
    type: z.literal("cycleClose"),
    boardId: id,
    cycleId: id,
    outcome: z.enum(["completed", "cancelled"]),
    note: z.string().trim().max(300).nullable(),
    startNext: z.boolean(),
  }),
  z.object({ type: z.literal("cycleStart"), boardId: id }),
  z.object({
    type: z.literal("cycleCorrect"),
    cycleId: id,
    rowId: id,
    columnId: id,
    done: z.boolean(),
    reason: z
      .string()
      .trim()
      .min(3, "Give a reason for the correction (at least 3 characters).")
      .max(300),
  }),
  /** Demo only: the on-load sweep (real mode runs it inside the snapshot read). */
  z.object({ type: z.literal("cyclesSweep") }),
]);

export type ChoreCommand = z.infer<typeof choreCommandSchema>;
export type ChoreStateName = z.infer<typeof state>;

/** Commands that only change a cell (used for the in-flight guard). */
export function choreCellKeyOf(command: ChoreCommand): string | null {
  return command.type === "cellSet"
    ? `${command.boardId}:${command.rowId}:${command.columnId}`
    : null;
}
