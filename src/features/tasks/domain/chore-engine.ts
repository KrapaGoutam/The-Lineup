import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  applyCorrections,
  freezeBoard,
  periodStart,
  runPeriodEnded,
  runReadiness,
  summarizeRun,
  type RunCloseInfo,
} from "./chore-cycles";
import {
  boardProgress,
  findCompletion,
  isBoardLive,
  isLiveColumn,
  isLiveRow,
  rowAppliesTo,
  sortByOrder,
} from "./chore-rules";
import type { ChoreCommand } from "./chore-commands";
import type {
  ChoreBoardView,
  ChoreCorrectionView,
  ChoreEntryKind,
  ChoreHistoryData,
  ChoreRunDetail,
  ChoreRunSummary,
  ChoreSnapshot,
  ChoreViewer,
} from "./chore-types";
import type { TaskTeamMember } from "./task-types";

/**
 * Demo-mode twin of the chore RPCs (in-memory, no database). It enforces the
 * same rules in the same order -- authorize first, then validate -- and uses the
 * database's plain-language messages, so the demo and real mode behave alike.
 * Real mode never runs this: the database is authoritative there.
 */

export type ChoreState = {
  boards: ChoreBoardView[];
  seq: number;
  /** Finished runs, frozen at close (the demo twin of the snapshot tables). */
  history: ChoreRunDetail[];
  /** Template structure version per board and the version when the run's first cell was checked. */
  structure: Record<string, { version: number; start: number | null }>;
};

export function emptyChoreState(): ChoreState {
  return { boards: [], seq: 1, history: [], structure: {} };
}

export type ChoreEngineContext = {
  viewer: ChoreViewer;
  /** Active, workforce-eligible people (the assignee roster). */
  team: readonly TaskTeamMember[];
  organizationId: string;
  locationId: string;
  now: Date;
  /** IANA zone of the location (daily / weekly periods follow it, not UTC). */
  timeZone?: string;
};

export type ChoreEngineResult =
  | { ok: true; value: ChoreState; outcome?: string }
  | { ok: false; error: string };

const NOT_FOUND = "That board does not exist or you cannot use it.";
const MANAGER_ONLY = "Only an owner, manager or assistant manager can do that.";

class Refusal extends Error {}
const refuse = (message: string): never => {
  throw new Refusal(message);
};

/** What this viewer can see: staff only live boards; managers everything. */
export function buildChoreSnapshot(
  state: ChoreState,
  viewer: ChoreViewer,
): ChoreSnapshot {
  const boards = state.boards
    .filter((b) => viewer.isManager || isBoardLive(b))
    .map((b) => ({
      ...b,
      assignments: viewer.isManager ? b.assignments : [],
      lastRun: b.cycle ? null : lastRunOf(state, b.id),
    }));
  return { boards: sortByOrder(boards) };
}

function lastRunOf(state: ChoreState, boardId: string): ChoreRunSummary | null {
  let best: ChoreRunSummary | null = null;
  for (const d of state.history) {
    if (d.summary.boardId !== boardId) continue;
    if (!best || d.summary.sequence > best.sequence) best = d.summary;
  }
  return best;
}

function localToday(ctx: ChoreEngineContext): string {
  return zonedWallTimeFromInstant(ctx.now, ctx.timeZone ?? "America/Chicago")
    .date;
}

function nextSequence(state: ChoreState, board: ChoreBoardView): number {
  let max = board.cycle?.sequence ?? 0;
  for (const d of state.history) {
    if (d.summary.boardId === board.id) max = Math.max(max, d.summary.sequence);
  }
  return max + 1;
}

/** Opens the next run of a board (the demo twin of private.chore_start_run). */
function openRun(
  state: ChoreState,
  board: ChoreBoardView,
  ctx: ChoreEngineContext,
  bySystem: boolean,
): [ChoreState, ChoreBoardView] {
  const [s1, cycleId] = nextId(state, "cycle");
  const next: ChoreBoardView = {
    ...board,
    cycle: {
      id: cycleId,
      sequence: nextSequence(state, board),
      openedAt: ctx.now.toISOString(),
      businessDate: localToday(ctx),
      openedBySystem: bySystem,
    },
    completions: [],
    lastRun: null,
  };
  return [
    {
      ...s1,
      structure: {
        ...s1.structure,
        [board.id]: {
          version: s1.structure[board.id]?.version ?? 1,
          start: null,
        },
      },
    },
    next,
  ];
}

/** Closes the current run: freeze it, record the summary, clear the live board (demo twin of private.chore_finish_cycle). */
function finishRun(
  state: ChoreState,
  board: ChoreBoardView,
  ctx: ChoreEngineContext,
  close: Omit<RunCloseInfo, "closedAt" | "today">,
): [ChoreState, ChoreBoardView] {
  const cycle = board.cycle;
  if (!cycle) return refuse("That run does not exist or you cannot use it.");
  const info: RunCloseInfo = {
    ...close,
    closedAt: ctx.now.toISOString(),
    today: localToday(ctx),
  };
  const meta = state.structure[board.id] ?? { version: 1, start: null };
  const changed = meta.start !== null && meta.start !== meta.version;
  const summary = summarizeRun(board, info, changed);
  const detail: ChoreRunDetail = {
    summary,
    board: freezeBoard(board),
    corrections: [],
    canCorrect: false,
  };
  const closed: ChoreBoardView = { ...board, cycle: null, completions: [] };
  return [{ ...state, history: [...state.history, detail] }, closed];
}

function nextId(state: ChoreState, prefix: string): [ChoreState, string] {
  return [{ ...state, seq: state.seq + 1 }, `${prefix}-${state.seq}`];
}

function replaceBoard(state: ChoreState, board: ChoreBoardView): ChoreState {
  return {
    ...state,
    boards: state.boards.map((b) => (b.id === board.id ? board : b)),
  };
}

function authorizeBoard(
  state: ChoreState,
  ctx: ChoreEngineContext,
  boardId: string,
  opts: { manager: boolean; live?: boolean; allowArchived?: boolean },
): ChoreBoardView {
  const board = state.boards.find((b) => b.id === boardId);
  if (
    !board ||
    board.organizationId !== ctx.organizationId ||
    board.locationId !== ctx.locationId
  ) {
    return refuse(NOT_FOUND);
  }
  if (opts.manager && !ctx.viewer.isManager) return refuse(MANAGER_ONLY);
  if (!ctx.viewer.isManager && !isBoardLive(board)) return refuse(NOT_FOUND);
  if (board.archived && !opts.allowArchived) {
    return refuse("This board is archived and can no longer be changed.");
  }
  if (opts.live && !board.isActive) return refuse("This board is turned off.");
  return board;
}

function liveBoardCount(state: ChoreState, ctx: ChoreEngineContext): number {
  return state.boards.filter(
    (b) => b.locationId === ctx.locationId && !b.archived,
  ).length;
}

function nameTaken(
  state: ChoreState,
  ctx: ChoreEngineContext,
  name: string,
  exceptId: string | null,
): boolean {
  const key = name.trim().toLowerCase();
  return state.boards.some(
    (b) =>
      b.locationId === ctx.locationId &&
      !b.archived &&
      b.id !== exceptId &&
      b.name.trim().toLowerCase() === key,
  );
}

function eligible(ctx: ChoreEngineContext, profileId: string): boolean {
  return ctx.team.some((m) => m.profileId === profileId);
}

function personTaken(
  board: ChoreBoardView,
  profileId: string | null,
  exceptColumnId: string | null,
): boolean {
  return (
    profileId !== null &&
    board.columns.some(
      (c) =>
        c.profileId === profileId && isLiveColumn(c) && c.id !== exceptColumnId,
    )
  );
}

function reorderIds<T extends { id: string; sortOrder: number }>(
  items: readonly T[],
  ids: readonly string[],
  what: string,
): T[] {
  const unique = new Set(ids);
  if (
    unique.size !== ids.length ||
    ids.some((i) => !items.some((it) => it.id === i))
  ) {
    return refuse(`That list of ${what} is not valid.`);
  }
  const rank = new Map(ids.map((i, n) => [i, n]));
  const ordered = [...items].sort((a, b) => {
    const ra = rank.get(a.id) ?? 100000 + a.sortOrder;
    const rb = rank.get(b.id) ?? 100000 + b.sortOrder;
    return ra - rb;
  });
  const order = new Map(ordered.map((it, n) => [it.id, (n + 1) * 10]));
  return items.map((it) => ({ ...it, sortOrder: order.get(it.id) ?? 0 }));
}

function nextOrder(items: readonly { sortOrder: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 10;
}

function apply(
  state: ChoreState,
  command: ChoreCommand,
  ctx: ChoreEngineContext,
): { value: ChoreState; outcome?: string } {
  const iso = ctx.now.toISOString();
  switch (command.type) {
    case "boardSave": {
      let board: ChoreBoardView | null = null;
      if (command.boardId === null) {
        if (!ctx.viewer.isManager) refuse(MANAGER_ONLY);
      } else {
        board = authorizeBoard(state, ctx, command.boardId, { manager: true });
      }
      const name = command.name.trim();
      if (name.length < 1 || name.length > 80) {
        refuse("Give the board a name (up to 80 characters).");
      }
      if (nameTaken(state, ctx, name, board?.id ?? null)) {
        refuse("A board with that name already exists at this location.");
      }
      const description = command.description?.trim() || null;
      if (
        command.recurrenceIntent === "per_shift" &&
        board?.recurrenceIntent !== "per_shift"
      ) {
        refuse(
          "Per-shift runs are not available yet. Choose Continuous, Daily, Weekly or Manual.",
        );
      }
      if (board === null) {
        if (liveBoardCount(state, ctx) >= 25) {
          refuse(
            "A location can have up to 25 chore boards. Archive one first.",
          );
        }
        const [s1, boardId] = nextId(state, "board");
        const [s2, cycleId] = nextId(s1, "cycle");
        const created: ChoreBoardView = {
          id: boardId,
          organizationId: ctx.organizationId,
          locationId: ctx.locationId,
          name,
          description,
          isActive: true,
          archived: false,
          sortOrder: nextOrder(
            state.boards.filter((b) => b.locationId === ctx.locationId),
          ),
          staffAccess: command.staffAccess,
          managerOverride: command.managerOverride,
          defaultMode: command.defaultMode,
          recurrenceIntent: command.recurrenceIntent,
          resetIntent: command.resetIntent,
          version: 1,
          cycle: {
            id: cycleId,
            sequence: 1,
            openedAt: iso,
            businessDate: localToday(ctx),
            openedBySystem: false,
          },
          columns: [],
          rows: [],
          completions: [],
          assignments: [],
        };
        return { value: { ...s2, boards: [...s2.boards, created] } };
      }
      if (
        command.expectedVersion !== null &&
        command.expectedVersion !== board.version
      ) {
        refuse("This board was changed by someone else. Reload and try again.");
      }
      return {
        value: replaceBoard(state, {
          ...board,
          name,
          description,
          staffAccess: command.staffAccess,
          managerOverride: command.managerOverride,
          defaultMode: command.defaultMode,
          recurrenceIntent: command.recurrenceIntent,
          resetIntent: command.resetIntent,
          version: board.version + 1,
        }),
      };
    }

    case "boardSetState": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      return {
        value: replaceBoard(state, {
          ...board,
          isActive: command.state === "active",
          archived: command.state === "archived",
          version: board.version + 1,
        }),
      };
    }

    case "boardDuplicate": {
      const source = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
        allowArchived: true,
      });
      const name = command.name.trim();
      if (name.length < 1 || name.length > 80) {
        refuse("Give the new board a name (up to 80 characters).");
      }
      if (liveBoardCount(state, ctx) >= 25) {
        refuse("A location can have up to 25 chore boards. Archive one first.");
      }
      if (nameTaken(state, ctx, name, null)) {
        refuse("A board with that name already exists at this location.");
      }
      let s = state;
      const [s1, boardId] = nextId(s, "board");
      const [s2, cycleId] = nextId(s1, "cycle");
      s = s2;
      const colMap = new Map<string, string>();
      const rowMap = new Map<string, string>();
      const columns = source.columns
        .filter((c) => !c.archived)
        .map((c) => {
          const [next, newId] = nextId(s, "col");
          s = next;
          colMap.set(c.id, newId);
          return { ...c, id: newId };
        });
      const rows = source.rows
        .filter((r) => !r.archived)
        .map((r) => {
          const [next, newId] = nextId(s, "row");
          s = next;
          rowMap.set(r.id, newId);
          return {
            ...r,
            id: newId,
            selectedColumnIds: r.selectedColumnIds
              .map((c) => colMap.get(c))
              .filter((c): c is string => c !== undefined),
          };
        });
      const copy: ChoreBoardView = {
        ...source,
        id: boardId,
        name,
        isActive: true,
        archived: false,
        sortOrder: nextOrder(
          state.boards.filter((b) => b.locationId === ctx.locationId),
        ),
        version: 1,
        cycle: {
          id: cycleId,
          sequence: 1,
          openedAt: iso,
          businessDate: localToday(ctx),
          openedBySystem: false,
        },
        columns,
        rows,
        completions: [],
        assignments: columns.map((c) => ({
          columnId: c.id,
          profileId: c.profileId,
          assignedAt: iso,
          endedAt: null,
        })),
      };
      return { value: { ...s, boards: [...s.boards, copy] } };
    }

    case "boardsReorder": {
      if (!ctx.viewer.isManager) refuse(MANAGER_ONLY);
      const live = state.boards.filter(
        (b) => b.locationId === ctx.locationId && !b.archived,
      );
      const reordered = reorderIds(live, command.boardIds, "boards");
      const byId = new Map(reordered.map((b) => [b.id, b]));
      return {
        value: {
          ...state,
          boards: state.boards.map((b) => byId.get(b.id) ?? b),
        },
      };
    }

    case "columnSave": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      const existing =
        command.columnId === null
          ? null
          : (board.columns.find((c) => c.id === command.columnId) ?? null);
      if (command.columnId !== null && (!existing || existing.archived)) {
        refuse("That column is not available.");
      }
      if (
        command.profileId !== null &&
        command.profileId !== (existing?.profileId ?? null)
      ) {
        if (!eligible(ctx, command.profileId)) {
          refuse("Choose someone who works at this location.");
        }
        if (
          (existing === null || existing.isActive) &&
          personTaken(board, command.profileId, existing?.id ?? null)
        ) {
          refuse("That person already has a column on this board.");
        }
      }
      let label = command.label.trim();
      if (label === "" && command.profileId !== null) {
        label =
          ctx.team.find((m) => m.profileId === command.profileId)?.name ?? "";
        label = label.slice(0, 60);
      }
      if (label.length < 1 || label.length > 60) {
        refuse("Give the column a label (up to 60 characters).");
      }
      if (existing === null) {
        if (board.columns.filter((c) => !c.archived).length >= 30) {
          refuse("A board can have up to 30 columns. Remove one first.");
        }
        const [s1, columnId] = nextId(state, "col");
        const column = {
          id: columnId,
          label,
          profileId: command.profileId,
          sortOrder: nextOrder(board.columns),
          isActive: true,
          archived: false,
        };
        return {
          value: replaceBoard(s1, {
            ...board,
            columns: [...board.columns, column],
            assignments: [
              ...board.assignments,
              {
                columnId,
                profileId: command.profileId,
                assignedAt: iso,
                endedAt: null,
              },
            ],
          }),
        };
      }
      const changedPerson = existing.profileId !== command.profileId;
      return {
        value: replaceBoard(state, {
          ...board,
          columns: board.columns.map((c) =>
            c.id === existing.id
              ? { ...c, label, profileId: command.profileId }
              : c,
          ),
          assignments: changedPerson
            ? [
                ...board.assignments.map((a) =>
                  a.columnId === existing.id && a.endedAt === null
                    ? { ...a, endedAt: iso }
                    : a,
                ),
                {
                  columnId: existing.id,
                  profileId: command.profileId,
                  assignedAt: iso,
                  endedAt: null,
                },
              ]
            : board.assignments,
        }),
      };
    }

    case "columnSetState": {
      const board = state.boards.find((b) =>
        b.columns.some((c) => c.id === command.columnId),
      );
      if (!board) return refuse(NOT_FOUND);
      authorizeBoard(state, ctx, board.id, { manager: true });
      const column = board.columns.find((c) => c.id === command.columnId);
      if (!column || column.archived) refuse("That column is not available.");
      if (
        command.state === "active" &&
        personTaken(board, column?.profileId ?? null, command.columnId)
      ) {
        refuse("That person already has another column on this board.");
      }
      return {
        value: replaceBoard(state, {
          ...board,
          columns: board.columns.map((c) =>
            c.id === command.columnId
              ? {
                  ...c,
                  isActive: command.state === "active",
                  archived: command.state === "archived",
                }
              : c,
          ),
          assignments:
            command.state === "archived"
              ? board.assignments.map((a) =>
                  a.columnId === command.columnId && a.endedAt === null
                    ? { ...a, endedAt: iso }
                    : a,
                )
              : board.assignments,
        }),
      };
    }

    case "columnsReorder": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      const live = board.columns.filter((c) => !c.archived);
      const reordered = reorderIds(live, command.columnIds, "columns");
      const byId = new Map(reordered.map((c) => [c.id, c]));
      return {
        value: replaceBoard(state, {
          ...board,
          columns: board.columns.map((c) => byId.get(c.id) ?? c),
        }),
      };
    }

    case "rowSave": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      const existing =
        command.rowId === null
          ? null
          : (board.rows.find((r) => r.id === command.rowId) ?? null);
      if (command.rowId !== null && (!existing || existing.archived)) {
        refuse("That chore is not available.");
      }
      const title = command.title.trim();
      if (title.length < 1 || title.length > 120) {
        refuse("Give the chore a name (up to 120 characters).");
      }
      const instructions = command.instructions?.trim() || null;
      let selected: string[] = [];
      if (command.mode === "selected_columns") {
        selected = [...new Set(command.columnIds)];
        if (selected.length === 0) {
          refuse("Choose at least one person for a selected-people chore.");
        }
        if (
          selected.some(
            (cid) => !board.columns.some((c) => c.id === cid && !c.archived),
          )
        ) {
          refuse("Choose columns that are on this board.");
        }
      }
      if (existing === null) {
        if (board.rows.filter((r) => !r.archived).length >= 100) {
          refuse("A board can have up to 100 chores. Remove one first.");
        }
        const [s1, rowId] = nextId(state, "row");
        return {
          value: replaceBoard(s1, {
            ...board,
            rows: [
              ...board.rows,
              {
                id: rowId,
                title,
                instructions,
                isRequired: command.required,
                mode: command.mode,
                selectedColumnIds: selected,
                sortOrder: nextOrder(board.rows),
                isActive: true,
                archived: false,
              },
            ],
          }),
        };
      }
      return {
        value: replaceBoard(state, {
          ...board,
          rows: board.rows.map((r) =>
            r.id === existing.id
              ? {
                  ...r,
                  title,
                  instructions,
                  isRequired: command.required,
                  mode: command.mode,
                  selectedColumnIds: selected,
                }
              : r,
          ),
        }),
      };
    }

    case "rowSetState": {
      const board = state.boards.find((b) =>
        b.rows.some((r) => r.id === command.rowId),
      );
      if (!board) return refuse(NOT_FOUND);
      authorizeBoard(state, ctx, board.id, { manager: true });
      const row = board.rows.find((r) => r.id === command.rowId);
      if (!row || row.archived) refuse("That chore is not available.");
      return {
        value: replaceBoard(state, {
          ...board,
          rows: board.rows.map((r) =>
            r.id === command.rowId
              ? {
                  ...r,
                  isActive: command.state === "active",
                  archived: command.state === "archived",
                }
              : r,
          ),
        }),
      };
    }

    case "rowsReorder": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      const live = board.rows.filter((r) => !r.archived);
      const reordered = reorderIds(live, command.rowIds, "chores");
      const byId = new Map(reordered.map((r) => [r.id, r]));
      return {
        value: replaceBoard(state, {
          ...board,
          rows: board.rows.map((r) => byId.get(r.id) ?? r),
        }),
      };
    }

    case "cellSet": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: false,
        live: true,
      });
      const row = board.rows.find((r) => r.id === command.rowId);
      const column = board.columns.find((c) => c.id === command.columnId);
      if (!row || !column || !isLiveRow(row) || !isLiveColumn(column)) {
        refuse("That chore or column is not available.");
      }
      if (!row || !column) return { value: state };
      if (row.mode === "selected_columns" && !rowAppliesTo(row, column)) {
        refuse("That chore does not apply to this column.");
      }
      let as: ChoreEntryKind;
      if (column.profileId === ctx.viewer.profileId) as = "self";
      else if (column.profileId === null) as = "position";
      else if (board.staffAccess === "any_workforce") as = "shared";
      else if (ctx.viewer.isManager) {
        // Management authority over this location; the board switch no longer gates the
        // active run (it still gates closed-run corrections).
        as = "manager_correction";
      } else {
        return refuse("You can only update your own column on this board.");
      }
      if (!board.cycle) {
        refuse("This board is between runs. The next run has not started yet.");
      }
      if (command.cycleId && command.cycleId !== board.cycle?.id) {
        refuse("This run has already ended. Reload to see the current run.");
      }
      // F-1: a daily / weekly run whose day or week has ended is stale even while it is
      // still open. Refuse (nothing is written); the refresh rolls the run, then the
      // person checks the cell again in the current one. Tick and untick alike.
      if (runPeriodEnded(board, localToday(ctx))) {
        refuse(
          "This run has already ended for its day. Reload to see the current run, then check it again.",
        );
      }
      const present = findCompletion(board, row.id, column.id);
      if (command.done) {
        if (row.mode === "any_one") {
          const other = board.completions.find(
            (c) => c.rowId === row.id && c.columnId !== column.id,
          );
          if (other) {
            refuse(`This chore is already done by ${other.completedByName}.`);
          }
        }
        if (present) return { value: state, outcome: "unchanged" };
        const checked: ChoreBoardView = {
          ...board,
          completions: [
            ...board.completions,
            {
              rowId: row.id,
              columnId: column.id,
              completedBy: ctx.viewer.profileId,
              completedByName: ctx.viewer.name,
              completedAt: iso,
              enteredAs: as,
            },
          ],
        };
        const meta = state.structure[board.id] ?? { version: 1, start: null };
        const next = replaceBoard(
          {
            ...state,
            structure: {
              ...state.structure,
              [board.id]: {
                version: meta.version,
                start: meta.start ?? meta.version,
              },
            },
          },
          checked,
        );
        // Automatic reset: the SYSTEM closes the run the tick just finished.
        if (
          board.resetIntent === "automatic_after_completion" &&
          runReadiness(checked) === "ready"
        ) {
          let [s2, closed] = finishRun(next, checked, ctx, {
            status: "completed",
            trigger: "automatic",
            byKind: "system",
            byName: null,
            note: null,
          });
          if (board.recurrenceIntent === "continuous") {
            [s2, closed] = openRun(s2, closed, ctx, true);
          }
          return { value: replaceBoard(s2, closed), outcome: "checked_closed" };
        }
        return { value: next, outcome: "checked" };
      }
      if (!present) return { value: state, outcome: "unchanged" };
      return {
        value: replaceBoard(state, {
          ...board,
          completions: board.completions.filter(
            (c) => !(c.rowId === row.id && c.columnId === column.id),
          ),
        }),
        outcome: "unchecked",
      };
    }

    case "cycleClose": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
      });
      if (board.cycle?.id !== command.cycleId) {
        const was = state.history.find(
          (d) =>
            d.summary.cycleId === command.cycleId &&
            d.summary.boardId === board.id,
        );
        if (!was) refuse("That run does not exist or you cannot use it.");
        return { value: state, outcome: "already_closed" };
      }
      const note = command.note?.trim() || null;
      if (command.outcome === "completed") {
        if (runReadiness(board) !== "ready") {
          refuse(
            "This run is not complete yet, so it cannot be closed as completed.",
          );
        }
      } else if (!note || note.length < 3) {
        refuse("Say why you are cancelling this run (at least 3 characters).");
      }
      let [s2, closed] = finishRun(state, board, ctx, {
        status: command.outcome === "completed" ? "completed" : "cancelled",
        trigger: command.outcome === "completed" ? "manual" : "cancelled",
        byKind: "user",
        byName: ctx.viewer.name,
        note,
      });
      if (command.startNext) [s2, closed] = openRun(s2, closed, ctx, false);
      return { value: replaceBoard(s2, closed), outcome: "closed" };
    }

    case "cycleStart": {
      const board = authorizeBoard(state, ctx, command.boardId, {
        manager: true,
        live: true,
      });
      if (board.cycle) return { value: state, outcome: "already_open" };
      const [s2, started] = openRun(state, board, ctx, false);
      return { value: replaceBoard(s2, started), outcome: "started" };
    }

    case "cycleCorrect": {
      const index = state.history.findIndex(
        (d) => d.summary.cycleId === command.cycleId,
      );
      const detail = state.history[index];
      if (!detail) return refuse(NOT_FOUND);
      const board = authorizeBoard(state, ctx, detail.summary.boardId, {
        manager: true,
        allowArchived: true,
      });
      if (!board.managerOverride) {
        refuse(
          "Corrections are off for this board. Turn on manager correction in Manage → Access first.",
        );
      }
      const reason = command.reason.trim();
      if (reason.length < 3 || reason.length > 300) {
        refuse("Give a reason for the correction (3 to 300 characters).");
      }
      const row = detail.board.rows.find((r) => r.id === command.rowId);
      const column = detail.board.columns.find(
        (c) => c.id === command.columnId,
      );
      if (!row || !column) {
        return refuse("That chore or column was not part of this run.");
      }
      if (
        row.mode === "selected_columns" &&
        !row.selectedColumnIds.includes(column.id)
      ) {
        refuse("That chore did not apply to this column.");
      }
      const effective = applyCorrections(detail.board, detail.corrections);
      const before = findCompletion(effective, row.id, column.id) !== undefined;
      if (before === command.done) {
        return { value: state, outcome: "unchanged" };
      }
      if (
        command.done &&
        row.mode === "any_one" &&
        effective.completions.some(
          (c) => c.rowId === row.id && c.columnId !== column.id,
        )
      ) {
        refuse("This chore is already done by someone else in that run.");
      }
      const original = findCompletion(detail.board, row.id, column.id);
      const correction: ChoreCorrectionView = {
        id: detail.corrections.length + 1,
        rowId: row.id,
        columnId: column.id,
        doneBefore: before,
        doneAfter: command.done,
        beforeCompletedByName: original?.completedByName ?? null,
        beforeCompletedAt: original?.completedAt ?? null,
        reason,
        correctedByName: ctx.viewer.name,
        createdAt: iso,
      };
      const history = state.history.map((d, i) =>
        i === index ? { ...d, corrections: [...d.corrections, correction] } : d,
      );
      return { value: { ...state, history }, outcome: "corrected" };
    }

    case "cyclesSweep": {
      let s = state;
      let changed = 0;
      const today = localToday(ctx);
      for (const original of state.boards) {
        let board = s.boards.find((b) => b.id === original.id) ?? original;
        if (
          board.locationId !== ctx.locationId ||
          !isBoardLive(board) ||
          board.resetIntent !== "automatic_after_completion"
        ) {
          continue;
        }
        const current = periodStart(board.recurrenceIntent, today);
        if (board.cycle) {
          if (runReadiness(board) === "ready") {
            let [s2, closed] = finishRun(s, board, ctx, {
              status: "completed",
              trigger: "automatic",
              byKind: "system",
              byName: null,
              note: null,
            });
            if (board.recurrenceIntent === "continuous") {
              [s2, closed] = openRun(s2, closed, ctx, true);
            }
            s = replaceBoard(s2, closed);
            board = closed;
            changed += 1;
          } else if (runPeriodEnded(board, today)) {
            const [s2, closed] = finishRun(s, board, ctx, {
              status: "expired",
              trigger: "expired",
              byKind: "system",
              byName: null,
              note: null,
            });
            s = replaceBoard(s2, closed);
            board = closed;
            changed += 1;
          }
        }
        if (!board.cycle && current !== null) {
          const has = s.history.some(
            (d) =>
              d.summary.boardId === board.id &&
              periodStart(board.recurrenceIntent, d.summary.businessDate) ===
                current,
          );
          if (!has) {
            const [s2, started] = openRun(s, board, ctx, true);
            s = replaceBoard(s2, started);
            changed += 1;
          }
        }
      }
      return { value: s, outcome: String(changed) };
    }
  }
}

/** Finished runs the viewer may list, newest business day first (demo twin of the History read). */
export function listChoreRuns(
  state: ChoreState,
  viewer: ChoreViewer,
  filter: { month?: string | null; boardId?: string | null } = {},
): ChoreHistoryData {
  const visible = new Set(
    state.boards
      .filter((b) => viewer.isManager || isBoardLive(b))
      .map((b) => b.id),
  );
  const runs = state.history
    .map((d) => d.summary)
    .filter((r) => visible.has(r.boardId))
    .filter((r) => !filter.boardId || r.boardId === filter.boardId)
    .filter((r) => !filter.month || r.businessDate.startsWith(filter.month))
    .sort(
      (a, b) =>
        b.businessDate.localeCompare(a.businessDate) || b.sequence - a.sequence,
    );
  return { runs, truncated: false };
}

/** One finished run with its corrections (managers only), or null when it is not visible. */
export function choreRunDetail(
  state: ChoreState,
  viewer: ChoreViewer,
  cycleId: string,
): ChoreRunDetail | null {
  if (!viewer.isManager) return null;
  const detail = state.history.find((d) => d.summary.cycleId === cycleId);
  if (!detail) return null;
  const board = state.boards.find((b) => b.id === detail.summary.boardId);
  return { ...detail, canCorrect: board?.managerOverride === true };
}

/** A rows / columns change on a board bumps its structure version (cell checks and settings do not). */
function bumpStructure(before: ChoreState, after: ChoreState): ChoreState {
  let structure = after.structure;
  for (const board of after.boards) {
    const old = before.boards.find((b) => b.id === board.id);
    if (!old) continue;
    if (old.rows !== board.rows || old.columns !== board.columns) {
      const meta = structure[board.id] ?? { version: 1, start: null };
      structure = {
        ...structure,
        [board.id]: { version: meta.version + 1, start: meta.start },
      };
    }
  }
  return structure === after.structure ? after : { ...after, structure };
}

/** Apply one command; never throws. The previous state is returned untouched on refusal. */
export function applyChoreCommand(
  state: ChoreState,
  command: ChoreCommand,
  ctx: ChoreEngineContext,
): ChoreEngineResult {
  try {
    const result = apply(state, command, ctx);
    return {
      ok: true,
      value: bumpStructure(state, result.value),
      outcome: result.outcome,
    };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

/** Convenience for tests and the demo seed. */
export function progressOf(state: ChoreState, boardId: string) {
  const board = state.boards.find((b) => b.id === boardId);
  return board ? boardProgress(board) : null;
}
