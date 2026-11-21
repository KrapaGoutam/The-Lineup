import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";

import type { ChoreSnapshot, ChoreViewer } from "../domain/chore-types";
import {
  CHORE_ASSIGNMENT_COLUMNS,
  CHORE_BOARD_COLUMNS,
  CHORE_COLUMN_COLUMNS,
  CHORE_COMPLETION_COLUMNS,
  CHORE_CYCLE_COLUMNS,
  CHORE_ROW_COLUMNS,
  CHORE_ROW_COLUMN_COLUMNS,
  mapChoreBoards,
  type ChoreAssignmentRow,
  type ChoreBoardRow,
  type ChoreColumnRow,
  type ChoreCompletionRow,
  type ChoreCycleRow,
  type ChoreRowColumnRow,
  type ChoreRowRow,
} from "./chore-mapper";

const PAGE = 1000;
const MAX_PAGES = 20;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/** Reads every page (PostgREST caps a response at its max-rows setting). */
async function readAll<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<T[] | null> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) {
      console.error("getChoreSnapshot", error.message);
      return null;
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
  return all;
}

/**
 * The authoritative Chore Wheel read model for the verified location. Read
 * through the caller's own session, so RLS decides what comes back (staff see
 * live boards only; managers also see turned-off and archived ones and the
 * assignment history). The manager gate below only skips a pointless query.
 */
export async function getChoreSnapshot(
  organizationId: string,
  viewer: ChoreViewer,
  scope: VerifiedLocationScope,
): Promise<ChoreSnapshot | null> {
  if (scope.organizationId !== organizationId) return null;
  const supabase = await createClient();

  const boards = await readAll<ChoreBoardRow>((from, to) =>
    supabase
      .from("chore_boards")
      .select(CHORE_BOARD_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("location_id", scope.locationId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<ChoreBoardRow[], { merge: false }>(),
  );
  if (!boards) return null;
  if (boards.length === 0) return { boards: [] };
  const boardIds = boards.map((b) => b.id);

  const cycles = await readAll<ChoreCycleRow>((from, to) =>
    supabase
      .from("chore_cycles")
      .select(CHORE_CYCLE_COLUMNS)
      .in("board_id", boardIds)
      .eq("status", "open")
      .range(from, to)
      .overrideTypes<ChoreCycleRow[], { merge: false }>(),
  );
  const columns = await readAll<ChoreColumnRow>((from, to) =>
    supabase
      .from("chore_columns")
      .select(CHORE_COLUMN_COLUMNS)
      .in("board_id", boardIds)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .range(from, to)
      .overrideTypes<ChoreColumnRow[], { merge: false }>(),
  );
  const rows = await readAll<ChoreRowRow>((from, to) =>
    supabase
      .from("chore_rows")
      .select(CHORE_ROW_COLUMNS)
      .in("board_id", boardIds)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .range(from, to)
      .overrideTypes<ChoreRowRow[], { merge: false }>(),
  );
  if (!cycles || !columns || !rows) return null;

  const rowIds = rows.map((r) => r.id);
  const rowColumns =
    rowIds.length === 0
      ? []
      : await readAll<ChoreRowColumnRow>((from, to) =>
          supabase
            .from("chore_row_columns")
            .select(CHORE_ROW_COLUMN_COLUMNS)
            .in("board_id", boardIds)
            .range(from, to)
            .overrideTypes<ChoreRowColumnRow[], { merge: false }>(),
        );
  // Only the OPEN cycle's completions are part of the live board.
  const cycleIds = cycles.map((c) => c.id);
  const completions =
    cycleIds.length === 0
      ? []
      : await readAll<ChoreCompletionRow>((from, to) =>
          supabase
            .from("chore_completions")
            .select(CHORE_COMPLETION_COLUMNS)
            .in("cycle_id", cycleIds)
            .range(from, to)
            .overrideTypes<ChoreCompletionRow[], { merge: false }>(),
        );
  const assignments = viewer.isManager
    ? await readAll<ChoreAssignmentRow>((from, to) =>
        supabase
          .from("chore_column_assignments")
          .select(CHORE_ASSIGNMENT_COLUMNS)
          .in("board_id", boardIds)
          .order("id", { ascending: true })
          .range(from, to)
          .overrideTypes<ChoreAssignmentRow[], { merge: false }>(),
      )
    : [];
  if (!rowColumns || !completions || !assignments) return null;

  return {
    boards: mapChoreBoards({
      boards,
      cycles,
      columns,
      rows,
      rowColumns,
      completions,
      assignments,
    }),
  };
}
