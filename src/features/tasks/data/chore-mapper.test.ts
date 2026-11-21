import { describe, expect, it } from "vitest";

import { boardProgress } from "../domain/chore-rules";
import { correctedProgress } from "../domain/chore-cycles";
import { mapChoreBoards, mapRunDetail, mapRunSummary } from "./chore-mapper";

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
        business_date: "2026-11-20",
        opened_by_kind: "user",
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

describe("finished runs (immutable snapshots)", () => {
  const header = {
    cycle_id: "c1",
    board_id: "b1",
    board_name: "Mango Lassi (as it was)",
    sequence: 3,
    final_status: "completed",
    outcome: "completed",
    close_trigger: "automatic",
    business_date: "2026-11-20",
    structure_changed: true,
    required_total: 2,
    required_done: 2,
    optional_total: 1,
    optional_done: 0,
    opened_at: "2026-11-20T15:00:00Z",
    closed_at: "2026-11-20T16:00:00Z",
    closed_by_kind: "system",
    closed_by_name: null,
    note: null,
    staff_access: "own_column",
    manager_override: true,
    recurrence_intent: "daily",
    reset_intent: "automatic_after_completion",
    organization_id: "o",
    location_id: "l",
  };

  it("maps the header: system closure has no person, unknown values degrade safely", () => {
    const run = mapRunSummary({ ...header, final_status: "weird" });
    expect(run).toMatchObject({
      boardName: "Mango Lassi (as it was)",
      sequence: 3,
      completed: true,
      closedByKind: "system",
      closedByName: null,
      closeTrigger: "automatic",
      structureChanged: true,
    });
    expect(run.status).toBe("cancelled"); // never invented as Completed
  });

  it("rebuilds the board from the COPIES: removed rows and people keep their evidence and never count", () => {
    const detail = mapRunDetail({
      header,
      rows: [
        {
          row_id: "r1",
          title: "Bucket 1",
          instructions: null,
          is_required: true,
          requirement_mode: "all_columns",
          sort_order: 10,
          selected_column_ids: [],
          was_live: true,
        },
        {
          row_id: "r2",
          title: "Wipe menus",
          instructions: null,
          is_required: false,
          requirement_mode: "all_columns",
          sort_order: 20,
          selected_column_ids: [],
          was_live: true,
        },
      ],
      columns: [
        {
          column_id: "c1",
          label: "Alex",
          profile_id: "p1",
          profile_name: "alex",
          sort_order: 10,
          was_live: true,
        },
        {
          column_id: "c2",
          label: "Taylor",
          profile_id: "p2",
          profile_name: "taylor",
          sort_order: 20,
          was_live: false,
        },
      ],
      cells: [
        {
          row_id: "r1",
          column_id: "c1",
          completed_by: "p1",
          completed_by_name: "alex",
          completed_at: "2026-11-20T15:30:00Z",
          entered_as: "self",
        },
        {
          row_id: "r1",
          column_id: "c2",
          completed_by: "p2",
          completed_by_name: "taylor",
          completed_at: "2026-11-20T15:40:00Z",
          entered_as: "self",
        },
      ],
      corrections: [
        {
          id: 1,
          row_id: "r1",
          column_id: "c1",
          done_before: true,
          done_after: false,
          before_completed_by_name: "alex",
          before_completed_at: "2026-11-20T15:30:00Z",
          reason: "off shift",
          corrected_by_name: "maya",
          created_at: "2026-11-21T10:00:00Z",
        },
      ],
      canCorrect: true,
    });
    expect(detail.board.rows.map((r) => r.title)).toEqual([
      "Bucket 1",
      "Wipe menus",
    ]);
    expect(detail.board.columns.map((c) => [c.label, c.isActive])).toEqual([
      ["Alex", true],
      ["Taylor", false],
    ]);
    // Same counting rules as the database: Taylor was removed, so only Alex owes Bucket 1.
    expect(boardProgress(detail.board)).toMatchObject({
      required: 1,
      completed: 1,
      optionalTotal: 1,
    });
    // The correction is shown separately; the recorded cells are untouched.
    expect(detail.board.completions).toHaveLength(2);
    expect(correctedProgress(detail)).toMatchObject({
      required: 1,
      completed: 0,
    });
    expect(detail.canCorrect).toBe(true);
  });
});
