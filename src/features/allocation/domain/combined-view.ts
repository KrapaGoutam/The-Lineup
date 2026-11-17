import type { OffMapTable } from "@/features/allocation/domain/board-read-model";
import {
  parseCombinedTableLabel,
  type FloorResourceType,
  type ResolvedFloorTable,
} from "@/features/allocation/domain/floor-layout";
import {
  findEarliestEmptyRoundForColumn,
  type RotationBoard,
  type RotationCellStatus,
  type RotationColumn,
} from "@/features/allocation/domain/rotation-board";

/**
 * V2.0.4 -- pure read helpers for the Combined View. Nothing here decides who
 * is next or writes anything: every helper is a projection of the same
 * `RotationBoard` / `BoardReadModel` the other five views render.
 */

export type CombinedMode = "split" | "floor" | "rotation";
export const COMBINED_MODES: readonly CombinedMode[] = [
  "split",
  "floor",
  "rotation",
];
export const DEFAULT_COMBINED_MODE: CombinedMode = "split";

export function parseCombinedMode(value: unknown): CombinedMode | null {
  return typeof value === "string" &&
    (COMBINED_MODES as readonly string[]).includes(value)
    ? (value as CombinedMode)
    : null;
}

/* ------------------------------------------------------------------ */
/* Rotation history                                                      */
/* ------------------------------------------------------------------ */

export type HistoryCell = {
  status: RotationCellStatus;
  label: string | null;
  transferredIn: boolean;
};

export type HistoryRow = {
  roundId: string;
  /** The turn number shown to the host -- the round's own sequence. */
  sequence: number;
  cells: Map<string, HistoryCell>;
};

/**
 * Recorded turns, NEWEST FIRST. A row is a real board round that holds at
 * least one recorded entry (active, ended or skipped); the empty buffer rounds
 * at the tail are what the NEXT row stands for. Rows and cells are keyed by
 * the round's id / sequence and the column id -- never by array position, so
 * two servers' unrelated events are never aligned by index.
 */
export function buildHistoryRows(
  board: RotationBoard,
  columns: RotationColumn[],
): HistoryRow[] {
  const visible = new Set(columns.map(({ id }) => id));
  const rows: HistoryRow[] = [];
  for (const round of board.rounds) {
    const cells = new Map<string, HistoryCell>();
    let recorded = false;
    for (const cell of round.cells) {
      if (!visible.has(cell.columnId)) continue;
      if (cell.status === "empty") continue;
      recorded = true;
      cells.set(cell.columnId, {
        status: cell.status,
        label: cell.tableLabel,
        transferredIn: cell.transferredIn === true,
      });
    }
    if (recorded) {
      rows.push({ roundId: round.id, sequence: round.sequence, cells });
    }
  }
  return rows.sort((a, b) => b.sequence - a.sequence);
}

/* ------------------------------------------------------------------ */
/* Active service records                                                */
/* ------------------------------------------------------------------ */

export type ActiveRecord = {
  roundId: string;
  columnId: string;
  serverName: string;
  sequence: number;
  /** The whole assignment as recorded ("T6 + T7"). */
  label: string;
  tables: string[];
};

/** Active entries only (never ended / skipped / cleared), newest turn first. */
export function buildActiveRecords(
  board: RotationBoard,
  columns: RotationColumn[],
): ActiveRecord[] {
  const nameById = new Map(columns.map(({ id, name }) => [id, name]));
  const records: ActiveRecord[] = [];
  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (cell.status !== "active" || !cell.tableLabel) continue;
      const serverName = nameById.get(cell.columnId);
      if (serverName === undefined) continue;
      records.push({
        roundId: round.id,
        columnId: cell.columnId,
        serverName,
        sequence: round.sequence,
        label: cell.tableLabel,
        tables: parseCombinedTableLabel(cell.tableLabel),
      });
    }
  }
  return records.sort((a, b) => b.sequence - a.sequence);
}

/* ------------------------------------------------------------------ */
/* Selection                                                             */
/* ------------------------------------------------------------------ */

export type CombinedSelection =
  | { type: "table"; label: string }
  | { type: "entry"; roundId: string; columnId: string };

export type ResolvedTarget =
  | { kind: "none" }
  | { kind: "free-table"; label: string }
  | {
      kind: "active";
      label: string;
      tables: string[];
      roundId: string;
      columnId: string;
      serverName: string;
    }
  | {
      kind: "history";
      status: "ended" | "skipped";
      label: string | null;
      roundId: string;
      columnId: string;
      serverName: string;
      sequence: number;
    }
  | {
      kind: "open-cell";
      roundId: string;
      columnId: string;
      serverName: string;
      sequence: number;
    };

/**
 * Re-resolve a selection against the LIVE board each render so a selection
 * that went stale (another device ended or moved it) degrades to the true
 * current state instead of acting on what the host last saw.
 */
export function resolveTarget(input: {
  board: RotationBoard;
  columns: RotationColumn[];
  tables: Pick<ResolvedFloorTable, "label" | "occupiedBy">[];
  offMapTables: Pick<OffMapTable, "label" | "occupiedBy">[];
  selection: CombinedSelection | null;
}): ResolvedTarget {
  const { board, columns, tables, offMapTables, selection } = input;
  if (!selection) return { kind: "none" };
  const nameOf = (columnId: string) =>
    columns.find(({ id }) => id === columnId)?.name ?? "Unknown";

  if (selection.type === "table") {
    const known =
      tables.find(({ label }) => label === selection.label) ??
      offMapTables.find(({ label }) => label === selection.label);
    if (!known) return { kind: "none" };
    const occupant = known.occupiedBy;
    if (!occupant) return { kind: "free-table", label: selection.label };
    return {
      kind: "active",
      label: selection.label,
      tables: occupant.assignmentTables,
      roundId: occupant.roundId,
      columnId: occupant.columnId,
      serverName: occupant.name,
    };
  }

  const round = board.rounds.find(({ id }) => id === selection.roundId);
  if (!round || !columns.some(({ id }) => id === selection.columnId)) {
    return { kind: "none" };
  }
  const cell = round.cells.find(
    ({ columnId }) => columnId === selection.columnId,
  );
  const status = cell?.status ?? "empty";
  const serverName = nameOf(selection.columnId);
  if (status === "active" && cell?.tableLabel) {
    return {
      kind: "active",
      label: cell.tableLabel,
      tables: parseCombinedTableLabel(cell.tableLabel),
      roundId: round.id,
      columnId: selection.columnId,
      serverName,
    };
  }
  if (status === "ended" || status === "skipped") {
    return {
      kind: "history",
      status,
      label: cell?.tableLabel ?? null,
      roundId: round.id,
      columnId: selection.columnId,
      serverName,
      sequence: round.sequence,
    };
  }
  return {
    kind: "open-cell",
    roundId: round.id,
    columnId: selection.columnId,
    serverName,
    sequence: round.sequence,
  };
}

/** The round a "+ Table" / Skip for this server lands in (their own earliest empty one). */
export function targetRoundFor(
  board: RotationBoard,
  columnId: string,
): string | null {
  return findEarliestEmptyRoundForColumn(board, columnId)?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Picker tiles                                                          */
/* ------------------------------------------------------------------ */

export type PickerTile = {
  label: string;
  resourceType: FloorResourceType;
  occupiedBy: { columnId: string; name: string } | null;
  offMap: boolean;
};

/**
 * Every relevant table (mapped first in label order, then off-map) as one flat
 * list for the Quick Grid. Built from the same resolved tables the Floor Plan
 * draws, so the two picker modes can never disagree about availability.
 */
export function buildPickerTiles(
  tables: ResolvedFloorTable[],
  offMapTables: OffMapTable[],
): PickerTile[] {
  const byLabel = (a: PickerTile, b: PickerTile) =>
    a.label.localeCompare(b.label, undefined, { numeric: true });
  const mapped: PickerTile[] = tables
    .map((table) => ({
      label: table.label,
      resourceType: table.resourceType,
      occupiedBy: table.occupiedBy
        ? { columnId: table.occupiedBy.columnId, name: table.occupiedBy.name }
        : null,
      offMap: false,
    }))
    .sort(byLabel);
  const off: PickerTile[] = offMapTables
    .map((table) => ({
      label: table.label,
      resourceType: table.resourceType,
      occupiedBy: table.occupiedBy
        ? { columnId: table.occupiedBy.columnId, name: table.occupiedBy.name }
        : null,
      offMap: true,
    }))
    .sort(byLabel);
  return [...mapped, ...off];
}

/* ------------------------------------------------------------------ */
/* Floor fit                                                             */
/* ------------------------------------------------------------------ */

/**
 * Visual fit only: scale the tables about their own centre so a sparse floor
 * fills the available box. Saved coordinates are never modified (this returns
 * a display copy), relative positions are preserved (one uniform factor for
 * both axes), and the factor is bounded so a layout that already fills the
 * map is left essentially as drawn.
 */
export function fitFloorTables<T extends { x: number; y: number }>(
  tables: T[],
  options: { padding?: number; minScale?: number; maxScale?: number } = {},
): T[] {
  const { padding = 8, minScale = 0.9, maxScale = 1.6 } = options;
  if (tables.length === 0) return tables;
  const xs = tables.map(({ x }) => x);
  const ys = tables.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const room = 100 - 2 * padding;
  const wanted = Math.min(
    spanX > 0 ? room / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? room / spanY : Number.POSITIVE_INFINITY,
  );
  const scale = Number.isFinite(wanted)
    ? Math.min(maxScale, Math.max(minScale, wanted))
    : 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const clamp = (value: number) => Math.min(100 - 2, Math.max(2, value));
  return tables.map((table) => ({
    ...table,
    x: clamp(50 + (table.x - cx) * scale),
    y: clamp(50 + (table.y - cy) * scale),
  }));
}
