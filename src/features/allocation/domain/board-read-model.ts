import {
  parseCombinedTableLabel,
  resolveFloorTables,
  type FloorLayoutEntry,
  type ResolvedFloorTable,
} from "@/features/allocation/domain/floor-layout";
import {
  getActiveTablesForColumn,
  getNextColumn,
  type RotationBoard,
  type RotationColumn,
} from "@/features/allocation/domain/rotation-board";

/**
 * Table Rotation V2 Part 1 / Phase 1C -- the ONE board read model.
 *
 * Grid, Floor, Picker, Servers and Dashboard are projections and command
 * surfaces over a single piece of truth: the board's entries (logical
 * lifecycle, kept as history) over the location's one `dining_tables`
 * registry (physical identity). Nothing here owns a table; nothing is
 * re-derived per view. Every count, label and "who holds this table"
 * answer the five views show comes from `buildBoardReadModel`:
 *
 *   - `tables`   physical state, one row per registered table (Floor, Picker)
 *   - `servers`  per-server active tables + rotation order (Servers, Dashboard)
 *   - `stats`    the dashboard numbers (computed from the same data)
 *   - `nextColumnId`  whose turn it is
 *
 * The database enforces the same rules authoritatively (one active claim
 * per table per session, in `section_assignments`); `findClaimDivergences`
 * compares that ledger with this derivation at read time so a disagreement
 * is surfaced instead of silently choosing a side.
 */

/** One active row of `public.section_assignments` -- a current physical claim. */
export type PhysicalClaim = {
  diningTableId: number;
  label: string;
  /** Profile id of the claiming server (a RotationColumn id), if known. */
  serverProfileId: string | null;
  rotationMemberId: number | null;
  entryId: number | null;
};

export type ClaimDivergence =
  | {
      kind: "claim-without-assignment";
      label: string;
      claimOwner: string | null;
    }
  | { kind: "assignment-without-claim"; label: string; boardOwner: string }
  | {
      kind: "owner-mismatch";
      label: string;
      boardOwner: string;
      claimOwner: string | null;
    };

export type ServerSummary = {
  columnId: string;
  name: string;
  status: RotationColumn["status"];
  /** 1-based position among visible columns (rotation order). */
  order: number;
  /** One entry per active assignment (a combined "5+6" is one assignment). */
  activeAssignments: { roundId: string; label: string }[];
  /** Physical tables held, each combined part counted. */
  activeTableLabels: string[];
  isNext: boolean;
};

export type BoardStats = {
  /** Servers currently on the rotation (status "active"). */
  activeServers: number;
  /** Physical tables currently owned by someone (every held label). */
  occupiedTables: number;
  /** Registered tables on the map that nobody owns. */
  availableTables: number;
  /** Held labels that are not on the floor map (unknown / unpositioned). */
  unmappedActiveLabels: string[];
};

export type BoardReadModel = {
  tables: ResolvedFloorTable[];
  servers: ServerSummary[];
  nextColumnId: string | null;
  stats: BoardStats;
};

export function buildBoardReadModel(input: {
  board: RotationBoard;
  layout: FloorLayoutEntry[];
  team: { id: string; name: string; color: string }[];
}): BoardReadModel {
  const { board, layout, team } = input;
  const tables = resolveFloorTables(layout, board, team);
  const next = getNextColumn(board);

  const visible = board.columns
    .filter((column) => column.status !== "removed")
    .sort((a, b) => a.position - b.position);

  const servers: ServerSummary[] = visible.map((column, index) => {
    const activeAssignments = getActiveTablesForColumn(board, column.id).map(
      ({ roundId, tableLabel }) => ({ roundId, label: tableLabel }),
    );
    return {
      columnId: column.id,
      name: column.name,
      status: column.status,
      order: index + 1,
      activeAssignments,
      activeTableLabels: activeAssignments.flatMap(({ label }) =>
        parseCombinedTableLabel(label),
      ),
      isNext: column.id === next?.id,
    };
  });

  // Every label an ACTIVE cell holds, whether or not it is on the map: the
  // dashboard must count a held table even when its row has no position yet.
  const heldLabels = new Set(servers.flatMap((s) => s.activeTableLabels));
  const mapLabels = new Set(layout.map(({ label }) => label));

  return {
    tables,
    servers,
    nextColumnId: next?.id ?? null,
    stats: {
      activeServers: visible.filter(({ status }) => status === "active").length,
      occupiedTables: heldLabels.size,
      availableTables: tables.filter((table) => !table.occupiedBy).length,
      unmappedActiveLabels: [...heldLabels].filter(
        (label) => !mapLabels.has(label),
      ),
    },
  };
}

/**
 * Compare the authoritative physical ledger (`section_assignments`, active
 * rows) with the occupancy the board entries imply. Only labels that
 * resolve to a registered table can ever have a claim, so board-side
 * occupancy of an unregistered label is not a divergence. An empty result
 * means the two agree. Run on a freshly loaded snapshot (board and claims
 * read together) -- never on optimistic client state, which is
 * legitimately ahead of the ledger for a moment.
 */
export function findClaimDivergences(input: {
  board: RotationBoard;
  /** Labels of every registered, active table at the location. */
  registeredLabels: string[];
  claims: PhysicalClaim[];
}): ClaimDivergence[] {
  const { board, registeredLabels, claims } = input;
  const registered = new Set(registeredLabels);

  const boardOwner = new Map<string, string>();
  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (cell.status !== "active" || !cell.tableLabel) continue;
      for (const part of parseCombinedTableLabel(cell.tableLabel)) {
        if (registered.has(part)) boardOwner.set(part, cell.columnId);
      }
    }
  }

  const claimByLabel = new Map(claims.map((claim) => [claim.label, claim]));
  const out: ClaimDivergence[] = [];

  for (const claim of claims) {
    const owner = boardOwner.get(claim.label);
    if (!owner) {
      out.push({
        kind: "claim-without-assignment",
        label: claim.label,
        claimOwner: claim.serverProfileId,
      });
    } else if (claim.serverProfileId !== owner) {
      out.push({
        kind: "owner-mismatch",
        label: claim.label,
        boardOwner: owner,
        claimOwner: claim.serverProfileId,
      });
    }
  }
  for (const [label, owner] of boardOwner) {
    if (!claimByLabel.has(label)) {
      out.push({ kind: "assignment-without-claim", label, boardOwner: owner });
    }
  }
  return out;
}
