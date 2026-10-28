/**
 * #109 U2 (FRONT-008) -- Recent activity from the complete board event model.
 *
 * ONE presenter turns a `board_events` row into restaurant-friendly copy.
 * The Dashboard's "Recent activity" renders from it; no view keeps its own
 * switch over event types.
 *
 * It covers every value of the database `board_event_type` enum. The enum is
 * typed `Record<BoardEventType, ...>` below, so adding an enum value in a
 * future migration (and regenerating `database.generated.ts`) fails the
 * typecheck here until the new event has copy. An event type that reaches the
 * client without a presenter anyway (older client, newer database) renders the
 * safe fallback and never throws. Raw payload JSON is never shown: only
 * specific, named, typed fields are read out of it.
 */

import type { Database } from "@/types/database.generated";

export type BoardEventType = Database["public"]["Enums"]["board_event_type"];

/** The columns `getAllocationContext` reads from `board_events`. */
export type BoardEventRow = {
  id: number;
  event_type: string;
  actor_profile_id: string;
  payload: unknown;
  created_at: string;
  undone_at: string | null;
};

/** What a presenter may ask the surrounding board about. All best-effort. */
export type BoardActivityLookup = {
  actorName: (profileId: string) => string | undefined;
  /** Display name of the server owning a `rotation_members.id`. */
  memberName: (memberId: number) => string | undefined;
  /** 1-based turn number of a `rotation_rounds.id`. */
  roundSequence: (roundId: number) => number | undefined;
};

export type BoardActivityEntry = {
  /** Stable React key: the event id (or a synthetic id for demo entries). */
  id: string;
  at: string;
  actorName: string;
  /** Sentence fragment that follows the actor's name. */
  summary: string;
  /** The event was later reversed by Undo; shown as text, not just styling. */
  undone: boolean;
};

export const RECENT_ACTIVITY_LIMIT = 8;
export const FALLBACK_ACTIVITY_SUMMARY = "updated the board";

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : {};
}

function num(payload: Payload, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function text(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type Describe = (payload: Payload, lookup: BoardActivityLookup) => string;

function server(
  payload: Payload,
  key: string,
  lookup: BoardActivityLookup,
): string {
  const id = num(payload, key);
  return (id !== undefined ? lookup.memberName(id) : undefined) ?? "a server";
}

function turn(
  payload: Payload,
  key: string,
  lookup: BoardActivityLookup,
): string | null {
  const id = num(payload, key);
  const sequence = id !== undefined ? lookup.roundSequence(id) : undefined;
  return sequence !== undefined ? `turn ${sequence}` : null;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function tableOrTables(label: string | undefined): string {
  return label ? `Table ${label}` : "a table";
}

/** What an Undo/Redo says it reversed, in plain words (never an enum value). */
const EVENT_NOUN: Record<BoardEventType, string> = {
  assign: "table assignment",
  add_column: "server addition",
  pause_column: "server pause",
  resume_column: "server resume",
  remove_column: "server removal",
  clear_row: "turn clear",
  clear_column: "server column clear",
  clear_board: "board clear",
  undo: "undo",
  redo: "redo",
  move_column: "rotation reorder",
  add_row: "new turn",
  clear_cell: "table unassignment",
  delete_row: "turn deletion",
  transfer: "table transfer",
  end: "ended table",
  skip: "skipped turn",
  end_and_assign: "end-and-assign",
};

function noun(type: unknown): string {
  return typeof type === "string" && type in EVENT_NOUN
    ? EVENT_NOUN[type as BoardEventType]
    : "change";
}

const DESCRIBE: Record<BoardEventType, Describe> = {
  assign: (p, l) => {
    const displaced = Array.isArray(p.displaced) && p.displaced.length > 0;
    // Same-server repeat (#166): the server's own earlier assignment of this
    // table was ended as this turn's assignment began.
    if (p.repeat === true && displaced) {
      const when = turn(p, "round_id", l);
      return `assigned ${tableOrTables(text(p, "table_label"))} to ${server(p, "member_id", l)} again${
        when ? ` for ${when}` : ""
      }, ending the previous assignment`;
    }
    return `assigned ${tableOrTables(text(p, "table_label"))} to ${server(p, "member_id", l)}${
      displaced ? ", ending its previous assignment" : ""
    }`;
  },
  add_column: (p, l) => `added ${server(p, "member_id", l)} to the rotation`,
  pause_column: (p, l) => `paused ${server(p, "member_id", l)}`,
  resume_column: (p, l) => `resumed ${server(p, "member_id", l)}`,
  remove_column: (p, l) =>
    `removed ${server(p, "member_id", l)} from the rotation`,
  clear_row: (p, l) => `cleared ${turn(p, "round_id", l) ?? "a turn"}`,
  clear_column: (p, l) =>
    `cleared ${possessive(server(p, "member_id", l))} column`,
  clear_board: () => "cleared the board",
  undo: (p) => `undid a ${noun(p.original_event_type)}`,
  redo: (p) => `redid a ${noun(p.original_event_type)}`,
  move_column: (p, l) =>
    `reordered the rotation (${server(p, "a_member_id", l)} and ${server(p, "b_member_id", l)} swapped)`,
  add_row: (p) => {
    const sequence = num(p, "sequence");
    return sequence !== undefined ? `added turn ${sequence}` : "added a turn";
  },
  clear_cell: (p, l) => {
    const where = turn(p, "round_id", l);
    return `unassigned ${possessive(server(p, "member_id", l))} table${
      where ? ` for ${where}` : ""
    }`;
  },
  delete_row: (p) => {
    const sequence = num(p, "sequence");
    return sequence !== undefined
      ? `deleted turn ${sequence}`
      : "deleted a turn";
  },
  transfer: (p, l) =>
    `transferred ${tableOrTables(text(p, "table_label"))} from ${server(p, "source_member_id", l)} to ${server(p, "dest_member_id", l)}`,
  end: (p, l) => {
    const where = turn(p, "round_id", l);
    return `ended ${possessive(server(p, "member_id", l))} table${
      where ? ` for ${where}` : ""
    }`;
  },
  skip: (p, l) => {
    const where = turn(p, "round_id", l);
    return `skipped ${possessive(server(p, "member_id", l))} turn${
      where ? ` (${where})` : ""
    }`;
  },
  end_and_assign: (p, l) => {
    const ended = Array.isArray(p.end_round_ids) ? p.end_round_ids.length : 0;
    const assigned = `assigned ${tableOrTables(text(p, "table_label"))} to ${server(p, "member_id", l)}`;
    return ended > 0
      ? `ended ${ended} table assignment${ended === 1 ? "" : "s"} and ${assigned}`
      : assigned;
  },
};

function isKnownType(type: string): type is BoardEventType {
  return Object.prototype.hasOwnProperty.call(DESCRIBE, type);
}

/** One event -> one activity entry. Never throws, whatever the row holds. */
export function presentBoardEvent(
  row: BoardEventRow,
  lookup: BoardActivityLookup,
): BoardActivityEntry {
  let summary = FALLBACK_ACTIVITY_SUMMARY;
  if (isKnownType(row.event_type)) {
    try {
      summary = DESCRIBE[row.event_type](asPayload(row.payload), lookup);
    } catch {
      summary = FALLBACK_ACTIVITY_SUMMARY;
    }
  }
  return {
    id: String(row.id),
    at: row.created_at,
    actorName: lookup.actorName(row.actor_profile_id) ?? "Someone",
    summary,
    undone: row.undone_at !== null,
  };
}

/**
 * Deterministic chronological order: `created_at`, then the database's own
 * monotonically increasing event id as the tiebreaker (two events written in
 * the same instant keep their write order). Never client insertion order.
 */
export function compareBoardEvents(
  a: Pick<BoardEventRow, "id" | "created_at">,
  b: Pick<BoardEventRow, "id" | "created_at">,
): number {
  const byTime = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return a.id - b.id;
}

/** Newest first, capped. Input order is irrelevant. */
export function buildRecentActivity(
  rows: BoardEventRow[],
  lookup: BoardActivityLookup,
  limit = RECENT_ACTIVITY_LIMIT,
): BoardActivityEntry[] {
  return [...rows]
    .sort((a, b) => compareBoardEvents(b, a))
    .slice(0, limit)
    .map((row) => presentBoardEvent(row, lookup));
}

/**
 * Demo mode has no `board_events` table; its only recorded activity is the
 * cross-column edit log. Same entry shape so the Dashboard renders one list.
 */
export function crossEditToActivity(
  entries: { at: string; actorName: string; columnName: string }[],
  limit = RECENT_ACTIVITY_LIMIT,
): BoardActivityEntry[] {
  return entries
    .map((entry, index) => ({
      id: `demo-${index}`,
      at: entry.at,
      actorName: entry.actorName,
      summary: `edited ${possessive(entry.columnName)} column`,
      undone: false,
    }))
    .reverse()
    .slice(0, limit);
}
