import type { BoardAction } from "@/features/allocation/domain/rotation-board";

/**
 * Outcome of a mutation the Combined View asked the workspace to run.
 *
 *  - `ok: true`                the write was confirmed (or, in demo mode,
 *                              applied) -- safe to close a popup.
 *  - `ok: true, deferred`      the request needs a decision (an occupied-table
 *                              dialog opened): nothing was written yet.
 *  - `ok: false`               nothing was written; `error` is shown in place
 *                              so the host can retry.
 */
export type ExecResult =
  | { ok: true; deferred?: boolean }
  | { ok: false; error: string };

export type CombinedExecute = (action: BoardAction) => Promise<ExecResult>;

/** One assignment request; `roundId` defaults to the server's own next open turn. */
export type AssignRequest = {
  label: string;
  columnId: string;
  roundId?: string;
};

export type CombinedAssign = (request: AssignRequest) => Promise<ExecResult>;
