import {
  parseCombinedTableLabel,
  type RegistryTable,
} from "@/features/allocation/domain/floor-layout";
import {
  getNextColumn,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";

/**
 * V2.0.4 -- the ONE source of the Combined View's metric strip and the
 * Dashboard's "Dine-in Today" card. Pure, derived from the same board the
 * Grid renders; nothing here writes or caches.
 *
 * "Dine-in Today" is a count of dine-in TABLE SEATING CYCLES in the selected
 * business day's service session (the session already encodes the location's
 * time zone and cutoff -- the board for a `serviceDate` only holds that
 * day's rounds). It is NOT a guest count.
 *
 *  - Every `active` or `ended` entry is one seating of each physical table in
 *    its label (a combined "T1 + T2" is two tables, matching how every other
 *    view counts tables). Seat, complete, seat again = two cycles (two
 *    entries).
 *  - A Transfer is the SAME seating continuing with another server. Its
 *    destination entry carries `transferredIn` and is not counted again; the
 *    source entry (ended by the transfer) is the one counted.
 *  - Skipped turns and empty cells have no table and never count. A cleared
 *    entry no longer exists. Duplicate events cannot inflate the count
 *    because counting is over entries (one row per server per turn), not
 *    events.
 *  - Class comes from the registry (`resourceType`), never from a "T"/"B"
 *    prefix: `bar_seat` tables are excluded. A label that is not in the
 *    registry (a free-text off-map table) is treated as dine-in.
 *
 * Known limit: if the SOURCE entry of a transfer is later cleared as a
 * correction, the continuing seating is counted from its destination entry
 * (see `hasEndedSource`), which is the intended outcome; the pathological
 * case of an unrelated ended entry with the identical label masking that is
 * not modelled.
 */
export type DineInMetrics = {
  /** Dine-in seating cycles recorded in this service day. */
  dineInToday: number;
  /** Physical dine-in tables occupied right now. */
  active: number;
  /** Dine-in seating cycles that have been completed (ended and not live). */
  completed: number;
  /** Rotation servers that are active (not paused / removed). */
  eligibleServers: number;
  /** The canonical next server's column id, or null (no active server). */
  nextColumnId: string | null;
};

type Classifiable = Pick<RegistryTable, "label" | "resourceType">;

/** Parts of a label that are dine-in tables (registry-classified). */
export function dineInParts(
  label: string | null,
  registry: Classifiable[],
): string[] {
  if (!label) return [];
  const bar = new Set(
    registry
      .filter(({ resourceType }) => resourceType === "bar_seat")
      .map(({ label: tableLabel }) => tableLabel),
  );
  return parseCombinedTableLabel(label).filter((part) => !bar.has(part));
}

export function computeDineInMetrics(input: {
  board: RotationBoard;
  registry: Classifiable[];
}): DineInMetrics {
  const { board, registry } = input;

  // Labels of ended entries, to recognise an orphaned transfer continuation.
  const endedLabelCount = new Map<string, number>();
  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (cell.status === "ended" && cell.tableLabel) {
        endedLabelCount.set(
          cell.tableLabel,
          (endedLabelCount.get(cell.tableLabel) ?? 0) + 1,
        );
      }
    }
  }
  const hasEndedSource = (label: string) =>
    (endedLabelCount.get(label) ?? 0) > 0;

  let seatings = 0;
  const activeTables = new Set<string>();
  let activeSeatings = 0;

  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (cell.status !== "active" && cell.status !== "ended") continue;
      const parts = dineInParts(cell.tableLabel, registry);
      if (parts.length === 0) continue;
      const continuation =
        cell.transferredIn === true && hasEndedSource(cell.tableLabel ?? "");
      if (!continuation) seatings += parts.length;
      if (cell.status === "active") {
        activeSeatings += parts.length;
        for (const part of parts) activeTables.add(part);
      }
    }
  }

  const next = getNextColumn(board);
  return {
    dineInToday: seatings,
    active: activeTables.size,
    completed: Math.max(0, seatings - activeSeatings),
    eligibleServers: board.columns.filter(({ status }) => status === "active")
      .length,
    nextColumnId: next?.id ?? null,
  };
}
