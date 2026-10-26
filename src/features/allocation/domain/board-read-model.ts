import {
  parseCombinedTableLabel,
  resolveFloorTables,
  resolveOccupancyByLabel,
  type FloorLayoutEntry,
  type FloorOccupant,
  type FloorResourceType,
  type RegistryTable,
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

/**
 * The ONE answer to "which physical table is this label". Resolved exactly
 * (no trimming/case/prefix tricks) through the location's registry, so a
 * label is either a registered table (`diningTableId` set in real mode) or
 * an unregistered free-text board label (`registered: false`). `key` is the
 * stable identity occupancy and counts are keyed by: `id:<n>` when the
 * table has a database id, else `label:<text>`.
 */
export type TableIdentity = {
  key: string;
  label: string;
  diningTableId: number | null;
  registered: boolean;
  /** Has a position on the floor map. */
  mapped: boolean;
};

/**
 * A valid physical table (or free-text label) that has no coordinates on the
 * floor map: it is never drawn at made-up coordinates, but every view still
 * accounts for it. `occupiedBy` is null when it is available.
 */
export type OffMapTable = {
  key: string;
  label: string;
  diningTableId: number | null;
  /** In the location registry (unpositioned) vs. a free-text board label. */
  registered: boolean;
  resourceType: FloorResourceType;
  occupiedBy: FloorOccupant | null;
};

/** One board entry a server has in this service: active, or kept as history. */
export type SessionHistoryEntry = {
  roundId: string;
  /** The round's sequence number (the Grid's "Turn"). */
  sequence: number;
  /** The whole assignment label as recorded ("T6 + T7"). */
  label: string;
  tables: string[];
  status: "active" | "ended";
  /** At least one of its tables is not on the floor map. */
  offMap: boolean;
};

export type ServerSummary = {
  columnId: string;
  name: string;
  status: RotationColumn["status"];
  /** 1-based position among visible columns (rotation order). */
  order: number;
  /** One entry per active assignment (a combined "5+6" is one assignment). */
  activeAssignments: { roundId: string; label: string }[];
  /**
   * Physical tables held, each combined part counted. This is the ONE
   * definition of "N tables" for a server -- the Servers card, the Floor
   * legend and (summed) the Dashboard all show it. It comes from the board's
   * active entries, never from which tables happen to have a map position.
   */
  activeTableLabels: string[];
  /** The subset of `activeTableLabels` that is not on the floor map. */
  unmappedTableLabels: string[];
  /**
   * Session history: every active AND ended entry this server has in the
   * service, in turn order. Active count (`activeTableLabels`) and history
   * are separate concepts: an ended entry contributes 0 to the count and is
   * still listed here (struck through in the UI).
   */
  sessionHistory: SessionHistoryEntry[];
  isNext: boolean;
};

export type BoardStats = {
  /** Servers currently on the rotation (status "active"). */
  activeServers: number;
  /** Physical tables currently owned by someone (every held label). */
  occupiedTables: number;
  /** Registered tables (mapped or off-map) that nobody owns. */
  availableTables: number;
  /** Of `availableTables`, the registered tables with no floor position. */
  availableOffMapTables: number;
  /** Ended assignments kept as history (0 active contribution). */
  endedAssignments: number;
  /** Held labels that are not on the floor map (unknown / unpositioned). */
  unmappedActiveLabels: string[];
};

export type BoardReadModel = {
  tables: ResolvedFloorTable[];
  /** Held or available tables that have no map position (see OffMapTable). */
  offMapTables: OffMapTable[];
  servers: ServerSummary[];
  nextColumnId: string | null;
  stats: BoardStats;
};

export function buildBoardReadModel(input: {
  board: RotationBoard;
  /** Tables WITH a map position (what Floor and Picker draw). */
  layout: FloorLayoutEntry[];
  /**
   * Every active registered table, mapped or not. Defaults to `layout` (demo
   * mode, where every table is positioned).
   */
  registry?: RegistryTable[];
  team: { id: string; name: string; color: string }[];
}): BoardReadModel {
  const { board, layout, team } = input;
  const registry: RegistryTable[] = input.registry ?? layout;
  const tables = resolveFloorTables(layout, board, team);
  const occupancy = resolveOccupancyByLabel(board, team);
  const next = getNextColumn(board);

  const visible = board.columns
    .filter((column) => column.status !== "removed")
    .sort((a, b) => a.position - b.position);

  const mapLabels = new Set(layout.map(({ label }) => label));
  const registryByLabel = new Map(registry.map((t) => [t.label, t]));

  const servers: ServerSummary[] = visible.map((column, index) => {
    const activeAssignments = getActiveTablesForColumn(board, column.id).map(
      ({ roundId, tableLabel }) => ({ roundId, label: tableLabel }),
    );
    const activeTableLabels = activeAssignments.flatMap(({ label }) =>
      parseCombinedTableLabel(label),
    );
    const sessionHistory: SessionHistoryEntry[] = [];
    for (const round of board.rounds) {
      const cell = round.cells.find((c) => c.columnId === column.id);
      if (!cell?.tableLabel) continue;
      if (cell.status !== "active" && cell.status !== "ended") continue;
      const parts = parseCombinedTableLabel(cell.tableLabel);
      sessionHistory.push({
        roundId: round.id,
        sequence: round.sequence,
        label: cell.tableLabel,
        tables: parts,
        status: cell.status,
        offMap: parts.some((part) => !mapLabels.has(part)),
      });
    }
    return {
      columnId: column.id,
      name: column.name,
      status: column.status,
      order: index + 1,
      activeAssignments,
      activeTableLabels,
      unmappedTableLabels: activeTableLabels.filter(
        (label) => !mapLabels.has(label),
      ),
      sessionHistory,
      isNext: column.id === next?.id,
    };
  });

  // Every label an ACTIVE cell holds, whether or not it is on the map: the
  // dashboard must count a held table even when its row has no position yet.
  const heldLabels = new Set(servers.flatMap((s) => s.activeTableLabels));

  // Off-map: held labels with no map position (registered-but-unpositioned
  // or free-text) plus registered unpositioned tables nobody holds.
  const offMapByLabel = new Map<string, OffMapTable>();
  const addOffMap = (label: string) => {
    if (mapLabels.has(label) || offMapByLabel.has(label)) return;
    const registered = registryByLabel.get(label);
    offMapByLabel.set(label, {
      key:
        registered?.diningTableId !== undefined
          ? `id:${registered.diningTableId}`
          : `label:${label}`,
      label,
      diningTableId: registered?.diningTableId ?? null,
      registered: Boolean(registered),
      resourceType: registered?.resourceType ?? "table",
      occupiedBy: occupancy.get(label) ?? null,
    });
  };
  for (const label of heldLabels) addOffMap(label);
  for (const entry of registry) addOffMap(entry.label);
  const offMapTables = [...offMapByLabel.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );

  const availableOffMap = offMapTables.filter(
    (table) => table.registered && !table.occupiedBy,
  ).length;

  return {
    tables,
    offMapTables,
    servers,
    nextColumnId: next?.id ?? null,
    stats: {
      activeServers: visible.filter(({ status }) => status === "active").length,
      occupiedTables: heldLabels.size,
      availableTables:
        tables.filter((table) => !table.occupiedBy).length + availableOffMap,
      availableOffMapTables: availableOffMap,
      endedAssignments: servers.reduce(
        (sum, server) =>
          sum +
          server.sessionHistory.filter(({ status }) => status === "ended")
            .length,
        0,
      ),
      unmappedActiveLabels: [...heldLabels].filter(
        (label) => !mapLabels.has(label),
      ),
    },
  };
}

/**
 * Resolve one board label to its table identity (see TableIdentity). Exact
 * match through the registry; never normalizes.
 */
export function resolveTableIdentity(
  label: string,
  input: { layout: FloorLayoutEntry[]; registry?: RegistryTable[] },
): TableIdentity {
  const registry = input.registry ?? input.layout;
  const registered = registry.find((t) => t.label === label);
  const diningTableId = registered?.diningTableId ?? null;
  return {
    key: diningTableId !== null ? `id:${diningTableId}` : `label:${label}`,
    label,
    diningTableId,
    registered: Boolean(registered),
    mapped: input.layout.some((t) => t.label === label),
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
