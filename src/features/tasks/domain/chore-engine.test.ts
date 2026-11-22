import { describe, expect, it } from "vitest";

import type { ChoreCommand } from "./chore-commands";
import {
  applyChoreCommand,
  buildChoreSnapshot,
  emptyChoreState,
  type ChoreEngineContext,
  type ChoreState,
} from "./chore-engine";
import {
  boardProgress,
  canTickCell,
  cellState,
  columnProgress,
  defaultColumnFor,
} from "./chore-rules";
import type { ChoreBoardView, ChoreViewer } from "./chore-types";
import { createDemoChoreState } from "./demo-chores";
import type { TaskTeamMember } from "./task-types";

const team: TaskTeamMember[] = [
  { profileId: "manager-maya", name: "Maya Singh", designation: "manager" },
  { profileId: "ann", name: "Ann Lee", designation: "staff" },
  { profileId: "bea", name: "Bea Cruz", designation: "staff" },
  { profileId: "cy", name: "Cy Dane", designation: "staff" },
  { profileId: "dee", name: "Dee Park", designation: "assistant_manager" },
];
const NOW = new Date("2026-11-20T15:00:00Z");

const viewer = (profileId: string): ChoreViewer => {
  const m = team.find((t) => t.profileId === profileId);
  return {
    profileId,
    name: m?.name ?? profileId,
    isManager: m?.designation !== "staff",
  };
};
const ctx = (profileId: string): ChoreEngineContext => ({
  viewer: viewer(profileId),
  team,
  organizationId: "org",
  locationId: "loc",
  now: NOW,
});

function run(state: ChoreState, who: string, command: ChoreCommand) {
  const result = applyChoreCommand(state, command, ctx(who));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function refused(state: ChoreState, who: string, command: ChoreCommand) {
  const result = applyChoreCommand(state, command, ctx(who));
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

const board = (state: ChoreState, i = 0) => state.boards[i] as ChoreBoardView;

function seeded(
  over: Partial<{
    managerOverride: boolean;
    access: "own_column" | "any_workforce";
  }> = {},
) {
  let s = emptyChoreState();
  s = run(s, "manager-maya", {
    type: "boardSave",
    boardId: null,
    name: "Prep",
    description: null,
    staffAccess: over.access ?? "own_column",
    managerOverride: over.managerOverride ?? false,
    defaultMode: "all_columns",
    recurrenceIntent: "daily",
    resetIntent: "manual_restart",
    expectedVersion: null,
  });
  const boardId = board(s).id;
  for (const p of ["ann", "bea"]) {
    s = run(s, "manager-maya", {
      type: "columnSave",
      boardId,
      columnId: null,
      label: "",
      profileId: p,
    });
  }
  s = run(s, "manager-maya", {
    type: "columnSave",
    boardId,
    columnId: null,
    label: "Prep Cook 2",
    profileId: null,
  });
  return { s, boardId };
}

const row = (
  boardId: string,
  title: string,
  over: Partial<Extract<ChoreCommand, { type: "rowSave" }>> = {},
): ChoreCommand => ({
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

describe("progress by completion rule", () => {
  it("counts live chores x live columns for all-columns chores", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "Lassi 1"));
    s = run(s, "manager-maya", row(boardId, "Lassi 2"));
    expect(boardProgress(board(s))).toMatchObject({
      required: 6,
      completed: 0,
      remaining: 6,
      percent: 0,
    });
  });

  it("counts only the selected people for a selected-people chore", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    const [ann] = board(s).columns;
    s = run(
      s,
      "manager-maya",
      row(boardId, "Mint", { mode: "selected_columns", columnIds: [ann!.id] }),
    );
    expect(boardProgress(board(s)).required).toBe(1);
    const mintRow = board(s).rows[0]!;
    const bea = board(s).columns[1]!;
    expect(cellState(board(s), mintRow, bea)).toBe("not_applicable");
  });

  it("counts an any-one chore once, never once per person", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "Napkins", { mode: "any_one" }));
    expect(boardProgress(board(s))).toMatchObject({
      required: 1,
      completed: 0,
    });
    const r = board(s).rows[0]!;
    const [ann, bea] = board(s).columns;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann!.id,
      done: true,
    });
    expect(boardProgress(board(s))).toMatchObject({
      required: 1,
      completed: 1,
      percent: 100,
    });
    expect(cellState(board(s), r, bea!)).toBe("covered");
  });

  it("never counts optional chores or inactive columns/chores", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "Required"));
    s = run(s, "manager-maya", row(boardId, "Optional", { required: false }));
    expect(boardProgress(board(s))).toMatchObject({
      required: 3,
      optionalTotal: 3,
    });
    const colId = board(s).columns[2]!.id;
    s = run(s, "manager-maya", {
      type: "columnSetState",
      columnId: colId,
      state: "inactive",
    });
    expect(boardProgress(board(s)).required).toBe(2);
    const rowId = board(s).rows[0]!.id;
    s = run(s, "manager-maya", {
      type: "rowSetState",
      rowId,
      state: "inactive",
    });
    expect(boardProgress(board(s)).required).toBe(0);
  });

  it("rounds the percentage and reports 0 when nothing is required", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    expect(boardProgress(board(s)).percent).toBe(0);
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: board(s).columns[0]!.id,
      done: true,
    });
    expect(boardProgress(board(s)).percent).toBe(33);
  });
});

describe("cell completion authority (demo twin of the RPC)", () => {
  it("lets a person tick their own cell and records them as the actor", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann.id,
      done: true,
    });
    expect(board(s).completions).toEqual([
      expect.objectContaining({ completedBy: "ann", enteredAs: "self" }),
    ]);
  });

  it("refuses to tick someone else's column (no impersonation)", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const bea = board(s).columns[1]!;
    expect(
      refused(s, "ann", {
        type: "cellSet",
        boardId,
        rowId: r.id,
        columnId: bea.id,
        done: true,
      }),
    ).toMatch(/your own column/);
  });

  it("lets anyone tick an unassigned position column", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const pos = board(s).columns[2]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: pos.id,
      done: true,
    });
    expect(board(s).completions[0]).toMatchObject({
      enteredAs: "position",
      completedBy: "ann",
    });
  });

  it("is idempotent and never overwrites the first completer", () => {
    const { boardId } = seeded({ access: "any_workforce" });
    let s = seeded({ access: "any_workforce" }).s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann.id,
      done: true,
    });
    const again = applyChoreCommand(
      s,
      { type: "cellSet", boardId, rowId: r.id, columnId: ann.id, done: true },
      ctx("bea"),
    );
    expect(again).toMatchObject({ ok: true, outcome: "unchanged" });
    expect(board(s).completions).toHaveLength(1);
    expect(board(s).completions[0]!.completedBy).toBe("ann");
  });

  it("lets a manager or authorized assistant manager check and uncheck an applicable cell WITHOUT the board override; other staff stay on their own column", () => {
    const { boardId, s: base } = seeded(); // managerOverride defaults to OFF
    let s = run(base, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    const tick = (who: string, done: boolean, columnId = ann.id) =>
      ({ type: "cellSet", boardId, rowId: r.id, columnId, done }) as const;

    // Other staff: refused on someone else's column.
    expect(refused(s, "cy", tick("cy", true))).toMatch(/your own column/);
    // The assignee checks her own cell.
    s = run(s, "ann", tick("ann", true));
    expect(board(s).completions[0]).toMatchObject({
      completedBy: "ann",
      enteredAs: "self",
    });
    // The manager unchecks it with the override OFF.
    expect(board(s).managerOverride).toBe(false);
    s = run(s, "manager-maya", tick("manager-maya", false));
    expect(board(s).completions).toHaveLength(0);
    // The manager checks it: the column stays Ann's, the actor is the manager.
    s = run(s, "manager-maya", tick("manager-maya", true));
    expect(board(s).completions[0]).toMatchObject({
      columnId: ann.id,
      completedBy: "manager-maya",
      enteredAs: "manager_correction",
    });
    expect(board(s).columns[0]!.profileId).toBe("ann");
    // An assistant manager (an authorized viewer here) may do the same.
    s = run(s, "dee", tick("dee", false));
    s = run(s, "dee", tick("dee", true));
    expect(board(s).completions[0]).toMatchObject({
      completedBy: "dee",
      enteredAs: "manager_correction",
    });
  });

  it("never lets management authority check a cell that does not apply to the column", () => {
    const { boardId, s: base } = seeded();
    const s = run(
      base,
      "manager-maya",
      row(boardId, "Bea only", {
        mode: "selected_columns",
        columnIds: [board(base).columns[1]!.id],
      }),
    );
    const r = board(s).rows[0]!;
    const [ann] = board(s).columns;
    const out = refused(s, "manager-maya", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann!.id,
      done: true,
    });
    expect(out).toMatch(/does not apply/);
    expect(board(s).completions).toHaveLength(0);
  });

  it("gives an any-one chore a single winner", () => {
    const { boardId } = seeded({ access: "any_workforce" });
    let s = seeded({ access: "any_workforce" }).s;
    s = run(s, "manager-maya", row(boardId, "Napkins", { mode: "any_one" }));
    const r = board(s).rows[0]!;
    const [ann, bea] = board(s).columns;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann!.id,
      done: true,
    });
    expect(
      refused(s, "bea", {
        type: "cellSet",
        boardId,
        rowId: r.id,
        columnId: bea!.id,
        done: true,
      }),
    ).toMatch(/already done by Ann Lee/);
  });

  it("refuses cells outside a selected-people chore and on inactive columns", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    const ann = board(s).columns[0]!;
    s = run(
      s,
      "manager-maya",
      row(boardId, "Mint", { mode: "selected_columns", columnIds: [ann.id] }),
    );
    const r = board(s).rows[0]!;
    const bea = board(s).columns[1]!;
    expect(
      refused(s, "bea", {
        type: "cellSet",
        boardId,
        rowId: r.id,
        columnId: bea.id,
        done: true,
      }),
    ).toMatch(/does not apply/);
    s = run(s, "manager-maya", {
      type: "columnSetState",
      columnId: ann.id,
      state: "inactive",
    });
    expect(
      refused(s, "ann", {
        type: "cellSet",
        boardId,
        rowId: r.id,
        columnId: ann.id,
        done: true,
      }),
    ).toMatch(/not available/);
  });

  it("hides turned-off boards from staff and refuses ticks on them", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    s = run(s, "manager-maya", {
      type: "boardSetState",
      boardId,
      state: "inactive",
    });
    expect(buildChoreSnapshot(s, viewer("ann")).boards).toHaveLength(0);
    expect(buildChoreSnapshot(s, viewer("manager-maya")).boards).toHaveLength(
      1,
    );
    expect(
      refused(s, "ann", {
        type: "cellSet",
        boardId,
        rowId: r.id,
        columnId: ann.id,
        done: true,
      }),
    ).toMatch(/does not exist or you cannot use it/);
  });
});

describe("configuration authority and integrity", () => {
  it("refuses configuration by staff, before validating anything", () => {
    const { s, boardId } = seeded();
    const bad = {
      type: "rowSave",
      boardId,
      rowId: null,
      title: "",
      instructions: null,
      required: true,
      mode: "all_columns",
      columnIds: [],
    } satisfies ChoreCommand;
    expect(refused(s, "ann", bad)).toMatch(/Only an owner, manager/);
  });

  it("assigns only eligible people, once per board, and keeps assignment history", () => {
    const { s, boardId } = seeded();
    const ann = board(s).columns[0]!;
    expect(
      refused(s, "manager-maya", {
        type: "columnSave",
        boardId,
        columnId: null,
        label: "X",
        profileId: "stranger",
      }),
    ).toMatch(/works at this location/);
    expect(
      refused(s, "manager-maya", {
        type: "columnSave",
        boardId,
        columnId: null,
        label: "X",
        profileId: "ann",
      }),
    ).toMatch(/already has a column/);
    const t = run(s, "manager-maya", {
      type: "columnSave",
      boardId,
      columnId: ann.id,
      label: "Opening prep",
      profileId: "cy",
    });
    const history = board(t).assignments.filter((a) => a.columnId === ann.id);
    expect(history).toHaveLength(2);
    expect(history.find((a) => a.profileId === "ann")?.endedAt).not.toBeNull();
    expect(history.find((a) => a.profileId === "cy")?.endedAt).toBeNull();
  });

  it("keeps completions when a column is reassigned (the actor is never rewritten)", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann.id,
      done: true,
    });
    s = run(s, "manager-maya", {
      type: "columnSave",
      boardId,
      columnId: ann.id,
      label: ann.label,
      profileId: "cy",
    });
    expect(board(s).completions[0]!.completedBy).toBe("ann");
  });

  it("renames a label without touching the person", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    const ann = board(s).columns[0]!;
    s = run(s, "manager-maya", {
      type: "columnSave",
      boardId,
      columnId: ann.id,
      label: "Opening",
      profileId: "ann",
    });
    expect(board(s).columns[0]).toMatchObject({
      label: "Opening",
      profileId: "ann",
    });
    expect(
      board(s).assignments.filter((a) => a.columnId === ann.id),
    ).toHaveLength(1);
  });

  it("detects a stale settings edit and bumps the version on a good one", () => {
    const { s, boardId } = seeded();
    const save = (expectedVersion: number | null): ChoreCommand => ({
      type: "boardSave",
      boardId,
      name: "Prep",
      description: "x",
      staffAccess: "own_column",
      managerOverride: false,
      defaultMode: "all_columns",
      recurrenceIntent: "weekly",
      resetIntent: "manual_restart",
      expectedVersion,
    });
    const t = run(s, "manager-maya", save(1));
    expect(board(t).version).toBe(2);
    expect(board(t).recurrenceIntent).toBe("weekly");
    expect(refused(t, "manager-maya", save(1))).toMatch(
      /changed by someone else/,
    );
  });

  it("refuses a duplicate live name, archives without deleting, and duplicates configuration only", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const r = board(s).rows[0]!;
    const ann = board(s).columns[0]!;
    s = run(s, "ann", {
      type: "cellSet",
      boardId,
      rowId: r.id,
      columnId: ann.id,
      done: true,
    });
    expect(
      refused(s, "manager-maya", {
        type: "boardDuplicate",
        boardId,
        name: " prep ",
      }),
    ).toMatch(/already exists/);
    s = run(s, "manager-maya", {
      type: "boardDuplicate",
      boardId,
      name: "Evening",
    });
    const copy = board(s, 1);
    expect(copy.columns).toHaveLength(3);
    expect(copy.rows).toHaveLength(1);
    expect(copy.completions).toHaveLength(0);
    expect(copy.cycle?.sequence).toBe(1);
    expect(copy.columns[0]!.id).not.toBe(ann.id);

    s = run(s, "manager-maya", {
      type: "boardSetState",
      boardId,
      state: "archived",
    });
    expect(board(s).completions).toHaveLength(1);
    expect(refused(s, "manager-maya", row(boardId, "Late"))).toMatch(
      /archived/,
    );
    expect(
      refused(s, "manager-maya", {
        type: "boardSetState",
        boardId,
        state: "active",
      }),
    ).toMatch(/archived/);
  });

  it("reorders chores and columns and rejects foreign ids", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "One"));
    s = run(s, "manager-maya", row(boardId, "Two"));
    const [one, two] = board(s).rows;
    s = run(s, "manager-maya", {
      type: "rowsReorder",
      boardId,
      rowIds: [two!.id, one!.id],
    });
    expect(
      [...board(s).rows]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => r.title),
    ).toEqual(["Two", "One"]);
    expect(
      refused(s, "manager-maya", {
        type: "rowsReorder",
        boardId,
        rowIds: ["nope"],
      }),
    ).toMatch(/not valid/);
    expect(
      refused(s, "manager-maya", {
        type: "columnsReorder",
        boardId,
        columnIds: ["nope"],
      }),
    ).toMatch(/not valid/);
  });

  it("refuses to reach a board of another location or organization", () => {
    const { s, boardId } = seeded();
    const other: ChoreEngineContext = {
      ...ctx("manager-maya"),
      locationId: "other",
    };
    const result = applyChoreCommand(
      s,
      { type: "boardSetState", boardId, state: "inactive" },
      other,
    );
    expect(result).toEqual({
      ok: false,
      error: "That board does not exist or you cannot use it.",
    });
  });
});

describe("tick hints and views", () => {
  it("mirrors the database decision for the UI", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const b = board(s);
    const r = b.rows[0]!;
    const [ann, bea, pos] = b.columns;
    expect(canTickCell(viewer("ann"), b, r, ann!)).toEqual({
      allowed: true,
      as: "self",
    });
    expect(canTickCell(viewer("ann"), b, r, bea!)).toMatchObject({
      allowed: false,
    });
    expect(canTickCell(viewer("ann"), b, r, pos!)).toEqual({
      allowed: true,
      as: "position",
    });
    expect(defaultColumnFor(viewer("bea"), b)?.id).toBe(bea!.id);
    expect(defaultColumnFor(viewer("manager-maya"), b)?.id).toBe(ann!.id);
    expect(columnProgress(b, ann!)).toEqual({ total: 1, done: 0 });
  });

  it("enables another person's applicable cell for management, with the override OFF, and never for staff or a non-applicable cell", () => {
    const { boardId } = seeded();
    let s = seeded().s;
    s = run(s, "manager-maya", row(boardId, "A"));
    const b = board(s);
    expect(b.managerOverride).toBe(false);
    const r = b.rows[0]!;
    const [ann] = b.columns;
    for (const who of ["manager-maya", "dee"]) {
      expect(canTickCell(viewer(who), b, r, ann!)).toEqual({
        allowed: true,
        as: "manager_correction",
      });
    }
    expect(canTickCell(viewer("cy"), b, r, ann!)).toMatchObject({
      allowed: false,
    });
    // A selected-columns chore that excludes Ann stays disabled for a manager.
    const sel = {
      ...r,
      mode: "selected_columns" as const,
      selectedColumnIds: [],
    };
    expect(canTickCell(viewer("manager-maya"), b, sel, ann!)).toMatchObject({
      allowed: false,
      reason: "This chore does not apply here.",
    });
  });

  it("seeds the demo board from the brief through the same engine", () => {
    const demoTeam: TaskTeamMember[] = [
      { profileId: "manager-maya", name: "Maya Singh", designation: "manager" },
      { profileId: "mia", name: "Mia Chen", designation: "staff" },
      { profileId: "leo", name: "Leo Park", designation: "staff" },
      { profileId: "ava", name: "Ava Brooks", designation: "staff" },
    ];
    const demo = createDemoChoreState(NOW, "org", demoTeam);
    const b = demo.boards[0]!;
    expect(b.name).toBe("Daily Refill & Prep");
    expect(b.columns.map((c) => c.label)).toEqual(["Mia", "Leo", "Ava"]);
    expect(b.rows).toHaveLength(8);
    // 6 all-column chores x 3 + one any-one chore; the optional chore is excluded.
    expect(boardProgress(b)).toMatchObject({ required: 19, optionalTotal: 3 });
    expect(createDemoChoreState(NOW, "org", [])).toEqual(emptyChoreState());
  });
});
