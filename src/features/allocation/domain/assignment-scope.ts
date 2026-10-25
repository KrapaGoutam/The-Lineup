import {
  combinedTableLabel,
  parseCombinedTableLabel,
} from "@/features/allocation/domain/floor-layout";

/**
 * #109 U3 -- what an action on one table actually touches.
 *
 * A combined assignment ("T1 + T2") is ONE logical assignment over several
 * physical tables. Transfer, End and Unassign act on the whole assignment
 * (database-enforced; there is deliberately no partial release). Floor,
 * Servers and the assign-decision dialog all show copy from here so the three
 * surfaces can never explain the scope differently. Copy is for floor staff:
 * no ids, rows or table names from the database.
 *
 * A single-table assignment yields `combined: false` and every note is
 * `null`, so ordinary actions keep their concise UI.
 */
export type AssignmentScope = {
  combined: boolean;
  /** Every physical table in the assignment, in entry order. */
  tables: string[];
  /** "T1 + T2" (the existing production syntax). */
  label: string;
  /** One sentence naming the assignment. null for a single table. */
  summary: string | null;
  transferNote: string | null;
  endNote: string | null;
  unassignNote: string | null;
};

/** "both tables" / "all 3 tables". Only meaningful for 2+. */
function allTables(count: number): string {
  return count === 2 ? "both tables" : `all ${count} tables`;
}

export function getAssignmentScope(
  assignment: string | string[],
): AssignmentScope {
  const tables = (
    Array.isArray(assignment) ? assignment : parseCombinedTableLabel(assignment)
  ).filter(Boolean);
  const label = combinedTableLabel(tables);
  const combined = tables.length > 1;
  if (!combined) {
    return {
      combined,
      tables,
      label,
      summary: null,
      transferNote: null,
      endNote: null,
      unassignNote: null,
    };
  }
  const every = allTables(tables.length);
  return {
    combined,
    tables,
    label,
    summary: `${label} are one assignment.`,
    transferNote: `Transfer moves the entire assignment (${label}).`,
    endNote: `Ending this assignment releases ${every}.`,
    unassignNote: `Unassign removes the entire assignment (${label}).`,
  };
}

/** The other tables sharing this table's assignment ("T2"), for labels. */
export function otherTablesInAssignment(
  assignmentTables: string[],
  tableLabel: string,
): string[] {
  return assignmentTables.filter((label) => label !== tableLabel);
}
