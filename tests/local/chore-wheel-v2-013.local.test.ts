import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  createTasksFixture,
  must,
  type TasksFixture,
  type TasksTestUser,
} from "./support/tasks-fixture";

// V2.0.13 Batch B (Chore Wheel) against the DISPOSABLE local stack with real
// GoTrue session clients: the real server actions, the real snapshot loader
// (PostgREST reads under RLS) and the real RPCs. Only the Next request/cookie
// adapter is supplied, exactly like tasks-v2-013.local.test.ts.
let fx: TasksFixture;
const request = vi.hoisted(() => ({
  client: null as unknown,
  actor: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));
vi.mock("@/features/tasks/data/tasks-actor", () => ({
  getTasksActor: async () => request.actor,
}));
import {
  getChoreSnapshotAction,
  runChoreCommandAction,
} from "@/features/tasks/actions/chore-actions";
import { getTasksSnapshotAction } from "@/features/tasks/actions/tasks-actions";
import type { ChoreCommand } from "@/features/tasks/domain/chore-commands";
import { boardProgress } from "@/features/tasks/domain/chore-rules";
import type { ChoreBoardView } from "@/features/tasks/domain/chore-types";

function bind(user: TasksTestUser, location: string, designation: string) {
  request.client = user.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: {
      organizationId: fx.org.id,
      locationId: location,
      timeZone: location === fx.b ? "America/New_York" : "America/Chicago",
    },
    viewer: { profileId: user.id, name: user.name, designation },
  };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId: location,
  };
}
async function run(
  user: TasksTestUser,
  location: string,
  designation: string,
  command: ChoreCommand,
) {
  const expectedContext = bind(user, location, designation);
  return runChoreCommandAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    command,
  });
}
async function snapshot(
  user: TasksTestUser,
  location: string,
  designation: string,
) {
  const expectedContext = bind(user, location, designation);
  const result = await getChoreSnapshotAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
  });
  if (!result.ok) throw Error(result.error);
  return result.data;
}
const mgr = (command: ChoreCommand, location = fx.a) =>
  run(fx.manager, location, "manager", command);
const asStaff = (command: ChoreCommand) =>
  run(fx.staff, fx.a, "staff", command);
const board = async (user: TasksTestUser, designation: string, name: string) =>
  (await snapshot(user, fx.a, designation)).boards.find(
    (b) => b.name === name,
  ) as ChoreBoardView;
const must1 = async (p: ReturnType<typeof mgr>) => {
  const r = await p;
  if (!r.ok) throw Error(r.error);
  return r;
};

const settings = (
  name: string,
  over: Partial<Extract<ChoreCommand, { type: "boardSave" }>> = {},
) =>
  ({
    type: "boardSave",
    boardId: null,
    name,
    description: "Prep area",
    staffAccess: "own_column",
    managerOverride: false,
    defaultMode: "all_columns",
    recurrenceIntent: "daily",
    resetIntent: "manual_restart",
    expectedVersion: null,
    ...over,
  }) satisfies ChoreCommand;

let managerB: TasksTestUser;
let boardId = "";
let colStaff = "";
let colDual = "";
let colPos = "";
let rowAll = "";
let rowSelected = "";
let rowAny = "";
let rowOptional = "";

beforeAll(async () => {
  fx = await createTasksFixture();
  // A manager of location B only (never of A): the cross-location actor.
  managerB = await fx.makeUser("manager-b");
  must(
    await fx.admin.from("memberships").insert({
      organization_id: fx.org.id,
      profile_id: managerB.id,
      roles: ["general_manager"],
      active: true,
    }),
  );
  must(
    await fx.admin
      .from("location_memberships")
      .insert({ location_id: fx.b, profile_id: managerB.id, role: "manager" }),
  );
});
afterAll(async () => {
  await fx?.teardown();
});

it("a manager builds a board through the real actions and the loader returns it with an open cycle", async () => {
  await must1(mgr(settings("Daily Refill & Prep")));
  const snap = await snapshot(fx.manager, fx.a, "manager");
  const b = snap.boards.find((x) => x.name === "Daily Refill & Prep")!;
  expect(b).toBeDefined();
  boardId = b.id;
  expect(b.cycle).toMatchObject({ sequence: 1 });
  expect(b.recurrenceIntent).toBe("daily");
  expect(b.version).toBe(1);
  expect(b.isActive).toBe(true);

  await must1(
    mgr({
      type: "columnSave",
      boardId,
      columnId: null,
      label: "",
      profileId: fx.staff.id,
    }),
  );
  await must1(
    mgr({
      type: "columnSave",
      boardId,
      columnId: null,
      label: "Stan",
      profileId: fx.dual.id,
    }),
  );
  await must1(
    mgr({
      type: "columnSave",
      boardId,
      columnId: null,
      label: "Prep Cook 2",
      profileId: null,
    }),
  );
  let cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  colStaff = cur.columns.find((c) => c.profileId === fx.staff.id)!.id;
  colDual = cur.columns.find((c) => c.profileId === fx.dual.id)!.id;
  colPos = cur.columns.find((c) => c.profileId === null)!.id;
  expect(cur.columns.find((c) => c.id === colDual)!.label).toBe("Stan");
  // The blank label defaulted to the employee's display name; the account is untouched.
  expect(cur.columns.find((c) => c.id === colStaff)!.label).toBe(fx.staff.name);

  const row = (
    title: string,
    over: Partial<Extract<ChoreCommand, { type: "rowSave" }>> = {},
  ) =>
    mgr({
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
  await must1(row("Mango Lassi — Bucket 1"));
  await must1(
    row("Mint Chutney Refill", {
      mode: "selected_columns",
      columnIds: [colStaff],
    }),
  );
  await must1(row("Restock Napkins", { mode: "any_one" }));
  await must1(row("Wipe menus", { required: false }));
  cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  rowAll = cur.rows.find((r) => r.title.startsWith("Mango"))!.id;
  rowSelected = cur.rows.find((r) => r.title.startsWith("Mint"))!.id;
  rowAny = cur.rows.find((r) => r.title.startsWith("Restock"))!.id;
  rowOptional = cur.rows.find((r) => r.title === "Wipe menus")!.id;
  expect(cur.rows.find((r) => r.id === rowSelected)!.selectedColumnIds).toEqual(
    [colStaff],
  );
  // 1 all-columns chore x 3 + 1 selected + 1 any-one; the optional chore is excluded.
  expect(boardProgress(cur)).toMatchObject({
    required: 5,
    completed: 0,
    optionalTotal: 3,
  });
  // Assignment history exists for managers.
  expect(cur.assignments.length).toBe(3);
});

it("staff see the board, tick their own cell, it persists across reloads and records the real actor", async () => {
  const before = await board(fx.staff, "staff", "Daily Refill & Prep");
  expect(before).toBeDefined();
  expect(before.assignments).toEqual([]); // history is manager-only
  const r = await asStaff({
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colStaff,
    done: true,
  });
  expect(r).toMatchObject({ ok: true, outcome: "checked" });
  const again = await asStaff({
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colStaff,
    done: true,
  });
  expect(again).toMatchObject({ ok: true, outcome: "unchanged" });
  const reload = await board(fx.staff, "staff", "Daily Refill & Prep");
  expect(reload.completions).toHaveLength(1);
  expect(reload.completions[0]).toMatchObject({
    rowId: rowAll,
    columnId: colStaff,
    completedBy: fx.staff.id,
    enteredAs: "self",
  });
  expect(boardProgress(reload)).toMatchObject({ completed: 1, remaining: 4 });
});

it("staff cannot tick someone else's column, change the structure, or spoof an actor", async () => {
  const other = await asStaff({
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colDual,
    done: true,
  });
  expect(other.ok).toBe(false);
  if (!other.ok) expect(other.error).toMatch(/your own column/);

  const config = await asStaff({
    type: "rowSave",
    boardId,
    rowId: null,
    title: "Staff chore",
    instructions: null,
    required: true,
    mode: "all_columns",
    columnIds: [],
  });
  expect(config.ok).toBe(false);
  expect(
    (await asStaff(settings("Hijack", { boardId, expectedVersion: 1 }))).ok,
  ).toBe(false);

  // The RPC has no actor argument: naming one is rejected by PostgREST itself.
  const spoof = await (
    fx.staff.client.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>
  )("chore_cell_set", {
    p_board_id: boardId,
    p_row_id: rowAll,
    p_column_id: colDual,
    p_done: true,
    p_actor: fx.dual.id,
  });
  expect(spoof.error).not.toBeNull();
  const reload = await board(fx.staff, "staff", "Daily Refill & Prep");
  expect(reload.completions).toHaveLength(1);
});

it("a manager can correct another person's cell only after the board explicitly allows it, and is recorded as the actor", async () => {
  const denied = await mgr({
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colStaff,
    done: false,
  });
  expect(denied.ok).toBe(false);
  const cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  await must1(
    mgr(
      settings("Daily Refill & Prep", {
        boardId,
        managerOverride: true,
        expectedVersion: cur.version,
      }),
    ),
  );
  await must1(
    mgr({
      type: "cellSet",
      boardId,
      rowId: rowAll,
      columnId: colDual,
      done: true,
    }),
  );
  const after = await board(fx.manager, "manager", "Daily Refill & Prep");
  const c = after.completions.find((x) => x.columnId === colDual)!;
  expect(c).toMatchObject({
    completedBy: fx.manager.id,
    enteredAs: "manager_correction",
  });
  // The earlier completion is untouched.
  expect(
    after.completions.find((x) => x.columnId === colStaff)!.completedBy,
  ).toBe(fx.staff.id);
});

it("selected-people and any-one rules hold through the database; not-applicable cells are refused", async () => {
  const notApplicable = await run(fx.dual, fx.a, "staff", {
    type: "cellSet",
    boardId,
    rowId: rowSelected,
    columnId: colDual,
    done: true,
  });
  expect(notApplicable.ok).toBe(false);
  if (!notApplicable.ok) expect(notApplicable.error).toMatch(/does not apply/);
  expect(
    (
      await asStaff({
        type: "cellSet",
        boardId,
        rowId: rowSelected,
        columnId: colStaff,
        done: true,
      })
    ).ok,
  ).toBe(true);
});

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;
const tick = (user: TasksTestUser, row: string, column: string, done = true) =>
  (user.client.rpc as unknown as Rpc)("chore_cell_set", {
    p_board_id: boardId,
    p_row_id: row,
    p_column_id: column,
    p_done: done,
  });

it("any-one chores have exactly one winner under a race, and rapid duplicate taps write once", async () => {
  // Two different people race for the same any-one chore (separate sessions).
  const [x, y] = await Promise.all([
    tick(fx.staff, rowAny, colStaff),
    tick(fx.dual, rowAny, colDual),
  ]);
  expect([x.error, y.error].filter((e) => e === null)).toHaveLength(1);
  const loser = x.error ?? y.error;
  expect(loser?.message).toMatch(/already done by/);
  let cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  expect(cur.completions.filter((c) => c.rowId === rowAny)).toHaveLength(1);
  // The chore counts once, however many people could have done it.
  expect(boardProgress(cur).required).toBe(5);

  // One person double/quad-taps the same cell: one write, the rest are no-ops.
  const taps = await Promise.all(
    Array.from({ length: 4 }, () => tick(fx.dual, rowAll, colPos)),
  );
  expect(taps.every((t) => t.error === null)).toBe(true);
  expect(taps.filter((t) => t.data === "checked")).toHaveLength(1);
  cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  expect(
    cur.completions.filter((c) => c.rowId === rowAll && c.columnId === colDual),
  ).toHaveLength(1);
});

it("cross-location and cross-organization: no read, no write, no existence oracle", async () => {
  // A manager of B only cannot reach A's board, through the action or the RPC.
  const viaAction = await run(managerB, fx.b, "manager", {
    type: "boardSetState",
    boardId,
    state: "inactive",
  });
  expect(viaAction.ok).toBe(false);
  if (!viaAction.ok)
    expect(viaAction.error).toMatch(/not available in this location/);
  const rpc = await managerB.client.rpc("chore_board_set_state", {
    p_board_id: boardId,
    p_state: "inactive",
  });
  expect(rpc.error?.message).toMatch(/does not exist or you cannot use it/);
  const unknown = await managerB.client.rpc("chore_board_set_state", {
    p_board_id: crypto.randomUUID(),
    p_state: "inactive",
  });
  expect(unknown.error?.message).toBe(rpc.error?.message);
  const tick = await managerB.client.rpc("chore_cell_set", {
    p_board_id: boardId,
    p_row_id: rowAll,
    p_column_id: colStaff,
    p_done: false,
  });
  expect(tick.error?.code).toBe("42501");

  // The manager of A and B, acting in the context of B, cannot operate A's board.
  const wrongContext = await run(fx.manager, fx.b, "manager", {
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colStaff,
    done: false,
  });
  expect(wrongContext.ok).toBe(false);
  if (!wrongContext.ok)
    expect(wrongContext.error).toMatch(/not available in this location/);

  // RLS: another location and another organization read nothing.
  expect(
    must(
      await managerB.client.from("chore_boards").select("id").eq("id", boardId),
    ),
  ).toHaveLength(0);
  expect(
    must(await managerB.client.from("chore_completions").select("id")),
  ).toHaveLength(0);
  expect(
    must(await fx.foreign.client.from("chore_boards").select("id")),
  ).toHaveLength(0);
  expect(
    must(await fx.foreign.client.from("chore_events").select("id")),
  ).toHaveLength(0);
  const foreignWrite = await fx.foreign.client.rpc("chore_cell_set", {
    p_board_id: boardId,
    p_row_id: rowAll,
    p_column_id: colStaff,
    p_done: false,
  });
  expect(foreignWrite.error?.code).toBe("42501");
  // No direct table writes for any role.
  const direct = await fx.manager.client
    .from("chore_completions")
    .delete()
    .eq("board_id", boardId);
  expect(direct.error).not.toBeNull();
  // The board is still intact.
  expect(
    (await board(fx.manager, "manager", "Daily Refill & Prep")).completions
      .length,
  ).toBeGreaterThan(0);
});

it("reassigning a column keeps the earlier completer and the assignment history", async () => {
  const unassigned = await mgr({
    type: "columnSave",
    boardId,
    columnId: colStaff,
    label: "Opening prep",
    profileId: fx.unassigned.id,
  });
  // The unassigned user has no location membership: not an eligible assignee.
  expect(unassigned.ok).toBe(false);
  // The same person cannot hold two live columns: refused until the first is turned off.
  const reassign = {
    type: "columnSave",
    boardId,
    columnId: colPos,
    label: "Closer",
    profileId: fx.staff.id,
  } as const;
  expect((await mgr(reassign)).ok).toBe(false);
  await must1(
    mgr({ type: "columnSetState", columnId: colStaff, state: "inactive" }),
  );
  await must1(mgr(reassign));
  const cur = await board(fx.manager, "manager", "Daily Refill & Prep");
  const closer = cur.columns.find((c) => c.id === colPos)!;
  expect(closer).toMatchObject({ label: "Closer", profileId: fx.staff.id });
  expect(cur.assignments.filter((a) => a.columnId === colPos)).toHaveLength(2);
  // The earlier completion in the turned-off column still names the original actor.
  expect(
    cur.completions.find((c) => c.columnId === colStaff)!.completedBy,
  ).toBe(fx.staff.id);
});

it("turned-off and archived boards cannot be changed by a direct request; staff no longer see them", async () => {
  await must1(mgr({ type: "boardSetState", boardId, state: "inactive" }));
  expect((await snapshot(fx.staff, fx.a, "staff")).boards).toHaveLength(0);
  const direct = await fx.staff.client.rpc("chore_cell_set", {
    p_board_id: boardId,
    p_row_id: rowAll,
    p_column_id: colDual,
    p_done: false,
  });
  expect(direct.error?.code).toBe("42501");
  const managerTick = await mgr({
    type: "cellSet",
    boardId,
    rowId: rowAll,
    columnId: colDual,
    done: false,
  });
  expect(managerTick.ok).toBe(false);

  await must1(mgr({ type: "boardSetState", boardId, state: "active" }));
  await must1(mgr({ type: "boardSetState", boardId, state: "archived" }));
  const edit = await mgr({
    type: "rowSave",
    boardId,
    rowId: null,
    title: "Late",
    instructions: null,
    required: true,
    mode: "all_columns",
    columnIds: [],
  });
  expect(edit.ok).toBe(false);
  if (!edit.ok) expect(edit.error).toMatch(/archived/);
  // Archiving keeps every completed record.
  const kept = must(
    await fx.admin
      .from("chore_completions")
      .select("id")
      .eq("board_id", boardId),
  );
  expect(kept?.length).toBeGreaterThan(0);
  const arch = (await snapshot(fx.manager, fx.a, "manager")).boards.find(
    (b) => b.id === boardId,
  )!;
  expect(arch.archived).toBe(true);
});

it("duplicating copies configuration only; the existing Tasks snapshot is unaffected", async () => {
  await must1(mgr({ type: "boardDuplicate", boardId, name: "Evening Prep" }));
  const copy = await board(fx.manager, "manager", "Evening Prep");
  expect(copy.completions).toHaveLength(0);
  expect(copy.cycle).toMatchObject({ sequence: 1 });
  expect(copy.rows.length).toBeGreaterThan(0);
  expect(
    copy.rows.find((r) => r.mode === "selected_columns")!.selectedColumnIds,
  ).toHaveLength(1);

  bind(fx.manager, fx.a, "manager");
  const tasks = await getTasksSnapshotAction({
    restaurantSlug: fx.org.slug,
    expectedContext: bind(fx.manager, fx.a, "manager"),
  });
  expect(tasks.ok).toBe(true);
  void rowOptional;
});
