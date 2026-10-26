import { parseCombinedTableLabel } from "@/features/allocation/domain/floor-layout";
import type { RotationBoard } from "@/features/allocation/domain/rotation-board";

/**
 * Cross-view integrity (X2) -- the ONE decision for "this server is asking for
 * a table that is not free". Grid, Floor, Picker and Servers all classify
 * through `classifyTableClaim` and open the same dialog; none of them has its
 * own copy of the rule. (Dashboard is read-only.)
 *
 * Identity is the CANONICAL label the board stores. Typed shorthand is resolved
 * before it gets here (domain/table-input.ts mirrors the database resolver:
 * "1" -> "T1" when T1 is registered), so callers pass the canonical label; this
 * module itself does no trimming beyond the combined-label split, no case
 * folding and no "T"/"Table" prefix handling.
 *
 * A combined assignment ("T6 + T7") is ONE logical assignment: a holder is
 * the whole assignment, and Transfer / End + Assign act on all of it. Releasing
 * only one table of an active combined assignment stays out of scope.
 */

/** The active assignment currently holding (at least one of) the wanted tables. */
export type ClaimHolder = {
  /** Holder's column id (a profile id in the pure domain model). */
  columnId: string;
  /** The round of the holder's active entry (a Transfer / End source). */
  roundId: string;
  /** The whole assignment as recorded, e.g. "T6 + T7". */
  assignmentLabel: string;
  /** Every physical table in that assignment. */
  assignmentTables: string[];
};

export type ClaimVerdict =
  | { kind: "free" }
  | {
      /** The asking server already holds (some of) these tables. */
      kind: "same-server";
      tables: string[];
    }
  | {
      kind: "held";
      /** The tables the caller asked for. */
      wantedTables: string[];
      /** The subset of them that someone else holds. */
      contestedTables: string[];
      holders: ClaimHolder[];
      /**
       * Transfer moves the holder's WHOLE assignment, so it only makes sense
       * when exactly one assignment holds the wanted tables and covers all of
       * them. Otherwise only End + Assign (or Cancel) is offered.
       */
      transferable: boolean;
    };

export function classifyTableClaim(
  board: RotationBoard,
  input: {
    label: string;
    columnId: string;
    /**
     * The cell being written. Its own active entry is not a conflict (an
     * in-place edit of "T6" to "T6 + T7" must not collide with itself).
     */
    targetRoundId?: string | null;
  },
): ClaimVerdict {
  const wanted = parseCombinedTableLabel(input.label);
  if (wanted.length === 0) return { kind: "free" };
  const wantedSet = new Set(wanted);

  const sameServer = new Set<string>();
  const contested = new Set<string>();
  const holders: ClaimHolder[] = [];

  for (const round of board.rounds) {
    for (const cell of round.cells) {
      if (cell.status !== "active" || !cell.tableLabel) continue;
      if (round.id === input.targetRoundId && cell.columnId === input.columnId)
        continue;
      const held = parseCombinedTableLabel(cell.tableLabel);
      const overlap = held.filter((part) => wantedSet.has(part));
      if (overlap.length === 0) continue;
      if (cell.columnId === input.columnId) {
        for (const part of overlap) sameServer.add(part);
        continue;
      }
      for (const part of overlap) contested.add(part);
      holders.push({
        columnId: cell.columnId,
        roundId: round.id,
        assignmentLabel: cell.tableLabel,
        assignmentTables: held,
      });
    }
  }

  if (sameServer.size > 0) {
    return {
      kind: "same-server",
      tables: wanted.filter((t) => sameServer.has(t)),
    };
  }
  if (holders.length === 0) return { kind: "free" };
  return {
    kind: "held",
    wantedTables: wanted,
    contestedTables: wanted.filter((t) => contested.has(t)),
    holders,
    transferable:
      holders.length === 1 &&
      wanted.every((t) => holders[0].assignmentTables.includes(t)),
  };
}

/**
 * What the database reports when an assign hits a held table (SQLSTATE PT409,
 * JSON `detail`). Holder member ids are mapped to profile ids server-side
 * before this reaches the client.
 */
export type TableConflictInfo = {
  kind: "held" | "same_server";
  label: string;
  holders: {
    columnId: string;
    roundId: string;
    assignmentLabel: string;
  }[];
};

/** Rebuild a verdict from a server-reported conflict (stale-client path). */
export function verdictFromServerConflict(
  info: TableConflictInfo,
  wantedLabel: string,
): ClaimVerdict {
  const wanted = parseCombinedTableLabel(wantedLabel);
  if (info.kind === "same_server" || info.holders.length === 0) {
    return { kind: "same-server", tables: wanted };
  }
  const holders: ClaimHolder[] = info.holders.map((holder) => ({
    columnId: holder.columnId,
    roundId: holder.roundId,
    assignmentLabel: holder.assignmentLabel,
    assignmentTables: parseCombinedTableLabel(holder.assignmentLabel),
  }));
  const heldAll = new Set(holders.flatMap((h) => h.assignmentTables));
  return {
    kind: "held",
    wantedTables: wanted,
    contestedTables: wanted.filter((t) => heldAll.has(t)),
    holders,
    transferable:
      holders.length === 1 &&
      wanted.every((t) => holders[0].assignmentTables.includes(t)),
  };
}

/** "T6" / "T6 and T7" / "T1, T2 and T3" for user-facing sentences. */
export function listTables(tables: string[]): string {
  if (tables.length <= 1) return tables[0] ?? "";
  return `${tables.slice(0, -1).join(", ")} and ${tables.at(-1)}`;
}

/** The decision dialog's wording, in floor-staff language (no ids or rows). */
export type HeldConflictCopy = {
  title: string;
  description: string;
  /** null when Transfer is not a valid choice (see ClaimVerdict.transferable). */
  transferLabel: string | null;
  endAndAssignLabel: string;
};

export function describeHeldConflict(
  verdict: Extract<ClaimVerdict, { kind: "held" }>,
  input: {
    wantedLabel: string;
    requesterName: string;
    holderName: (columnId: string) => string;
  },
): HeldConflictCopy {
  const { requesterName, wantedLabel } = input;
  const contested = listTables(verdict.contestedTables);
  if (verdict.holders.length === 1) {
    const holder = verdict.holders[0];
    const holderName = input.holderName(holder.columnId);
    const assignment = holder.assignmentTables.join(" + ");
    const combined = holder.assignmentTables.length > 1;
    return {
      title: "Table already assigned",
      description: combined
        ? `${contested} belongs to the combined assignment ${assignment}, currently assigned to ${holderName}. What do you want to do?`
        : `${contested} is currently assigned to ${holderName}. What do you want to do?`,
      transferLabel: verdict.transferable
        ? combined
          ? `Transfer entire ${assignment} assignment to ${requesterName}`
          : `Transfer to ${requesterName}`
        : null,
      endAndAssignLabel: combined
        ? `End the entire ${assignment} assignment, then assign ${wantedLabel} to ${requesterName}`
        : `End ${holderName}'s assignment and assign ${wantedLabel} to ${requesterName}`,
    };
  }
  const names = [
    ...new Set(verdict.holders.map((h) => input.holderName(h.columnId))),
  ];
  return {
    title: "Tables already assigned",
    description: `${contested} are held by different assignments (${names.join(", ")}). What do you want to do?`,
    transferLabel: null,
    endAndAssignLabel: `End those assignments, then assign ${wantedLabel} to ${requesterName}`,
  };
}

/** One-line message for a same-server duplicate (no mutation happens). */
export function describeSameServer(tables: string[], serverName: string) {
  return `${listTables(tables)} ${tables.length === 1 ? "is" : "are"} already assigned to ${serverName}.`;
}
