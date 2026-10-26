/**
 * The canonical physical floor layout for demo mode and as the reference
 * shape a real organization's own `dining_tables` rows are expected to
 * roughly follow (their real `position_x`/`position_y` are authoritative
 * in real mode -- this file only matters there as documentation of the
 * approved arrangement). Coordinates are percentages of the map's own
 * bounding box (0-100), not pixels -- see
 * docs/design/table-rotation/reference/floor-layout-reference.png for the
 * physical reference this was digitized from.
 *
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 16.
 */
export type FloorResourceType = "table" | "bar_seat";

export type FloorLayoutEntry = {
  /**
   * The canonical `dining_tables.id` of this physical table. Present in real
   * mode (every view resolves a table through this one registry); demo mode's
   * static layout has no database row, so it is absent there.
   */
  diningTableId?: number;
  label: string;
  x: number;
  y: number;
  resourceType: FloorResourceType;
};

/**
 * One active row of the location's `dining_tables` registry, whether or not
 * it has a position on the floor map. `x`/`y` are null for an unpositioned
 * ("off-map") table: it is still a real physical table (it has an id, the
 * ledger can hold a claim on it), it just has nowhere to draw. Demo mode's
 * static layout has no database rows, so `diningTableId` is absent there.
 */
export type RegistryTable = {
  diningTableId?: number;
  label: string;
  x: number | null;
  y: number | null;
  resourceType: FloorResourceType;
};

export const DEMO_FLOOR_LAYOUT: FloorLayoutEntry[] = [
  // TOP: T15 T16 T17 T18 T19
  { label: "T15", x: 22, y: 10, resourceType: "table" },
  { label: "T16", x: 38, y: 10, resourceType: "table" },
  { label: "T17", x: 54, y: 10, resourceType: "table" },
  { label: "T18", x: 70, y: 10, resourceType: "table" },
  { label: "T19", x: 86, y: 10, resourceType: "table" },
  // MIDDLE: T14 T13 T12 T11 T10 T9 (left to right, as listed)
  { label: "T14", x: 20, y: 34, resourceType: "table" },
  { label: "T13", x: 34, y: 34, resourceType: "table" },
  { label: "T12", x: 48, y: 34, resourceType: "table" },
  { label: "T11", x: 62, y: 34, resourceType: "table" },
  { label: "T10", x: 76, y: 34, resourceType: "table" },
  { label: "T9", x: 90, y: 34, resourceType: "table" },
  // LOWER CENTER: T6 T7 T8
  { label: "T6", x: 40, y: 56, resourceType: "table" },
  { label: "T7", x: 55, y: 56, resourceType: "table" },
  { label: "T8", x: 70, y: 56, resourceType: "table" },
  // LEFT WALL: T5 / T4 / T3 / T2 / T1, top to bottom
  { label: "T5", x: 8, y: 16, resourceType: "table" },
  { label: "T4", x: 8, y: 30, resourceType: "table" },
  { label: "T3", x: 8, y: 44, resourceType: "table" },
  { label: "T2", x: 8, y: 58, resourceType: "table" },
  { label: "T1", x: 8, y: 72, resourceType: "table" },
  // BAR: B1-B8
  { label: "B1", x: 8, y: 90, resourceType: "bar_seat" },
  { label: "B2", x: 19, y: 90, resourceType: "bar_seat" },
  { label: "B3", x: 30, y: 90, resourceType: "bar_seat" },
  { label: "B4", x: 41, y: 90, resourceType: "bar_seat" },
  { label: "B5", x: 52, y: 90, resourceType: "bar_seat" },
  { label: "B6", x: 63, y: 90, resourceType: "bar_seat" },
  { label: "B7", x: 74, y: 90, resourceType: "bar_seat" },
  { label: "B8", x: 85, y: 90, resourceType: "bar_seat" },
];

/**
 * Combined-table syntax parsing, shared between the client (Floor/Picker
 * selection -> label string) and documented for parity with the
 * server-side trigger that does the equivalent resolution
 * (private.sync_table_occupancy in
 * supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql).
 * Existing production syntax (docs/features/003-table-allocation.md):
 * "12 + 13", not a new one.
 */
export function combinedTableLabel(labels: string[]): string {
  return labels.join(" + ");
}

export function parseCombinedTableLabel(label: string): string[] {
  return label
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Floor ownership visual follow-up: two-letter initials derived from a
 * server's existing display name -- no separate manual initials field.
 * "Mia Chen" -> "MC" (first + last), a single-word name -> its own
 * first two letters ("Mia" -> "MI"). Shared by TableMap (assigned-table
 * tiles) and Floor's server legend so both read from the same rule.
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type FloorOccupant = {
  columnId: string;
  name: string;
  color: string;
  // The round the occupying entry actually lives in -- callers that need
  // to unassign/transfer it (clear-cell, re-assign) need this to target
  // the right cell, not just the table label.
  roundId: string;
  // #109 U3: every physical table in the SAME logical assignment as this one
  // ("T1 + T2" -> ["T1", "T2"]), this table included. Length > 1 means a
  // combined assignment: Transfer / End / Unassign act on all of them.
  assignmentTables: string[];
};

export type ResolvedFloorTable = FloorLayoutEntry & {
  occupiedBy: FloorOccupant | null;
};

/**
 * For each physical table label, the column whose *current* (already-clears-
 * applied) ACTIVE cell most recently recorded that label, scanning rounds in
 * sequence order so a later round's value wins over an earlier one for the
 * same label.
 *
 * Identity here is the label EXACTLY as the board stored it -- the registry
 * is unique per (location, label), so within one location an exact label is
 * one physical table. There is no trimming beyond the combined-label split,
 * no case folding and no "T"/"Table" prefix handling: `1` and `T1` are
 * different tables (or, for `1`, no registered table at all).
 *
 * This is a display convenience only. The actual double-booking guarantee is
 * enforced authoritatively, transactionally, at write time by the database
 * (private.sync_table_occupancy against public.section_assignments, and the
 * explicit conflict check in public.board_assign), independent of what this
 * function shows.
 *
 * Upgrade 1.1: only a cell whose status is "active" ever counts as
 * occupying a physical table. An "ended" cell keeps its tableLabel for
 * history but the table itself is available again; a "skipped" cell has
 * no tableLabel at all.
 */
export function resolveOccupancyByLabel(
  board: {
    rounds: {
      id: string;
      cells: {
        columnId: string;
        tableLabel: string | null;
        status?: "empty" | "active" | "ended" | "skipped";
      }[];
    }[];
  },
  team: { id: string; name: string; color: string }[],
): Map<string, FloorOccupant> {
  const memberById = new Map(team.map((member) => [member.id, member]));
  const out = new Map<string, FloorOccupant>();

  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (!cell.tableLabel) continue;
      // status is optional only for callers that predate Upgrade 1.1's
      // schema; treat a missing status as active (its only prior meaning).
      if (cell.status && cell.status !== "active") continue;
      const member = memberById.get(cell.columnId);
      if (!member) continue;
      const assignmentTables = parseCombinedTableLabel(cell.tableLabel);
      for (const part of assignmentTables) {
        out.set(part, {
          columnId: cell.columnId,
          roundId: round.id,
          assignmentTables,
          name: member.name,
          color: member.color,
        });
      }
    }
  }
  return out;
}

/**
 * Client-side occupancy derivation for the Floor/Picker map, shared by demo
 * and real mode. See `resolveOccupancyByLabel` for the identity and
 * ownership rules.
 */
export function resolveFloorTables(
  layout: FloorLayoutEntry[],
  board: Parameters<typeof resolveOccupancyByLabel>[0],
  team: { id: string; name: string; color: string }[],
): ResolvedFloorTable[] {
  const occupancy = resolveOccupancyByLabel(board, team);
  return layout.map((entry) => ({
    ...entry,
    occupiedBy: occupancy.get(entry.label) ?? null,
  }));
}
