import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";

import type {
  ChoreHistoryData,
  ChoreRunDetail,
  ChoreRunSummary,
  ChoreSnapshot,
  ChoreViewer,
} from "../domain/chore-types";
import {
  CHORE_CORRECTION_COLUMNS,
  CHORE_SNAPSHOT_CELL_COLUMNS,
  CHORE_SNAPSHOT_COLUMNS,
  CHORE_SNAPSHOT_COLUMN_COLUMNS,
  CHORE_SNAPSHOT_DETAIL_COLUMNS,
  CHORE_SNAPSHOT_ROW_COLUMNS,
  mapRunDetail,
  mapRunSummary,
  type ChoreCorrectionRow,
  type ChoreSnapshotCellRow,
  type ChoreSnapshotColumnRow,
  type ChoreSnapshotDetailRow,
  type ChoreSnapshotRow,
  type ChoreSnapshotRowRow,
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

  // Roll the boards of this location forward first (close a complete auto-reset run,
  // expire a stale daily / weekly run, open the current period's run). The database
  // decides from its own clock and the LOCATION's time zone; it is idempotent and any
  // member's load may run it. Best-effort: a failure only means no roll this load.
  const swept = await supabase.rpc("chore_cycles_sweep", {
    p_organization_id: organizationId,
    p_location_id: scope.locationId,
  });
  if (swept.error) {
    console.error("getChoreSnapshot: chore_cycles_sweep", swept.error.message);
  }

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

  const mapped = mapChoreBoards({
    boards,
    cycles,
    columns,
    rows,
    rowColumns,
    completions,
    assignments,
  });
  // A board between runs (daily board already completed today, a closed run not yet
  // restarted) shows its most recent finished run instead of an empty matrix.
  const between = mapped.filter((b) => b.cycle === null && !b.archived);
  const lastRuns = await Promise.all(
    between.map(async (b) => {
      const { data, error } = await supabase
        .from("chore_cycle_snapshots")
        .select(CHORE_SNAPSHOT_COLUMNS)
        .eq("board_id", b.id)
        .order("sequence", { ascending: false })
        .limit(1)
        .overrideTypes<ChoreSnapshotRow[], { merge: false }>();
      if (error) {
        console.error("getChoreSnapshot: last run", error.message);
        return [b.id, null] as const;
      }
      return [b.id, data?.[0] ? mapRunSummary(data[0]) : null] as const;
    }),
  );
  const lastByBoard = new Map<string, ChoreRunSummary | null>(lastRuns);
  return {
    boards: mapped.map((b) => ({
      ...b,
      lastRun: lastByBoard.get(b.id) ?? null,
    })),
  };
}

const HISTORY_LIMIT = 300;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Finished runs of the verified location, newest business day first. One bounded
 * read of the frozen headers (never the cells): `month` ("YYYY-MM") narrows it to
 * that month's business days, `boardId` to one template. RLS decides what the
 * caller may see; the filters below only narrow it.
 */
export async function getChoreHistory(
  organizationId: string,
  scope: VerifiedLocationScope,
  filter: { month: string | null; boardId: string | null },
): Promise<ChoreHistoryData | null> {
  if (scope.organizationId !== organizationId) return null;
  if (filter.month !== null && !MONTH.test(filter.month)) return null;
  const supabase = await createClient();
  let query = supabase
    .from("chore_cycle_snapshots")
    .select(CHORE_SNAPSHOT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", scope.locationId);
  if (filter.boardId) query = query.eq("board_id", filter.boardId);
  if (filter.month) {
    query = query
      .gte("business_date", `${filter.month}-01`)
      .lt("business_date", nextMonthStart(filter.month));
  }
  const { data, error } = await query
    .order("business_date", { ascending: false })
    .order("sequence", { ascending: false })
    .limit(HISTORY_LIMIT + 1)
    .overrideTypes<ChoreSnapshotRow[], { merge: false }>();
  if (error) {
    console.error("getChoreHistory", error.message);
    return null;
  }
  const rows = data ?? [];
  return {
    runs: rows.slice(0, HISTORY_LIMIT).map(mapRunSummary),
    truncated: rows.length > HISTORY_LIMIT,
  };
}

/**
 * ONE finished run with its frozen matrix and corrections. Managers only (the matrix
 * tables are manager-only reads); a run of another location or organization simply
 * does not come back, so the caller learns nothing about it.
 */
export async function getChoreRunDetail(
  organizationId: string,
  scope: VerifiedLocationScope,
  viewer: ChoreViewer,
  cycleId: string,
): Promise<ChoreRunDetail | null> {
  if (scope.organizationId !== organizationId || !viewer.isManager) return null;
  const supabase = await createClient();
  const header = await supabase
    .from("chore_cycle_snapshots")
    .select(CHORE_SNAPSHOT_DETAIL_COLUMNS)
    .eq("cycle_id", cycleId)
    .eq("organization_id", organizationId)
    .eq("location_id", scope.locationId)
    .maybeSingle<ChoreSnapshotDetailRow>();
  if (header.error || !header.data) return null;
  const [rows, columns, cells, corrections, board] = await Promise.all([
    supabase
      .from("chore_cycle_snapshot_rows")
      .select(CHORE_SNAPSHOT_ROW_COLUMNS)
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true })
      .overrideTypes<ChoreSnapshotRowRow[], { merge: false }>(),
    supabase
      .from("chore_cycle_snapshot_columns")
      .select(CHORE_SNAPSHOT_COLUMN_COLUMNS)
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true })
      .overrideTypes<ChoreSnapshotColumnRow[], { merge: false }>(),
    supabase
      .from("chore_cycle_snapshot_cells")
      .select(CHORE_SNAPSHOT_CELL_COLUMNS)
      .eq("cycle_id", cycleId)
      .overrideTypes<ChoreSnapshotCellRow[], { merge: false }>(),
    supabase
      .from("chore_cycle_corrections")
      .select(CHORE_CORRECTION_COLUMNS)
      .eq("cycle_id", cycleId)
      .order("id", { ascending: true })
      .overrideTypes<ChoreCorrectionRow[], { merge: false }>(),
    supabase
      .from("chore_boards")
      .select("manager_override, archived_at")
      .eq("id", header.data.board_id)
      .maybeSingle(),
  ]);
  if (rows.error || columns.error || cells.error || corrections.error) {
    console.error(
      "getChoreRunDetail",
      rows.error?.message ??
        columns.error?.message ??
        cells.error?.message ??
        corrections.error?.message,
    );
    return null;
  }
  return mapRunDetail({
    header: header.data,
    rows: rows.data ?? [],
    columns: columns.data ?? [],
    cells: cells.data ?? [],
    corrections: corrections.data ?? [],
    // The RPC re-checks this; the flag only decides whether the control is offered.
    canCorrect: board.data?.manager_override === true,
  });
}
