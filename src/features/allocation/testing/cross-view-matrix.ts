/**
 * Table Allocation cross-view integrity (X4) -- the machine-readable scenario
 * matrix. ONE list of scenarios drives three layers:
 *
 *   1. domain      (cross-view-matrix.test.ts)  every scenario through the pure
 *                  reducer + shared claim classifier + read model, asserting all
 *                  five views from the same canonical expectation.
 *   2. component   the new views/dialogs reuse the same expectation helpers.
 *   3. Playwright  (tests/e2e/table-allocation-cross-view.spec.ts) drives the
 *                  same steps through the real UI of each origin, on desktop,
 *                  tablet and mobile, and asserts all five views after the
 *                  action (and after every checkpoint).
 *
 * Test-only module: nothing in the app imports it.
 *
 * Roles (A, B, C) are mapped to concrete servers by each layer. A step names
 * the ORIGIN it is performed from; only actions a view really supports appear
 * (Grid: type/skip/unassign; Floor: tile -> server, occupied tile ->
 * transfer/end/unassign/assign-elsewhere; Picker: cell -> tile, skip;
 * Servers: "+ Table", chip -> transfer/end/unassign). Dashboard is read-only.
 */
import {
  buildBoardReadModel,
  type BoardReadModel,
} from "@/features/allocation/domain/board-read-model";
import type {
  FloorLayoutEntry,
  RegistryTable,
} from "@/features/allocation/domain/floor-layout";
import { parseCombinedTableLabel } from "@/features/allocation/domain/floor-layout";
import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  findEarliestEmptyRoundForColumn,
  redoBoard,
  undoBoard,
  type BoardHistory,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import { classifyTableClaim } from "@/features/allocation/domain/table-conflict";
import type {
  Role,
  Step,
  ViewSnapshots,
} from "@/features/allocation/testing/cross-view-scenarios";

/* ------------------------------------------------------------------ */
/* Domain interpreter: the same steps through the pure reducer.         */
/* ------------------------------------------------------------------ */

export type DomainWorld = {
  /** Role -> column id (a profile id in the domain model). */
  columnOf: Record<Role, string>;
  names: Record<Role, string>;
  layout: FloorLayoutEntry[];
  registry: RegistryTable[];
};

export const DOMAIN_WORLD: DomainWorld = {
  columnOf: { A: "a", B: "b", C: "c" },
  names: { A: "Ann", B: "Bea", C: "Cy" },
  layout: Array.from({ length: 9 }, (_, i) => ({
    diningTableId: 101 + i,
    label: `T${i + 1}`,
    x: 10 + i * 9,
    y: 20,
    resourceType: "table" as const,
  })),
  // Registered but with NO position (off-map), plus the mapped ones.
  registry: [
    ...Array.from({ length: 9 }, (_, i) => ({
      diningTableId: 101 + i,
      label: `T${i + 1}`,
      x: 10 + i * 9,
      y: 20,
      resourceType: "table" as const,
    })),
    {
      diningTableId: 201,
      label: "P1",
      x: null,
      y: null,
      resourceType: "table" as const,
    },
  ],
};

export function newDomainBoard(world: DomainWorld = DOMAIN_WORLD) {
  return createBoardHistory(
    createRotationBoard(
      (["A", "B", "C"] as const).map((role, position) => ({
        id: world.columnOf[role],
        name: world.names[role],
        position,
        status: "active" as const,
      })),
    ),
  );
}

function holderCell(board: RotationBoard, table: string) {
  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (
        cell.status === "active" &&
        cell.tableLabel &&
        parseCombinedTableLabel(cell.tableLabel).includes(table)
      ) {
        return { roundId: round.id, columnId: cell.columnId };
      }
    }
  }
  return null;
}

/**
 * Apply one step with exactly the decisions the UI makes: classify through the
 * shared resolver first; a free table assigns into the server's earliest empty
 * round; a held table is resolved with the chosen action.
 */
export function applyDomainStep(
  history: BoardHistory,
  step: Step,
  world: DomainWorld = DOMAIN_WORLD,
): BoardHistory {
  const board = history.present;
  const col = (role: Role) => world.columnOf[role];
  switch (step.do) {
    case "undo":
      return undoBoard(history);
    case "redo":
      return redoBoard(history);
    case "assign": {
      const round = findEarliestEmptyRoundForColumn(board, col(step.who));
      if (!round) throw new Error("no empty round");
      const verdict = classifyTableClaim(board, {
        label: step.table,
        columnId: col(step.who),
        targetRoundId: round.id,
      });
      if (verdict.kind !== "free")
        throw new Error(`${step.table} is not free (${verdict.kind})`);
      return executeBoardAction(history, {
        type: "assign",
        roundId: round.id,
        columnId: col(step.who),
        tableLabel: step.table,
      });
    }
    case "same-server": {
      const verdict = classifyTableClaim(board, {
        label: step.table,
        columnId: col(step.who),
      });
      if (verdict.kind !== "same-server")
        throw new Error(`expected same-server, got ${verdict.kind}`);
      return history;
    }
    case "conflict": {
      const round = findEarliestEmptyRoundForColumn(board, col(step.who));
      const verdict = classifyTableClaim(board, {
        label: step.table,
        columnId: col(step.who),
        targetRoundId: round?.id,
      });
      if (verdict.kind !== "held")
        throw new Error(`expected a held table, got ${verdict.kind}`);
      if (step.choose === "cancel") return history;
      if (step.choose === "transfer") {
        if (!verdict.transferable) throw new Error("transfer not offered");
        const holder = verdict.holders[0];
        return executeBoardAction(history, {
          type: "transfer",
          sourceRoundId: holder.roundId,
          sourceColumnId: holder.columnId,
          destColumnId: col(step.who),
        });
      }
      if (!round) throw new Error("no empty round");
      return executeBoardAction(history, {
        type: "assign",
        roundId: round.id,
        columnId: col(step.who),
        tableLabel: step.table,
        confirmTransfer: true,
        endWholeAssignment: true,
      });
    }
    case "end": {
      const cell = holderCell(board, step.table);
      if (!cell) throw new Error(`${step.table} is not held`);
      return executeBoardAction(history, { type: "end-table", ...cell });
    }
    case "transfer": {
      const cell = holderCell(board, step.table);
      if (!cell) throw new Error(`${step.table} is not held`);
      return executeBoardAction(history, {
        type: "transfer",
        sourceRoundId: cell.roundId,
        sourceColumnId: cell.columnId,
        destColumnId: col(step.to),
      });
    }
    case "unassign": {
      const cell = holderCell(board, step.table);
      if (!cell) throw new Error(`${step.table} is not held`);
      return executeBoardAction(history, { type: "clear-cell", ...cell });
    }
    case "skip": {
      const round = findEarliestEmptyRoundForColumn(board, col(step.who));
      if (!round) throw new Error("no empty round");
      return executeBoardAction(history, {
        type: "skip-turn",
        roundId: round.id,
        columnId: col(step.who),
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Five-view projection + the single expectation check.                 */
/* ------------------------------------------------------------------ */

function roleOf(world: DomainWorld, columnId: string | undefined): Role | null {
  const found = (Object.keys(world.columnOf) as Role[]).find(
    (role) => world.columnOf[role] === columnId,
  );
  return found ?? null;
}

/** What each of the five views shows for this board. */
export function projectViews(
  board: RotationBoard,
  watched: string[],
  world: DomainWorld = DOMAIN_WORLD,
): { views: ViewSnapshots; model: BoardReadModel } {
  const team = (Object.keys(world.columnOf) as Role[]).map((role) => ({
    id: world.columnOf[role],
    name: world.names[role],
    color: "x",
  }));
  const model = buildBoardReadModel({
    board,
    layout: world.layout,
    registry: world.registry,
    team,
  });

  // Grid: the board entries themselves.
  const gridActive: Record<string, Role | null> = {};
  const gridEnded: Record<string, string[]> = {};
  for (const label of watched) gridActive[label] = null;
  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (!cell.tableLabel) continue;
      const role = roleOf(world, cell.columnId);
      if (cell.status === "active") {
        for (const part of parseCombinedTableLabel(cell.tableLabel))
          if (watched.includes(part)) gridActive[part] = role;
      } else if (cell.status === "ended" && role) {
        (gridEnded[role] ??= []).push(cell.tableLabel);
      }
    }
  }

  // Floor / Picker: tiles + the off-map list, keyed by the table's identity.
  const owner = (label: string): Role | null => {
    const mapped = model.tables.find((t) => t.label === label);
    const off = model.offMapTables.find((t) => t.label === label);
    return roleOf(world, (mapped ?? off)?.occupiedBy?.columnId);
  };
  const floor: Record<string, Role | null> = {};
  const picker: Record<string, Role | null> = {};
  for (const label of watched) {
    floor[label] = owner(label);
    picker[label] = owner(label);
  }

  const servers = {} as ViewSnapshots["servers"];
  for (const role of ["A", "B", "C"] as const) {
    const summary = model.servers.find(
      (s) => s.columnId === world.columnOf[role],
    );
    servers[role] = {
      active: (summary?.activeTableLabels ?? []).filter((l) =>
        watched.includes(l),
      ),
      ended: (summary?.sessionHistory ?? [])
        .filter((h) => h.status === "ended")
        .map((h) => h.label),
    };
  }

  return {
    model,
    views: {
      grid: { active: gridActive, ended: gridEnded },
      floor,
      picker,
      servers,
      dashboard: {
        activeTables: model.stats.occupiedTables,
        next: roleOf(world, model.nextColumnId ?? undefined),
      },
    },
  };
}
