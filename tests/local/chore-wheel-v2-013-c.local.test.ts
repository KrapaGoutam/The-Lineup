import { AsyncLocalStorage } from "node:async_hooks";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  createTasksFixture,
  must,
  tasksEnv,
  type TasksFixture,
  type TasksTestUser,
} from "./support/tasks-fixture";

// V2.0.13 Batch C (run closure, recurrence sweep, immutable snapshots, corrections)
// against the DISPOSABLE local stack with real GoTrue sessions: the real server
// actions, the real loaders (PostgREST under RLS) and the real RPCs. Only the Next
// request/cookie adapter is supplied, exactly like chore-wheel-v2-013.local.test.ts.
let fx: TasksFixture;
// Per-call identity (AsyncLocalStorage): concurrent calls each carry THEIR OWN session
// client and actor, so a Promise.all race is two real people, not one shared binding.
type Store = { client: unknown; actor: unknown };
const request = vi.hoisted(() => ({
  als: null as null | { getStore(): Store | undefined },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.als?.getStore()?.client,
}));
vi.mock("@/features/tasks/data/tasks-actor", () => ({
  getTasksActor: async () => request.als?.getStore()?.actor,
}));
const als = new AsyncLocalStorage<Store>();
request.als = als;
import {
  getChoreHistoryAction,
  getChoreRunDetailAction,
  getChoreSnapshotAction,
  runChoreCommandAction,
} from "@/features/tasks/actions/chore-actions";
import type { ChoreCommand } from "@/features/tasks/domain/chore-commands";
import type { ChoreBoardView } from "@/features/tasks/domain/chore-types";

type Who = { user: TasksTestUser; location: string; designation: string };
/** Runs `fn` as that person; `fn` receives the expected-context assertion the tab would send. */
function as<T>(
  { user, location, designation }: Who,
  fn: (expectedContext: {
    profileId: string;
    organizationId: string;
    locationId: string;
  }) => Promise<T>,
): Promise<T> {
  const store: Store = {
    client: user.client,
    actor: {
      organizationId: fx.org.id,
      scope: {
        organizationId: fx.org.id,
        locationId: location,
        timeZone: "America/Chicago",
      },
      viewer: { profileId: user.id, name: user.name, designation },
    },
  };
  const expectedContext = {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId: location,
  };
  return als.run(store, () => fn(expectedContext));
}
const MGR = (): Who => ({
  user: fx.manager,
  location: fx.a,
  designation: "manager",
});
const STAFF = (): Who => ({
  user: fx.staff,
  location: fx.a,
  designation: "staff",
});
const DUAL = (): Who => ({
  user: fx.dual,
  location: fx.a,
  designation: "staff",
});

// The action reads the request adapter when it starts, so each call is started
// synchronously after binding; the awaits then overlap for real.
function run(who: Who, command: ChoreCommand) {
  return as(who, (expectedContext) =>
    runChoreCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command,
    }),
  );
}
async function snap(who: Who = MGR()) {
  const result = await as(who, (expectedContext) =>
    getChoreSnapshotAction({ restaurantSlug: fx.org.slug, expectedContext }),
  );
  if (!result.ok) throw Error(result.error);
  return result.data;
}
const detailOf = (who: Who, cycleId: string) =>
  as(who, (expectedContext) =>
    getChoreRunDetailAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      cycleId,
    }),
  );
const historyOf = (who: Who, month: string | null, boardId: string | null) =>
  as(who, (expectedContext) =>
    getChoreHistoryAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      month,
      boardId,
    }),
  );
async function ok(p: ReturnType<typeof run>) {
  const r = await p;
  if (!r.ok) throw Error(r.error);
  return r;
}
const boardOf = async (name: string, who: Who = MGR()) =>
  (await snap(who)).boards.find((b) => b.name === name) as ChoreBoardView;

function settings(
  name: string,
  over: Partial<Extract<ChoreCommand, { type: "boardSave" }>> = {},
) {
  return {
    type: "boardSave",
    boardId: null,
    name,
    description: null,
    staffAccess: "own_column",
    managerOverride: false,
    defaultMode: "all_columns",
    recurrenceIntent: "continuous",
    resetIntent: "automatic_after_completion",
    expectedVersion: null,
    ...over,
  } satisfies ChoreCommand;
}

/** Board with one required chore and one column each for staff + dual => 2 required cells. */
async function makeBoard(
  name: string,
  over: Partial<Extract<ChoreCommand, { type: "boardSave" }>> = {},
  rows = ["Bucket 1"],
) {
  await ok(run(MGR(), settings(name, over)));
  const b = await boardOf(name);
  for (const [label, user] of [
    ["Staff", fx.staff],
    ["Dual", fx.dual],
  ] as const) {
    await ok(
      run(MGR(), {
        type: "columnSave",
        boardId: b.id,
        columnId: null,
        label,
        profileId: user.id,
      }),
    );
  }
  for (const title of rows) {
    await ok(
      run(MGR(), {
        type: "rowSave",
        boardId: b.id,
        rowId: null,
        title,
        instructions: null,
        required: true,
        mode: "all_columns",
        columnIds: [],
      }),
    );
  }
  return boardOf(name);
}
const cell = (b: ChoreBoardView, row: string, col: string) => ({
  boardId: b.id,
  rowId: b.rows.find((r) => r.title === row)!.id,
  columnId: b.columns.find((c) => c.label === col)!.id,
});
const tick = (who: Who, b: ChoreBoardView, row: string, col: string) =>
  run(who, {
    type: "cellSet",
    ...cell(b, row, col),
    done: true,
    cycleId: b.cycle?.id ?? null,
  });
const cyclesOf = async (boardId: string) =>
  must(
    await fx.admin
      .from("chore_cycles")
      .select(
        "id, sequence, status, opened_by_kind, closed_by_kind, period_key",
      )
      .eq("board_id", boardId)
      .order("sequence"),
  )!;
const snapshotsOf = async (boardId: string) =>
  must(
    await fx.admin
      .from("chore_cycle_snapshots")
      .select(
        "cycle_id, sequence, final_status, outcome, closed_by_kind, closed_by",
      )
      .eq("board_id", boardId)
      .order("sequence"),
  )!;

let managerB: TasksTestUser;

beforeAll(async () => {
  fx = await createTasksFixture();
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
  // Teardown deletes the organization: finished runs, snapshots and corrections must
  // cascade away even though they are immutable to everyone else.
  await fx?.teardown();
});

it("two people tick the last two required cells at the same moment: exactly one run closes, exactly one successor opens", async () => {
  for (let round = 0; round < 6; round += 1) {
    const b = await makeBoard(`Race ${round}`);
    expect(b.cycle?.sequence).toBe(1);
    const [x, y] = await Promise.all([
      tick(STAFF(), b, "Bucket 1", "Staff"),
      tick(DUAL(), b, "Bucket 1", "Dual"),
    ]);
    expect(x.ok && y.ok).toBe(true);
    const outcomes = [x, y].map((r) => (r.ok ? r.outcome : "")).sort();
    expect(outcomes).toEqual(["checked", "checked_closed"]);

    const cycles = await cyclesOf(b.id);
    expect(cycles.map((c) => [c.sequence, c.status])).toEqual([
      [1, "completed"],
      [2, "open"],
    ]);
    expect(await snapshotsOf(b.id)).toHaveLength(1);
    const cells = must(
      await fx.admin
        .from("chore_cycle_snapshot_cells")
        .select("completed_by")
        .eq("board_id", b.id),
    )!;
    expect(cells).toHaveLength(2); // no lost completion
    // The system closed it: neither employee is recorded as the closer.
    expect((await snapshotsOf(b.id))[0]).toMatchObject({
      closed_by_kind: "system",
      closed_by: null,
    });
  }
});

it("completing Mango Lassi leaves Gulab Jamun and Rasmalai exactly as they were; run numbers are independent", async () => {
  const mango = await makeBoard("Mango Lassi");
  const gulab = await makeBoard("Gulab Jamun");
  const rasmalai = await makeBoard("Rasmalai");
  await ok(tick(STAFF(), gulab, "Bucket 1", "Staff")); // Gulab is partly done
  await ok(tick(STAFF(), mango, "Bucket 1", "Staff"));
  await ok(tick(DUAL(), mango, "Bucket 1", "Dual")); // Mango completes

  const after = await snap();
  const g = after.boards.find((x) => x.id === gulab.id)!;
  const r = after.boards.find((x) => x.id === rasmalai.id)!;
  const m = after.boards.find((x) => x.id === mango.id)!;
  expect(m.cycle?.sequence).toBe(2);
  expect(m.completions).toHaveLength(0);
  expect(g.cycle?.sequence).toBe(1);
  expect(g.completions).toHaveLength(1);
  expect(r.cycle?.sequence).toBe(1);
  expect(await snapshotsOf(gulab.id)).toHaveLength(0);
  expect(await snapshotsOf(rasmalai.id)).toHaveLength(0);
});

it("two managers closing the same ready run at once: one closes, the other gets already_closed, one successor", async () => {
  const b = await makeBoard("Manual close", { resetIntent: "manual_restart" });
  await ok(tick(STAFF(), b, "Bucket 1", "Staff"));
  const last = await ok(tick(DUAL(), b, "Bucket 1", "Dual"));
  expect(last.outcome).toBe("checked"); // manual: complete work is not closing
  expect((await boardOf("Manual close")).cycle?.sequence).toBe(1);

  const cycleId = b.cycle!.id;
  const close = (): ReturnType<typeof run> =>
    run(MGR(), {
      type: "cycleClose",
      boardId: b.id,
      cycleId,
      outcome: "completed",
      note: null,
      startNext: true,
    });
  const [x, y] = await Promise.all([close(), close()]);
  expect(x.ok && y.ok).toBe(true);
  expect([x, y].map((r) => (r.ok ? r.outcome : "")).sort()).toEqual([
    "already_closed",
    "closed",
  ]);
  expect((await cyclesOf(b.id)).map((c) => [c.sequence, c.status])).toEqual([
    [1, "completed"],
    [2, "open"],
  ]);
  expect(await snapshotsOf(b.id)).toHaveLength(1);
  // The manager (not the system) is the closer, and staff cannot do it at all.
  expect((await snapshotsOf(b.id))[0]).toMatchObject({
    closed_by_kind: "user",
  });
  const denied = await run(STAFF(), {
    type: "cycleClose",
    boardId: b.id,
    cycleId: (await boardOf("Manual close")).cycle!.id,
    outcome: "cancelled",
    note: "staff try",
    startNext: false,
  });
  expect(denied.ok).toBe(false);
});

it("History and the saved run are frozen: template edits never rewrite them, staff cannot open the matrix", async () => {
  const b = await makeBoard("Frozen", {}, ["Bucket 1", "Bucket 2"]);
  for (const row of ["Bucket 1", "Bucket 2"]) {
    await ok(tick(STAFF(), b, row, "Staff"));
    await ok(tick(DUAL(), b, row, "Dual"));
  }
  const finished = (await snapshotsOf(b.id))[0];
  expect(finished.final_status).toBe("completed");

  // Rename a chore and a column label, remove a person: the saved run must not move.
  const live = await boardOf("Frozen");
  await ok(
    run(MGR(), {
      type: "rowSave",
      boardId: b.id,
      rowId: live.rows.find((r) => r.title === "Bucket 2")!.id,
      title: "Renamed later",
      instructions: null,
      required: true,
      mode: "all_columns",
      columnIds: [],
    }),
  );
  await ok(
    run(MGR(), {
      type: "columnSave",
      boardId: b.id,
      columnId: live.columns.find((c) => c.label === "Dual")!.id,
      label: "Renamed person",
      profileId: fx.dual.id,
    }),
  );
  await ok(
    run(MGR(), {
      type: "columnSetState",
      columnId: live.columns.find((c) => c.label === "Staff")!.id,
      state: "archived",
    }),
  );

  const detail = await detailOf(MGR(), finished.cycle_id);
  expect(detail.ok).toBe(true);
  if (!detail.ok) return;
  expect(detail.data.board.rows.map((r) => r.title)).toEqual([
    "Bucket 1",
    "Bucket 2",
  ]);
  expect(detail.data.board.columns.map((c) => c.label)).toEqual([
    "Staff",
    "Dual",
  ]);
  expect(detail.data.board.completions).toHaveLength(4);
  expect(detail.data.summary).toMatchObject({
    status: "completed",
    closedByKind: "system",
    requiredDone: 4,
    requiredTotal: 4,
  });

  // History list: bounded by month and by board.
  const month = detail.data.summary.businessDate.slice(0, 7);
  const list = await historyOf(MGR(), month, b.id);
  expect(list.ok && list.data.runs.map((r) => r.sequence)).toEqual([1]);
  const otherMonth = await historyOf(MGR(), "2001-01", b.id);
  expect(otherMonth.ok && otherMonth.data.runs).toHaveLength(0);

  // Staff: the summary is readable, the frozen matrix is not.
  const staffList = await historyOf(STAFF(), null, b.id);
  expect(staffList.ok && staffList.data.runs).toHaveLength(1);
  const staffDetail = await detailOf(STAFF(), finished.cycle_id);
  expect(staffDetail.ok).toBe(false);
  const rawCells = await fx.staff.client
    .from("chore_cycle_snapshot_cells")
    .select("row_id")
    .eq("cycle_id", finished.cycle_id);
  expect(rawCells.data).toHaveLength(0); // RLS, not just the action
});

it("corrections append (never overwrite), need the board setting, a manager and a reason", async () => {
  const b = await makeBoard("Corrections");
  await ok(tick(STAFF(), b, "Bucket 1", "Staff"));
  await ok(tick(DUAL(), b, "Bucket 1", "Dual"));
  const finished = (await snapshotsOf(b.id))[0];
  const rowId = b.rows[0].id;
  const columnId = b.columns.find((c) => c.label === "Staff")!.id;
  const correct = (who: Who, reason = "Staff was off shift") =>
    run(who, {
      type: "cycleCorrect",
      cycleId: finished.cycle_id,
      rowId,
      columnId,
      done: false,
      reason,
    });

  expect((await correct(MGR())).ok).toBe(false); // override is off by default
  const live = await boardOf("Corrections");
  await ok(
    run(MGR(), {
      type: "boardSave",
      boardId: b.id,
      name: "Corrections",
      description: null,
      staffAccess: "own_column",
      managerOverride: true,
      defaultMode: "all_columns",
      recurrenceIntent: "continuous",
      resetIntent: "automatic_after_completion",
      expectedVersion: live.version,
    }),
  );
  expect((await correct(STAFF())).ok).toBe(false);
  expect((await correct(MGR(), "x")).ok).toBe(false); // reason too short
  const first = await ok(correct(MGR()));
  expect(first.outcome).toBe("corrected");
  expect((await ok(correct(MGR()))).outcome).toBe("unchanged");

  const detail = await detailOf(MGR(), finished.cycle_id);
  expect(detail.ok).toBe(true);
  if (!detail.ok) return;
  expect(detail.data.board.completions).toHaveLength(2); // original evidence untouched
  expect(detail.data.corrections).toHaveLength(1);
  expect(detail.data.corrections[0]).toMatchObject({
    doneBefore: true,
    doneAfter: false,
    reason: "Staff was off shift",
  });
  expect(detail.data.canCorrect).toBe(true);
  // And the database itself refuses to edit or delete them, even for the service role.
  const edit = await fx.admin
    .from("chore_cycle_corrections")
    .update({ reason: "edited" })
    .eq("cycle_id", finished.cycle_id);
  expect(edit.error?.message).toMatch(/permanent/);
});

it("cross-location and cross-organization callers cannot close, correct or read another location's runs", async () => {
  const b = await makeBoard("Isolated", { resetIntent: "manual_restart" });
  const cycleId = b.cycle!.id;
  // A manager of location B only, acting in B, names a board of A.
  const closeB = await run(
    { user: managerB, location: fx.b, designation: "manager" },
    {
      type: "cycleClose",
      boardId: b.id,
      cycleId,
      outcome: "cancelled",
      note: "wrong location",
      startNext: false,
    },
  );
  expect(closeB.ok).toBe(false);
  // The same manager acting at A is refused by the RPC itself (no authority there).
  const closeAtA = await run(
    { user: managerB, location: fx.a, designation: "manager" },
    {
      type: "cycleClose",
      boardId: b.id,
      cycleId,
      outcome: "cancelled",
      note: "no authority",
      startNext: false,
    },
  );
  expect(closeAtA.ok).toBe(false);
  // Raw RPCs: another organization's owner and forged ids.
  const foreignRpc = await fx.foreign.client.rpc("chore_cycle_close", {
    p_board_id: b.id,
    p_expected_cycle_id: cycleId,
    p_outcome: "cancelled",
    p_note: "foreign",
    p_start_next: false,
  });
  expect(foreignRpc.error?.code).toBe("42501");
  const forged = await fx.manager.client.rpc("chore_cycle_close", {
    p_board_id: b.id,
    p_expected_cycle_id: "00000000-0000-4000-8000-000000000001",
    p_outcome: "cancelled",
    p_note: "forged",
    p_start_next: false,
  });
  expect(forged.error?.code).toBe("42501");
  expect((await cyclesOf(b.id))[0].status).toBe("open"); // nothing happened
  // There is no actor argument to forge: an extra parameter is not accepted.
  const spoof = await fx.manager.client.rpc("chore_cycle_close", {
    p_board_id: b.id,
    p_expected_cycle_id: cycleId,
    p_outcome: "cancelled",
    p_note: "spoof",
    p_start_next: false,
    p_closed_by: fx.staff.id,
  } as never);
  expect(spoof.error).not.toBeNull();
  expect((await cyclesOf(b.id))[0].status).toBe("open");
  // Another organization reads nothing.
  const foreignRead = await fx.foreign.client
    .from("chore_cycle_snapshots")
    .select("cycle_id");
  expect(foreignRead.data).toHaveLength(0);
  // The sweep is not an anonymous or foreign lever.
  const anon = createClient(tasksEnv.url, tasksEnv.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonSweep = await anon.rpc("chore_cycles_sweep", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
  });
  expect(anonSweep.error).not.toBeNull();
  const foreignSweep = await fx.foreign.client.rpc("chore_cycles_sweep", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
  });
  expect(foreignSweep.error?.code).toBe("42501");
});

it("the sweep (driven by a snapshot load) expires a stale daily run once, concurrent loads open exactly one run, and a completed daily run does not restart", async () => {
  const stale = await makeBoard("Daily stale", { recurrenceIntent: "daily" });
  await ok(tick(STAFF(), stale, "Bucket 1", "Staff"));
  // Yesterday's run (backdated by the service role; the run is still open).
  must(
    await fx.admin
      .from("chore_cycles")
      .update({
        business_date: new Date(Date.now() - 36 * 3600 * 1000)
          .toISOString()
          .slice(0, 10),
      })
      .eq("board_id", stale.id)
      .eq("status", "open"),
  );
  // Several members load Tasks at the same instant.
  await Promise.all([snap(MGR()), snap(STAFF()), snap(DUAL()), snap(MGR())]);
  const cycles = await cyclesOf(stale.id);
  expect(cycles.map((c) => [c.sequence, c.status, c.opened_by_kind])).toEqual([
    [1, "expired", "user"],
    [2, "open", "system"],
  ]);
  expect(cycles[0].closed_by_kind).toBe("system");
  expect(cycles[1].period_key).toMatch(/^d:\d{4}-\d{2}-\d{2}$/);
  expect((await snapshotsOf(stale.id))[0]).toMatchObject({
    final_status: "expired",
    outcome: "not_completed",
    closed_by: null,
  });
  await snap(MGR());
  expect(await cyclesOf(stale.id)).toHaveLength(2); // idempotent

  // Complete today's daily run: it closes and does NOT restart on the same day.
  const today = await boardOf("Daily stale");
  await ok(tick(STAFF(), today, "Bucket 1", "Staff"));
  await ok(tick(DUAL(), today, "Bucket 1", "Dual"));
  await snap(MGR());
  const after = await boardOf("Daily stale");
  expect(after.cycle).toBeNull();
  expect(after.lastRun).toMatchObject({ sequence: 2, status: "completed" });
  expect(await cyclesOf(stale.id)).toHaveLength(2);
  // Nothing can be ticked between runs; a manager starts the next one.
  expect((await tick(STAFF(), after, "Bucket 1", "Staff")).ok).toBe(false);
  await ok(run(MGR(), { type: "cycleStart", boardId: stale.id }));
  expect((await boardOf("Daily stale")).cycle?.sequence).toBe(3);
});

it("a board with no required work never closes by itself", async () => {
  await ok(run(MGR(), settings("Optional only")));
  const b = await boardOf("Optional only");
  await ok(
    run(MGR(), {
      type: "columnSave",
      boardId: b.id,
      columnId: null,
      label: "Staff",
      profileId: fx.staff.id,
    }),
  );
  await ok(
    run(MGR(), {
      type: "rowSave",
      boardId: b.id,
      rowId: null,
      title: "Optional A",
      instructions: null,
      required: false,
      mode: "all_columns",
      columnIds: [],
    }),
  );
  const live = await boardOf("Optional only");
  const r = await ok(tick(STAFF(), live, "Optional A", "Staff"));
  expect(r.outcome).toBe("checked");
  await snap(MGR());
  expect(await cyclesOf(b.id)).toHaveLength(1);
});
