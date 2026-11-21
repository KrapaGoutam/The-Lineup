import { describe, expect, it } from "vitest";

import { boardProgress } from "../domain/chore-rules";
import { mapChoreBoards } from "./chore-mapper";

describe("mapChoreBoards", () => {
  const base = {
    boards: [
      {
        id: "b1",
        organization_id: "o",
        location_id: "l",
        name: "Prep",
        description: null,
        is_active: true,
        archived_at: null,
        sort_order: 10,
        staff_access: "own_column",
        manager_override: false,
        default_requirement_mode: "all_columns",
        recurrence_intent: "daily",
        reset_intent: "manual_restart",
        version: 3,
      },
    ],
    cycles: [
      {
        id: "c1",
        board_id: "b1",
        sequence: 2,
        opened_at: "2026-11-20T00:00:00Z",
      },
    ],
    columns: [
      {
        id: "x1",
        board_id: "b1",
        label: "Ann",
        profile_id: "p1",
        sort_order: 10,
        is_active: true,
        archived_at: null,
      },
      {
        id: "x2",
        board_id: "b1",
        label: "Bea",
        profile_id: null,
        sort_order: 20,
        is_active: true,
        archived_at: null,
      },
    ],
    rows: [
      {
        id: "r1",
        board_id: "b1",
        title: "Lassi",
        instructions: null,
        is_required: true,
        requirement_mode: "all_columns",
        sort_order: 10,
        is_active: true,
        archived_at: null,
      },
      {
        id: "r2",
        board_id: "b1",
        title: "Mint",
        instructions: "Fill",
        is_required: true,
        requirement_mode: "selected_columns",
        sort_order: 20,
        is_active: true,
        archived_at: null,
      },
    ],
    rowColumns: [{ row_id: "r2", column_id: "x1" }],
    completions: [
      {
        board_id: "b1",
        row_id: "r1",
        column_id: "x1",
        completed_by: "p1",
        completed_by_name: "Ann",
        completed_at: "2026-11-20T12:00:00Z",
        entered_as: "self",
      },
    ],
    assignments: [
      {
        column_id: "x1",
        board_id: "b1",
        profile_id: "p1",
        assigned_at: "2026-11-20T00:00:00Z",
        ended_at: null,
      },
    ],
  };

  it("maps rows to views, keyed by stable ids", () => {
    const [b] = mapChoreBoards(base);
    expect(b).toMatchObject({
      id: "b1",
      version: 3,
      recurrenceIntent: "daily",
      cycle: { id: "c1", sequence: 2 },
    });
    expect(b!.rows[1]!.selectedColumnIds).toEqual(["x1"]);
    expect(b!.columns[1]).toMatchObject({ profileId: null, archived: false });
    expect(b!.completions[0]).toMatchObject({
      rowId: "r1",
      columnId: "x1",
      completedBy: "p1",
    });
    // 2 columns for the all-columns chore + 1 selected column.
    expect(boardProgress(b!)).toMatchObject({ required: 3, completed: 1 });
  });

  it("degrades unknown enum text to safe defaults and keeps archived state", () => {
    const [b] = mapChoreBoards({
      ...base,
      boards: [
        {
          ...base.boards[0]!,
          staff_access: "weird",
          default_requirement_mode: "x",
          archived_at: "2026-11-20T00:00:00Z",
        },
      ],
    });
    expect(b).toMatchObject({
      staffAccess: "own_column",
      defaultMode: "all_columns",
      archived: true,
    });
  });

  it("returns a board with no cycle when none is open", () => {
    const [b] = mapChoreBoards({ ...base, cycles: [] });
    expect(b!.cycle).toBeNull();
  });
});
