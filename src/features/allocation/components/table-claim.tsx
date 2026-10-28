"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  findEarliestEmptyRoundForColumn,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import {
  classifyTableClaim,
  describeHeldConflict,
  describeSameServer,
  describeSameServerRepeat,
  verdictFromServerConflict,
  type ClaimVerdict,
  type TableConflictInfo,
} from "@/features/allocation/domain/table-conflict";

/**
 * Cross-view integrity (X2) -- the ONE occupied-table flow. Grid, Floor,
 * Picker and Servers all ask this hook before they assign; none of them has a
 * rule of its own. Dashboard is read-only and has no assign action.
 *
 *   free         -> the caller's normal assign path runs
 *   same-server  -> a concise notice, no mutation (same or later turn)
 *   same-server-repeat -> End Previous + Assign / Cancel (#166: the same
 *                   server reaching a later turn that gets the same table)
 *   held         -> this dialog: Transfer / End + Assign / Cancel
 *
 * Transfer is the existing trusted `transfer` action (the holder's WHOLE
 * assignment moves). End + Assign is a single atomic `assign` with
 * `confirmTransfer` + `endWholeAssignment` (the holder's WHOLE assignment is
 * ended, history kept, then a new active entry is created) -- never two calls
 * with a gap between them. End Previous + Assign is the same shape with
 * `endPrevious` (the server's OWN earlier assignment ends, whole).
 */
export type ClaimRequest = {
  label: string;
  columnId: string;
  /** The cell being written, when the caller chose one (Grid, Picker). */
  roundId?: string | null;
  /**
   * Set when a confirmed End Previous + Assign was refused again by the
   * database for another table (a mixed repeat): the follow-up decision must
   * keep ending the server's previous assignment.
   */
  endPrevious?: boolean;
};

type Held = Extract<ClaimVerdict, { kind: "held" }>;
type Repeat = Extract<ClaimVerdict, { kind: "same-server-repeat" }>;

type Pending = ClaimRequest & { verdict: Held | Repeat };

export function useTableClaim({
  board,
  disabled,
  canonicalize = (label) => label,
  onAssign,
  onTransfer,
  onNotice,
}: {
  board: RotationBoard;
  disabled: boolean;
  /**
   * Resolve typed shorthand to the canonical table label ("1" -> "T1" when T1
   * is registered; see domain/table-input.ts). The claim is classified, shown
   * and assigned on the canonical label, exactly as the database will store
   * it. The database re-resolves regardless.
   */
  canonicalize?: (label: string) => string;
  /** The caller's trusted assign (workspace `execute({ type: "assign" })`). */
  onAssign: (input: {
    label: string;
    columnId: string;
    roundId: string;
    confirmTransfer: boolean;
    endWholeAssignment: boolean;
    endPrevious: boolean;
  }) => void;
  onTransfer: (input: {
    sourceRoundId: string;
    sourceColumnId: string;
    destColumnId: string;
  }) => void;
  onNotice: (message: string) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);

  const nameOf = (columnId: string) =>
    board.columns.find(({ id }) => id === columnId)?.name ?? "another server";

  function present(request: ClaimRequest, verdict: ClaimVerdict): boolean {
    if (verdict.kind === "free") return false;
    if (verdict.kind === "same-server") {
      onNotice(describeSameServer(verdict.tables, nameOf(request.columnId)));
      return true;
    }
    // A stale confirmation that the database still refuses as blocked would
    // loop forever as a dialog; only a first-time repeat opens one.
    if (verdict.kind === "same-server-repeat" && request.endPrevious) {
      onNotice(describeSameServer(verdict.tables, nameOf(request.columnId)));
      return true;
    }
    setPending({ ...request, verdict });
    return true;
  }

  /**
   * Classify against the live board. Returns true when the request was
   * handled here (notice shown or dialog opened) and the caller must stop;
   * false when the table is free and the caller should assign normally.
   */
  function intercept(rawRequest: ClaimRequest): boolean {
    const request = { ...rawRequest, label: canonicalize(rawRequest.label) };
    return present(
      request,
      classifyTableClaim(board, {
        label: request.label,
        columnId: request.columnId,
        targetRoundId: request.roundId,
      }),
    );
  }

  /** Stale-client path: the database said the table is held (PT409). */
  function presentServerConflict(
    rawRequest: ClaimRequest,
    info: TableConflictInfo,
  ) {
    const request = { ...rawRequest, label: canonicalize(rawRequest.label) };
    present(request, verdictFromServerConflict(info, request.label));
  }

  function close() {
    setPending(null);
  }

  function endAndAssign() {
    if (!pending) return;
    const roundId =
      pending.roundId ??
      findEarliestEmptyRoundForColumn(board, pending.columnId)?.id;
    if (!roundId) return;
    onAssign({
      label: pending.label,
      columnId: pending.columnId,
      roundId,
      confirmTransfer: true,
      endWholeAssignment: true,
      endPrevious: pending.endPrevious ?? false,
    });
    close();
  }

  /** Same-server repeat: end this server's previous assignment, then assign. */
  function endPrevious() {
    if (!pending || pending.verdict.kind !== "same-server-repeat") return;
    const roundId =
      pending.roundId ??
      findEarliestEmptyRoundForColumn(board, pending.columnId)?.id;
    if (!roundId) return;
    onAssign({
      label: pending.label,
      columnId: pending.columnId,
      roundId,
      confirmTransfer: false,
      endWholeAssignment: false,
      endPrevious: true,
    });
    close();
  }

  function transfer() {
    if (!pending || pending.verdict.kind !== "held") return;
    if (pending.verdict.holders.length !== 1) return;
    const holder = pending.verdict.holders[0];
    onTransfer({
      sourceRoundId: holder.roundId,
      sourceColumnId: holder.columnId,
      destColumnId: pending.columnId,
    });
    close();
  }

  const repeatCopy =
    pending?.verdict.kind === "same-server-repeat"
      ? describeSameServerRepeat(pending.verdict, {
          wantedLabel: pending.label,
          serverName: nameOf(pending.columnId),
        })
      : null;
  const heldCopy =
    pending?.verdict.kind === "held"
      ? describeHeldConflict(pending.verdict, {
          wantedLabel: pending.label,
          requesterName: nameOf(pending.columnId),
          holderName: nameOf,
        })
      : null;
  const copy = repeatCopy ?? heldCopy;

  const dialog = (
    <Dialog
      open={!!pending}
      onClose={close}
      title={copy?.title ?? ""}
      description={copy?.description}
    >
      {repeatCopy ? (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={endPrevious}
          >
            {repeatCopy.endPreviousLabel}
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
      ) : heldCopy ? (
        <div className="flex flex-col gap-1.5">
          {heldCopy.transferLabel && !pending?.endPrevious ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={transfer}
            >
              {heldCopy.transferLabel}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={endAndAssign}
          >
            {heldCopy.endAndAssignLabel}
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
      ) : null}
    </Dialog>
  );

  return { intercept, presentServerConflict, dialog, pending };
}
