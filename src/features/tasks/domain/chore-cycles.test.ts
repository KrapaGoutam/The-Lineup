import { describe, expect, it } from "vitest";

import { applyChoreCommand, emptyChoreState } from "./chore-engine";
import type { ChoreEngineContext, ChoreState } from "./chore-engine";
import type { ChoreCommand } from "./chore-commands";
import {
  applyCorrections,
  correctedProgress,
  freezeBoard,
  periodKey,
  periodStart,
  recurrenceSummary,
  runReadiness,
} from "./chore-cycles";
import { boardProgress } from "./chore-rules";
import type { ChoreBoardView, ChoreViewer } from "./chore-types";
import { TEAM } from "./task-test-helpers";

const MANAGER: ChoreViewer = {
  profileId: "mona",
  name: "Mona",
  isManager: true,
};
const ANN: ChoreViewer = { profileId: "ann", name: "Ann", isManager: false };
const BEA: ChoreViewer = { profileId: "bea", name: "Bea", isManager: false };
const TZ = "America/Chicago";

function ctx(viewer: ChoreViewer, now: string): ChoreEngineContext {
  return {
    viewer,
    team: TEAM,
    organizationId: "org",
    locationId: "demo-location",
    now: new Date(now),
    timeZone: TZ,
  };
}

/** A tiny harness: runs commands as people at moments in time. */
class Sim {
  state: ChoreState = emptyChoreState();
  now = "2026-11-10T18:00:00Z";
  do(command: ChoreCommand, who: ChoreViewer = MANAGER) {
    const result = applyChoreCommand(this.state, command, ctx(who, this.now));
    if (!result.ok) throw new Error(result.error);
    this.state = result.value;
    return result.outcome;
  }
  fail(command: ChoreCommand, who: ChoreViewer = MANAGER) {
    const result = applyChoreCommand(this.state, command, ctx(who, this.now));
    if (result.ok) throw new Error("expected a refusal");
    return result.error;
  }
  board(id: string): ChoreBoardView {
    const b = this.state.boards.find((x) => x.id === id);
    if (!b) throw new Error("no board");
    return b;
  }
  /** Creates a board with columns Ann + Bea and rows "R1" / "R2" (all columns, required). */
  make(
    name: string,
    recurrence: ChoreCommand extends infer C
      ? C extends { recurrenceIntent: infer R }
        ? R
        : never
      : never,
    reset: "automatic_after_completion" | "manual_restart",
  ) {
    this.do({
      type: "boardSave",
      boardId: null,
      name,
      description: null,
      staffAccess: "own_column",
      managerOverride: true,
      defaultMode: "all_columns",
      recurrenceIntent: recurrence,
      resetIntent: reset,
      expectedVersion: null,
    });
    const id = this.state.boards[this.state.boards.length - 1].id;
    for (const [label, profileId] of [
      ["Ann", "ann"],
      ["Bea", "bea"],
    ] as const) {
      this.do({
        type: "columnSave",
        boardId: id,
        columnId: null,
        label,
        profileId,
      });
    }
    for (const title of ["R1", "R2"]) {
      this.do({
        type: "rowSave",
        boardId: id,
        rowId: null,
        title,
        instructions: null,
        required: true,
        mode: "all_columns",
        columnIds: [],
      });
    }
    return id;
  }
  ids(boardId: string) {
    const b = this.board(boardId);
    const col = (l: string) => b.columns.find((c) => c.label === l)!.id;
    const row = (t: string) => b.rows.find((r) => r.title === t)!.id;
    return { col, row };
  }
  tick(boardId: string, rowTitle: string, colLabel: string, who: ChoreViewer) {
    const { col, row } = this.ids(boardId);
    return this.do(
      {
        type: "cellSet",
        boardId,
        rowId: row(rowTitle),
        columnId: col(colLabel),
        done: true,
        cycleId: this.board(boardId).cycle?.id ?? null,
      },
      who,
    );
  }
  fillAll(boardId: string) {
    this.tick(boardId, "R1", "Ann", ANN);
    this.tick(boardId, "R2", "Ann", ANN);
    this.tick(boardId, "R1", "Bea", BEA);
    return this.tick(boardId, "R2", "Bea", BEA);
  }
}

describe("period rules (mirror of private.chore_period_start)", () => {
  it("daily is the date itself, weekly is the Monday of the ISO week, others have none", () => {
    expect(periodStart("daily", "2026-11-21")).toBe("2026-11-21");
    expect(periodStart("weekly", "2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(periodStart("weekly", "2026-11-16")).toBe("2026-11-16"); // Monday
    expect(periodStart("weekly", "2026-12-01")).toBe("2026-11-30"); // across a month end
    expect(periodStart("continuous", "2026-11-16")).toBeNull();
    expect(periodStart("manual", "2026-11-16")).toBeNull();
    expect(periodStart("per_shift", "2026-11-16")).toBeNull();
    expect(periodKey("daily", "2026-11-21")).toBe("d:2026-11-21");
    expect(periodKey("weekly", "2026-11-22")).toBe("w:2026-11-16");
    expect(periodKey("continuous", "2026-11-22")).toBeNull();
  });

  it("describes a board in one sentence", () => {
    expect(recurrenceSummary("daily", "automatic_after_completion")).toBe(
      "Daily · closes itself when complete",
    );
    expect(recurrenceSummary("manual", "manual_restart")).toBe(
      "Manual starts · a manager closes it",
    );
  });
});

describe("run closure (demo twin of the database engine)", () => {
  it("completing one board closes only that board's run; run numbers are independent", () => {
    const s = new Sim();
    const mango = s.make(
      "Mango Lassi",
      "continuous",
      "automatic_after_completion",
    );
    const gulab = s.make(
      "Gulab Jamun",
      "continuous",
      "automatic_after_completion",
    );
    const rasmalai = s.make(
      "Rasmalai",
      "continuous",
      "automatic_after_completion",
    );
    s.tick(gulab, "R1", "Ann", ANN);
    s.tick(mango, "R1", "Ann", ANN);
    s.tick(mango, "R2", "Ann", ANN);
    s.tick(mango, "R1", "Bea", BEA);
    expect(s.board(mango).cycle?.sequence).toBe(1);
    expect(s.tick(mango, "R2", "Bea", BEA)).toBe("checked_closed");

    expect(s.board(mango).cycle?.sequence).toBe(2); // successor
    expect(s.board(mango).completions).toHaveLength(0);
    expect(s.board(gulab).cycle?.sequence).toBe(1); // untouched
    expect(s.board(gulab).completions).toHaveLength(1);
    expect(s.board(rasmalai).cycle?.sequence).toBe(1);
    const history = s.state.history.map((h) => h.summary);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      boardName: "Mango Lassi",
      sequence: 1,
      status: "completed",
      completed: true,
      closedByKind: "system",
      closedByName: null,
      closeTrigger: "automatic",
      requiredDone: 4,
      requiredTotal: 4,
    });
  });

  it("refuses a tick that names the finished run (stale tab) and keeps the new run clean", () => {
    const s = new Sim();
    const b = s.make("Mango", "continuous", "automatic_after_completion");
    const staleCycle = s.board(b).cycle!.id;
    s.fillAll(b);
    const { col, row } = s.ids(b);
    expect(
      s.fail(
        {
          type: "cellSet",
          boardId: b,
          rowId: row("R1"),
          columnId: col("Ann"),
          done: true,
          cycleId: staleCycle,
        },
        ANN,
      ),
    ).toMatch(/already ended/);
    expect(s.board(b).completions).toHaveLength(0);
  });

  it("manual reset: the final tick only checks; a manager closes (staff cannot)", () => {
    const s = new Sim();
    const b = s.make("Manual", "continuous", "manual_restart");
    expect(s.fillAll(b)).toBe("checked");
    expect(runReadiness(s.board(b))).toBe("ready");
    expect(s.state.history).toHaveLength(0);
    const cycleId = s.board(b).cycle!.id;
    expect(
      s.fail(
        {
          type: "cycleClose",
          boardId: b,
          cycleId,
          outcome: "completed",
          note: null,
          startNext: true,
        },
        ANN,
      ),
    ).toMatch(/Only an owner/);
    s.do({
      type: "cycleClose",
      boardId: b,
      cycleId,
      outcome: "completed",
      note: null,
      startNext: true,
    });
    expect(s.board(b).cycle?.sequence).toBe(2);
    expect(s.state.history[0].summary).toMatchObject({
      closedByKind: "user",
      closedByName: "Mona",
      closeTrigger: "manual",
    });
    // Idempotent: the same close again changes nothing.
    expect(
      s.do({
        type: "cycleClose",
        boardId: b,
        cycleId,
        outcome: "completed",
        note: null,
        startNext: true,
      }),
    ).toBe("already_closed");
    expect(s.state.history).toHaveLength(1);
  });

  it("an unfinished run cannot be completed; cancelling needs a reason and is Not Completed", () => {
    const s = new Sim();
    const b = s.make("Manual", "continuous", "manual_restart");
    s.tick(b, "R1", "Ann", ANN);
    const cycleId = s.board(b).cycle!.id;
    expect(
      s.fail({
        type: "cycleClose",
        boardId: b,
        cycleId,
        outcome: "completed",
        note: null,
        startNext: false,
      }),
    ).toMatch(/not complete yet/);
    expect(
      s.fail({
        type: "cycleClose",
        boardId: b,
        cycleId,
        outcome: "cancelled",
        note: " ",
        startNext: false,
      }),
    ).toMatch(/Say why/);
    s.do({
      type: "cycleClose",
      boardId: b,
      cycleId,
      outcome: "cancelled",
      note: "Closed early",
      startNext: false,
    });
    expect(s.board(b).cycle).toBeNull(); // between runs
    expect(s.state.history[0].summary).toMatchObject({
      status: "cancelled",
      completed: false,
      requiredDone: 1,
      note: "Closed early",
    });
    expect(
      s.fail(
        { type: "cellSet", boardId: b, rowId: "x", columnId: "y", done: true },
        ANN,
      ),
    ).toMatch(/between runs|not available/);
    s.do({ type: "cycleStart", boardId: b });
    expect(s.board(b).cycle?.sequence).toBe(2);
    expect(s.do({ type: "cycleStart", boardId: b })).toBe("already_open");
  });

  it("a board with no required work is never complete and never closes by itself", () => {
    const s = new Sim();
    s.do({
      type: "boardSave",
      boardId: null,
      name: "Optional only",
      description: null,
      staffAccess: "own_column",
      managerOverride: false,
      defaultMode: "all_columns",
      recurrenceIntent: "continuous",
      resetIntent: "automatic_after_completion",
      expectedVersion: null,
    });
    const b = s.state.boards[0].id;
    s.do({
      type: "columnSave",
      boardId: b,
      columnId: null,
      label: "Ann",
      profileId: "ann",
    });
    s.do({
      type: "rowSave",
      boardId: b,
      rowId: null,
      title: "Optional A",
      instructions: null,
      required: false,
      mode: "all_columns",
      columnIds: [],
    });
    expect(runReadiness(s.board(b))).toBe("no_required_work");
    expect(s.tick(b, "Optional A", "Ann", ANN)).toBe("checked");
    expect(s.do({ type: "cyclesSweep" })).toBe("0");
    expect(s.state.history).toHaveLength(0);
    const cycleId = s.board(b).cycle!.id;
    expect(
      s.fail({
        type: "cycleClose",
        boardId: b,
        cycleId,
        outcome: "completed",
        note: null,
        startNext: false,
      }),
    ).toMatch(/not complete yet/);
  });

  it("per-shift cannot be enabled", () => {
    const s = new Sim();
    expect(
      s.fail({
        type: "boardSave",
        boardId: null,
        name: "Shifty",
        description: null,
        staffAccess: "own_column",
        managerOverride: false,
        defaultMode: "all_columns",
        recurrenceIntent: "per_shift",
        resetIntent: "manual_restart",
        expectedVersion: null,
      }),
    ).toMatch(/Per-shift runs are not available/);
  });
});

describe("recurrence sweep (demo twin of chore_cycles_sweep)", () => {
  it("a completed daily run does not restart on the same business day; the next day starts one", () => {
    const s = new Sim();
    const b = s.make("Rasmalai", "daily", "automatic_after_completion");
    expect(s.fillAll(b)).toBe("checked_closed");
    expect(s.board(b).cycle).toBeNull();
    expect(s.do({ type: "cyclesSweep" })).toBe("0"); // same day
    expect(s.state.history).toHaveLength(1);
    s.now = "2026-11-11T18:00:00Z"; // next business day (Chicago)
    expect(s.do({ type: "cyclesSweep" })).toBe("1");
    expect(s.board(b).cycle?.sequence).toBe(2);
    expect(s.board(b).cycle?.openedBySystem).toBe(true);
    expect(s.do({ type: "cyclesSweep" })).toBe("0"); // duplicate invocation is harmless
  });

  it("uses the LOCATION calendar day, not UTC, for the day boundary", () => {
    const s = new Sim();
    s.now = "2026-11-11T03:30:00Z"; // still Nov 10 in Chicago (21:30)
    const b = s.make("Late", "daily", "automatic_after_completion");
    expect(s.board(b).cycle?.businessDate).toBe("2026-11-10");
    s.now = "2026-11-11T05:30:00Z"; // 23:30 Chicago: still Nov 10
    expect(s.do({ type: "cyclesSweep" })).toBe("0");
    s.now = "2026-11-11T07:30:00Z"; // 01:30 Chicago: Nov 11
    // Nov 10's stale run expires and Nov 11's run opens (two transitions).
    expect(s.do({ type: "cyclesSweep" })).toBe("2");
  });

  it("expires a stale incomplete run as Not Completed and opens exactly ONE run after a gap", () => {
    const s = new Sim();
    const b = s.make("Daily", "daily", "automatic_after_completion");
    s.tick(b, "R1", "Ann", ANN);
    s.now = "2026-11-15T18:00:00Z"; // five days later
    s.do({ type: "cyclesSweep" });
    const runs = s.state.history.map((h) => h.summary);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "expired",
      completed: false,
      closedByKind: "system",
      requiredDone: 1,
      requiredTotal: 4,
    });
    expect(s.board(b).cycle?.sequence).toBe(2); // no runs invented for the missed days
    expect(s.do({ type: "cyclesSweep" })).toBe("0");
  });

  it("weekly: stays open inside the week, rolls on the next Monday", () => {
    const s = new Sim();
    const b = s.make("Weekly", "weekly", "automatic_after_completion");
    s.tick(b, "R1", "Ann", ANN);
    s.now = "2026-11-15T18:00:00Z"; // Sunday of the same ISO week (Mon Nov 9)
    expect(s.do({ type: "cyclesSweep" })).toBe("0");
    s.now = "2026-11-16T18:00:00Z"; // Monday
    expect(Number(s.do({ type: "cyclesSweep" }))).toBeGreaterThanOrEqual(1);
    expect(s.board(b).cycle?.sequence).toBe(2);
  });

  it("never touches manual-reset or turned-off boards", () => {
    const s = new Sim();
    const manual = s.make("Manual", "daily", "manual_restart");
    s.now = "2026-11-20T18:00:00Z";
    expect(s.do({ type: "cyclesSweep" })).toBe("0");
    expect(s.board(manual).cycle?.sequence).toBe(1);
  });
});

describe("snapshots stay frozen; corrections append", () => {
  it("template edits after close never change the saved run, and removed columns with work are kept", () => {
    const s = new Sim();
    const b = s.make("Mango", "continuous", "automatic_after_completion");
    s.tick(b, "R1", "Ann", ANN);
    s.tick(b, "R1", "Bea", BEA);
    const bea = s.ids(b).col("Bea");
    // Mid-run: rename a chore, remove Bea (she has a completion).
    s.do({
      type: "rowSave",
      boardId: b,
      rowId: s.ids(b).row("R2"),
      title: "R2 renamed",
      instructions: null,
      required: true,
      mode: "all_columns",
      columnIds: [],
    });
    s.do({ type: "columnSetState", columnId: bea, state: "archived" });
    s.tick(b, "R2 renamed", "Ann", ANN); // Ann now owes R1 + R2 renamed -> done
    const frozen = s.state.history[0];
    expect(frozen.summary).toMatchObject({
      status: "completed",
      requiredDone: 2,
      requiredTotal: 2,
      structureChanged: true,
    });
    expect(frozen.board.rows.map((r) => r.title)).toEqual(["R1", "R2 renamed"]);
    expect(frozen.board.columns.find((c) => c.label === "Bea")).toMatchObject({
      isActive: false,
    });
    expect(frozen.board.completions).toHaveLength(3);

    // Later edits never reach it.
    s.do({
      type: "rowSave",
      boardId: b,
      rowId: s.ids(b).row("R1"),
      title: "R1 changed again",
      instructions: null,
      required: true,
      mode: "all_columns",
      columnIds: [],
    });
    expect(s.state.history[0].board.rows[0].title).toBe("R1");
  });

  it("appends a correction with before/after and the reason; the original stays; recorded and corrected progress differ", () => {
    const s = new Sim();
    const b = s.make("Mango", "continuous", "automatic_after_completion");
    s.fillAll(b);
    const cycleId = s.state.history[0].summary.cycleId;
    const detail = s.state.history[0];
    const row = detail.board.rows[0].id;
    const col = detail.board.columns[0].id;

    expect(
      s.fail(
        {
          type: "cycleCorrect",
          cycleId,
          rowId: row,
          columnId: col,
          done: false,
          reason: "x",
        },
        ANN,
      ),
    ).toMatch(/Only an owner/);
    expect(
      s.do({
        type: "cycleCorrect",
        cycleId,
        rowId: row,
        columnId: col,
        done: false,
        reason: "Ann was off shift",
      }),
    ).toBe("corrected");
    expect(
      s.do({
        type: "cycleCorrect",
        cycleId,
        rowId: row,
        columnId: col,
        done: false,
        reason: "again",
      }),
    ).toBe("unchanged");
    const after = s.state.history[0];
    expect(after.corrections).toHaveLength(1);
    expect(after.corrections[0]).toMatchObject({
      doneBefore: true,
      doneAfter: false,
      beforeCompletedByName: "Ann",
      correctedByName: "Mona",
      reason: "Ann was off shift",
    });
    expect(after.board.completions).toHaveLength(4); // original untouched
    expect(boardProgress(after.board).completed).toBe(4);
    expect(correctedProgress(after).completed).toBe(3);
    expect(after.summary.status).toBe("completed"); // recorded outcome unchanged
    expect(
      applyCorrections(after.board, after.corrections).completions,
    ).toHaveLength(3);
  });

  it("corrections are off unless the board allows manager correction", () => {
    const s = new Sim();
    const b = s.make("Mango", "continuous", "automatic_after_completion");
    s.fillAll(b);
    s.do({
      type: "boardSave",
      boardId: b,
      name: "Mango",
      description: null,
      staffAccess: "own_column",
      managerOverride: false,
      defaultMode: "all_columns",
      recurrenceIntent: "continuous",
      resetIntent: "automatic_after_completion",
      expectedVersion: null,
    });
    const d = s.state.history[0];
    expect(
      s.fail({
        type: "cycleCorrect",
        cycleId: d.summary.cycleId,
        rowId: d.board.rows[0].id,
        columnId: d.board.columns[0].id,
        done: false,
        reason: "no",
      }),
    ).toMatch(/Corrections are off/);
  });

  it("freezeBoard keeps live structure plus removed columns that carry completions", () => {
    const s = new Sim();
    const b = s.make("Mango", "manual", "manual_restart");
    s.tick(b, "R1", "Ann", ANN);
    s.do({
      type: "columnSetState",
      columnId: s.ids(b).col("Ann"),
      state: "inactive",
    });
    const frozen = freezeBoard(s.board(b));
    expect(frozen.columns.map((c) => [c.label, c.isActive])).toEqual([
      ["Ann", false],
      ["Bea", true],
    ]);
  });
});
