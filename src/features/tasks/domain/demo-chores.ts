import {
  applyChoreCommand,
  emptyChoreState,
  type ChoreEngineContext,
  type ChoreState,
} from "./chore-engine";
import type { ChoreCommand } from "./chore-commands";
import type { TaskTeamMember } from "./task-types";

export const DEMO_CHORE_LOCATION_ID = "demo-location";

const MANAGER_ID = "manager-maya";
const STAFF_IDS = ["mia", "leo", "ava"] as const;

/**
 * Demo-mode starting board: the restaurant prep example from the brief, built
 * through the same engine the UI uses. Demo data only -- real mode starts with
 * no boards and a manager creates their own. Skipped silently when the demo
 * roster has no manager.
 */
export function createDemoChoreState(
  now: Date,
  organizationId: string,
  team: readonly TaskTeamMember[],
): ChoreState {
  const manager = team.find((m) => m.profileId === MANAGER_ID);
  if (!manager) return emptyChoreState();
  const ctx: ChoreEngineContext = {
    viewer: {
      profileId: manager.profileId,
      name: manager.name,
      isManager: true,
    },
    team,
    organizationId,
    locationId: DEMO_CHORE_LOCATION_ID,
    now,
  };

  let state = emptyChoreState();
  const run = (command: ChoreCommand): void => {
    const result = applyChoreCommand(state, command, ctx);
    if (result.ok) state = result.value;
  };

  run({
    type: "boardSave",
    boardId: null,
    name: "Daily Refill & Prep",
    description: "Prep area refills and wipe-downs for the shift.",
    staffAccess: "own_column",
    managerOverride: true,
    defaultMode: "all_columns",
    recurrenceIntent: "daily",
    resetIntent: "manual_restart",
    expectedVersion: null,
  });
  const boardId = state.boards[0]?.id;
  if (!boardId) return state;

  for (const profileId of STAFF_IDS) {
    const person = team.find((m) => m.profileId === profileId);
    if (!person) continue;
    run({
      type: "columnSave",
      boardId,
      columnId: null,
      label: person.name.split(" ")[0] ?? person.name,
      profileId,
    });
  }

  const row = (
    title: string,
    over: Partial<Extract<ChoreCommand, { type: "rowSave" }>> = {},
  ) =>
    run({
      type: "rowSave",
      boardId,
      rowId: null,
      title,
      instructions: null,
      required: true,
      mode: "all_columns",
      columnIds: [],
      ...over,
    });

  row("Mango Lassi — Bucket 1");
  row("Mango Lassi — Bucket 2");
  row("Mango Lassi — Bucket 3");
  row("Mint Chutney Refill");
  row("Tamarind Chutney Refill");
  row("Clean Prep Counter");
  row("Restock Napkins", { mode: "any_one" });
  row("Polish glassware", { required: false });

  return state;
}
