import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChoreBoardView, ChoreSnapshot } from "../domain/chore-types";

const actions = vi.hoisted(() => ({
  getChoreSnapshotAction: vi.fn(),
  runChoreCommandAction: vi.fn(),
}));
vi.mock("@/features/tasks/actions/chore-actions", () => actions);

import { cellKey } from "../domain/chore-rules";
import { useChoreController } from "./use-chore-controller";

const viewer = { profileId: "ann", name: "Ann", isManager: false };

function board(done: boolean): ChoreBoardView {
  return {
    id: "b1",
    organizationId: "org",
    locationId: "loc",
    name: "Prep",
    description: null,
    isActive: true,
    archived: false,
    sortOrder: 10,
    staffAccess: "own_column",
    managerOverride: false,
    defaultMode: "all_columns",
    recurrenceIntent: "continuous",
    resetIntent: "manual_restart",
    version: 1,
    cycle: {
      id: "c1",
      sequence: 1,
      openedAt: "2026-11-20T00:00:00Z",
      businessDate: "2026-11-20",
      openedBySystem: false,
    },
    columns: [
      {
        id: "col1",
        label: "Ann",
        profileId: "ann",
        sortOrder: 10,
        isActive: true,
        archived: false,
      },
    ],
    rows: [
      {
        id: "row1",
        title: "Lassi",
        instructions: null,
        isRequired: true,
        mode: "all_columns",
        selectedColumnIds: [],
        sortOrder: 10,
        isActive: true,
        archived: false,
      },
    ],
    completions: done
      ? [
          {
            rowId: "row1",
            columnId: "col1",
            completedBy: "ann",
            completedByName: "Ann",
            completedAt: "2026-11-20T12:00:00Z",
            enteredAs: "self",
          },
        ]
      : [],
    assignments: [],
  };
}
const snap = (done: boolean): ChoreSnapshot => ({ boards: [board(done)] });
const key = cellKey("b1", "row1", "col1");

function setup() {
  actions.getChoreSnapshotAction.mockResolvedValue({
    ok: true,
    data: snap(false),
  });
  const hook = renderHook(() =>
    useChoreController({ demo: null, restaurantSlug: "the-monks", viewer }),
  );
  act(() => hook.result.current.ensureLoaded());
  return hook;
}

describe("useChoreController (demo mode)", () => {
  it("builds each command on the previous result even before React re-renders", async () => {
    const { emptyTasksState } = await import("../domain/task-engine");
    const setState = vi.fn();
    const demo = {
      state: emptyTasksState(),
      setState,
      team: [
        { profileId: "ann", name: "Ann", designation: "manager" as const },
      ],
      organizationId: "org",
    };
    const { result } = renderHook(() =>
      useChoreController({
        demo,
        restaurantSlug: "demo",
        viewer: { profileId: "ann", name: "Ann", isManager: true },
      }),
    );
    // `setState` is a spy: the demo state prop never changes, exactly like a
    // render that has not happened yet between two awaited commands.
    await act(async () => {
      await result.current.run({
        type: "boardSave",
        boardId: null,
        name: "Prep",
        description: null,
        staffAccess: "own_column",
        managerOverride: false,
        defaultMode: "all_columns",
        recurrenceIntent: "continuous",
        resetIntent: "manual_restart",
        expectedVersion: null,
      });
      const board = (
        setState.mock.calls.at(-1)?.[0] as {
          chores: { boards: { id: string }[] };
        }
      ).chores.boards[0]!;
      for (const title of ["One", "Two", "Three"]) {
        const r = await result.current.run({
          type: "rowSave",
          boardId: board.id,
          rowId: null,
          title,
          instructions: null,
          required: true,
          mode: "all_columns",
          columnIds: [],
        });
        expect(r.ok).toBe(true);
      }
    });
    const last = setState.mock.calls.at(-1)?.[0] as {
      chores: { boards: { rows: { title: string }[] }[] };
    };
    expect(last.chores.boards[0]!.rows.map((r) => r.title)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });
});

describe("useChoreController (real mode)", () => {
  beforeEach(() => {
    actions.getChoreSnapshotAction.mockReset();
    actions.runChoreCommandAction.mockReset();
  });

  it("loads nothing until the Chore Wheel is first opened", async () => {
    actions.getChoreSnapshotAction.mockResolvedValue({
      ok: true,
      data: snap(false),
    });
    const { result } = renderHook(() =>
      useChoreController({ demo: null, restaurantSlug: "the-monks", viewer }),
    );
    await Promise.resolve();
    expect(actions.getChoreSnapshotAction).not.toHaveBeenCalled();
    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(actions.getChoreSnapshotAction).toHaveBeenCalledTimes(1);
  });

  it("shows a tick at once and keeps the server's snapshot when the write succeeds", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    let release!: (v: unknown) => void;
    actions.runChoreCommandAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    let outcome: Promise<unknown>;
    act(() => {
      outcome = result.current.setCell("b1", "row1", "col1", true);
    });
    // Overlay visible, cell marked in flight.
    expect(result.current.snapshot?.boards[0]?.completions).toHaveLength(1);
    expect(result.current.pendingCells.has(key)).toBe(true);
    await act(async () => {
      release({ ok: true, data: snap(true), outcome: "checked" });
      await outcome;
    });
    expect(result.current.pendingCells.has(key)).toBe(false);
    expect(result.current.snapshot?.boards[0]?.completions).toHaveLength(1);
  });

  it("reverts the display and reports the error when the server refuses", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    actions.runChoreCommandAction.mockResolvedValue({
      ok: false,
      error: "You can only update your own column on this board.",
    });
    let res: unknown;
    await act(async () => {
      res = await result.current.setCell("b1", "row1", "col1", true);
    });
    expect(res).toEqual({
      ok: false,
      error: "You can only update your own column on this board.",
    });
    // The optimistic tick is gone: the board shows what the server last said.
    expect(result.current.snapshot?.boards[0]?.completions).toHaveLength(0);
    expect(result.current.pendingCells.size).toBe(0);
  });

  it("reverts when the request itself throws, and re-reads the truth", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    actions.runChoreCommandAction.mockRejectedValue(new Error("network"));
    let res: unknown;
    await act(async () => {
      res = await result.current.setCell("b1", "row1", "col1", true);
    });
    expect(res).toMatchObject({ ok: false });
    expect(result.current.snapshot?.boards[0]?.completions).toHaveLength(0);
    await waitFor(() =>
      expect(actions.getChoreSnapshotAction.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );
  });

  it("writes once for rapid taps of the same cell", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    let release!: (v: unknown) => void;
    actions.runChoreCommandAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    let first: Promise<unknown>;
    let second: unknown;
    await act(async () => {
      first = result.current.setCell("b1", "row1", "col1", true);
      second = await result.current.setCell("b1", "row1", "col1", true);
    });
    expect(second).toEqual({
      ok: false,
      error: "Still saving the last change.",
    });
    await act(async () => {
      release({ ok: true, data: snap(true), outcome: "checked" });
      await first;
    });
    expect(actions.runChoreCommandAction).toHaveBeenCalledTimes(1);
  });

  it("sends the command with no actor, location or time", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    actions.runChoreCommandAction.mockResolvedValue({
      ok: true,
      data: snap(true),
      outcome: "checked",
    });
    await act(async () => {
      await result.current.setCell("b1", "row1", "col1", true);
    });
    const sent = actions.runChoreCommandAction.mock.calls[0]?.[0] as {
      command: Record<string, unknown>;
    };
    // The run on screen is named (a stale tab is refused); still no actor, location or time.
    expect(Object.keys(sent.command).sort()).toEqual([
      "boardId",
      "columnId",
      "cycleId",
      "done",
      "rowId",
      "type",
    ]);
  });
});
