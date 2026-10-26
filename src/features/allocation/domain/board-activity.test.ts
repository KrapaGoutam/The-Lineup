import { describe, expect, it } from "vitest";

import { Constants } from "@/types/database.generated";

import {
  buildRecentActivity,
  compareBoardEvents,
  crossEditToActivity,
  FALLBACK_ACTIVITY_SUMMARY,
  presentBoardEvent,
  RECENT_ACTIVITY_LIMIT,
  type BoardActivityLookup,
  type BoardEventRow,
  type BoardEventType,
} from "./board-activity";

// #109 U2 (109-010..014). The expectation table is keyed by the database
// enum itself, so a new `board_event_type` value fails typecheck here until
// it has a representative payload and copy -- "every supported event".
const lookup: BoardActivityLookup = {
  actorName: (id) => ({ mgr: "Maya" })[id as "mgr"],
  memberName: (id) => ({ 1: "Mia", 2: "Leo", 3: "Chris" })[id as 1 | 2 | 3],
  roundSequence: (id) => ({ 10: 1, 11: 2 })[id as 10 | 11],
};

function row(
  type: string,
  payload: unknown,
  extra: Partial<BoardEventRow> = {},
): BoardEventRow {
  return {
    id: 1,
    event_type: type,
    actor_profile_id: "mgr",
    payload,
    created_at: "2026-10-25T18:00:00.000Z",
    undone_at: null,
    ...extra,
  };
}

const EXPECTED: Record<BoardEventType, [unknown, string]> = {
  assign: [
    { round_id: 10, member_id: 1, table_label: "12", displaced: [] },
    "assigned Table 12 to Mia",
  ],
  add_column: [{ member_id: 2 }, "added Leo to the rotation"],
  pause_column: [{ member_id: 1, status: "paused" }, "paused Mia"],
  resume_column: [{ member_id: 1, status: "active" }, "resumed Mia"],
  remove_column: [
    { member_id: 2, status: "removed" },
    "removed Leo from the rotation",
  ],
  clear_row: [{ round_id: 11 }, "cleared turn 2"],
  clear_column: [{ member_id: 1 }, "cleared Mia's column"],
  clear_board: [{}, "cleared the board"],
  undo: [
    { undone_event_id: 5, original_event_type: "assign" },
    "undid a table assignment",
  ],
  redo: [
    { redone_event_id: 5, original_event_type: "transfer" },
    "redid a table transfer",
  ],
  move_column: [
    { a_member_id: 1, b_member_id: 2 },
    "reordered the rotation (Mia and Leo swapped)",
  ],
  add_row: [{ round_id: 12, sequence: 3 }, "added turn 3"],
  clear_cell: [
    { round_id: 10, member_id: 1 },
    "unassigned Mia's table for turn 1",
  ],
  delete_row: [{ round_id: 12, sequence: 3 }, "deleted turn 3"],
  transfer: [
    { source_member_id: 1, dest_member_id: 2, table_label: "21 + 22" },
    "transferred Table 21 + 22 from Mia to Leo",
  ],
  end: [{ round_id: 10, member_id: 1 }, "ended Mia's table for turn 1"],
  skip: [{ round_id: 11, member_id: 2 }, "skipped Leo's turn (turn 2)"],
  end_and_assign: [
    { end_round_ids: [10, 11], member_id: 2, table_label: "5" },
    "ended 2 table assignments and assigned Table 5 to Leo",
  ],
};

const JUNK = /undefined|null|\{|\}|_|\[object/;

describe("board event presenter", () => {
  it("109-010..013 covers every value of the database board_event_type enum", () => {
    const enumValues = [...Constants.public.Enums.board_event_type];
    expect(Object.keys(EXPECTED).sort()).toEqual([...enumValues].sort());
  });

  for (const type of Constants.public.Enums.board_event_type) {
    it(`renders ${type} with understandable copy`, () => {
      const [payload, copy] = EXPECTED[type];
      const entry = presentBoardEvent(row(type, payload), lookup);
      expect(entry.summary).toBe(copy);
      expect(entry.actorName).toBe("Maya");
      // Never leaks internals into user copy.
      expect(entry.summary).not.toMatch(JUNK);
      expect(entry.summary).not.toBe(FALLBACK_ACTIVITY_SUMMARY);
    });
  }

  it("109-011 an assign that displaced another assignment says so", () => {
    const entry = presentBoardEvent(
      row("assign", {
        member_id: 1,
        table_label: "4",
        displaced: [{ entry_id: 9 }],
      }),
      lookup,
    );
    expect(entry.summary).toBe(
      "assigned Table 4 to Mia, ending its previous assignment",
    );
  });

  it("166 a same-server repeat says the table was assigned again for that turn", () => {
    const entry = presentBoardEvent(
      row("assign", {
        member_id: 1,
        round_id: 10,
        table_label: "T2",
        displaced: [{ round_id: 9, member_id: 1 }],
        repeat: true,
      }),
      lookup,
    );
    expect(entry.summary).toMatch(
      /^assigned Table T2 to Mia again( for turn \d+)?, ending the previous assignment$/,
    );
    expect(entry.summary).not.toMatch(JUNK);
  });

  it("109-013 marks an event that was later undone, in text", () => {
    const entry = presentBoardEvent(
      row(
        "end",
        { round_id: 10, member_id: 1 },
        { undone_at: "2026-10-25T18:05:00Z" },
      ),
      lookup,
    );
    expect(entry.undone).toBe(true);
  });

  it("109-014 an unknown/future event type falls back safely, without payload JSON", () => {
    const entry = presentBoardEvent(
      row("teleport_table", { secret: "do-not-show", member_id: 1 }),
      lookup,
    );
    expect(entry.summary).toBe(FALLBACK_ACTIVITY_SUMMARY);
    expect(JSON.stringify(entry)).not.toContain("do-not-show");
    expect(JSON.stringify(entry)).not.toContain("teleport_table");
  });

  it("109-014 inherited property names are not mistaken for event types", () => {
    for (const type of ["constructor", "toString", "__proto__"]) {
      expect(presentBoardEvent(row(type, {}), lookup).summary).toBe(
        FALLBACK_ACTIVITY_SUMMARY,
      );
    }
  });

  it("109-014 malformed or missing payloads never throw and never print junk", () => {
    for (const payload of [null, undefined, "x", 7, [], { member_id: "1" }]) {
      for (const type of Constants.public.Enums.board_event_type) {
        const entry = presentBoardEvent(row(type, payload), lookup);
        expect(entry.summary).toBeTruthy();
        expect(entry.summary).not.toMatch(JUNK);
      }
    }
  });

  it("falls back to neutral names for an unknown actor or server", () => {
    const entry = presentBoardEvent(
      row("pause_column", { member_id: 999 }, { actor_profile_id: "ghost" }),
      lookup,
    );
    expect(entry.actorName).toBe("Someone");
    expect(entry.summary).toBe("paused a server");
  });

  it("uses a clean possessive for names ending in s", () => {
    expect(
      presentBoardEvent(row("clear_column", { member_id: 3 }), lookup).summary,
    ).toBe("cleared Chris' column");
  });
});

describe("recent activity ordering and limit", () => {
  it("109-004 orders newest first by time, then by event id, regardless of input order", () => {
    const t = "2026-10-25T18:00:00.000Z";
    const rows = [
      row("clear_board", {}, { id: 2, created_at: t }),
      row("add_row", { sequence: 1 }, { id: 3, created_at: t }),
      row(
        "skip",
        { round_id: 10, member_id: 1 },
        { id: 1, created_at: "2026-10-25T17:59:00.000Z" },
      ),
    ];
    const ids = (input: BoardEventRow[]) =>
      buildRecentActivity(input, lookup).map((e) => e.id);
    expect(ids(rows)).toEqual(["3", "2", "1"]);
    expect(ids([...rows].reverse())).toEqual(["3", "2", "1"]);
  });

  it("compares equal timestamps by id and tolerates an unparsable timestamp", () => {
    expect(
      compareBoardEvents(
        { id: 1, created_at: "2026-10-25T18:00:00Z" },
        { id: 2, created_at: "2026-10-25T18:00:00Z" },
      ),
    ).toBeLessThan(0);
    expect(
      compareBoardEvents(
        { id: 1, created_at: "not-a-date" },
        { id: 2, created_at: "2026-10-25T18:00:00Z" },
      ),
    ).toBeLessThan(0);
  });

  it("caps the list to the most recent events", () => {
    const rows = Array.from({ length: RECENT_ACTIVITY_LIMIT + 5 }, (_, i) =>
      row(
        "clear_board",
        {},
        {
          id: i + 1,
          created_at: `2026-10-25T18:${String(i).padStart(2, "0")}:00Z`,
        },
      ),
    );
    const out = buildRecentActivity(rows, lookup);
    expect(out).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(out[0].id).toBe(String(RECENT_ACTIVITY_LIMIT + 5));
  });

  it("109-010 demo mode: cross-column edits use the same entry shape, newest first", () => {
    const out = crossEditToActivity([
      { at: "2026-10-25T18:00:00Z", actorName: "Maya", columnName: "Mia" },
      { at: "2026-10-25T18:01:00Z", actorName: "Maya", columnName: "Leo" },
    ]);
    expect(out.map((e) => e.summary)).toEqual([
      "edited Leo's column",
      "edited Mia's column",
    ]);
    expect(new Set(out.map((e) => e.id)).size).toBe(2);
  });
});
