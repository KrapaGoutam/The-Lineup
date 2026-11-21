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
  ChoreEntryKind,
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
};

export function emptyChoreState(): ChoreState {
  return { boards: [], seq: 1 };
}

export type ChoreEngineContext = {
  viewer: ChoreViewer;
  /** Active, workforce-eligible people (the assignee roster). */
  team: readonly TaskTeamMember[];
  organizationId: string;
  locationId: string;
  now: Date;
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
    }));
  return { boards: sortByOrder(boards) };
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
          cycle: { id: cycleId, sequence: 1, openedAt: iso },
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
        cycle: { id: cycleId, sequence: 1, openedAt: iso },
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
      else if (board.managerOverride && ctx.viewer.isManager) {
        as = "manager_correction";
      } else {
        return refuse("You can only update your own column on this board.");
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
        return {
          value: replaceBoard(state, {
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
          }),
          outcome: "checked",
        };
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
  }
}

/** Apply one command; never throws. The previous state is returned untouched on refusal. */
export function applyChoreCommand(
  state: ChoreState,
  command: ChoreCommand,
  ctx: ChoreEngineContext,
): ChoreEngineResult {
  try {
    const result = apply(state, command, ctx);
    return { ok: true, value: result.value, outcome: result.outcome };
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
