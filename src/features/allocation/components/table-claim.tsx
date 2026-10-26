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
 *   same-server  -> a concise notice, no mutation
 *   held         -> this dialog: Transfer / End + Assign / Cancel
 *
 * Transfer is the existing trusted `transfer` action (the holder's WHOLE
 * assignment moves). End + Assign is a single atomic `assign` with
 * `confirmTransfer` + `endWholeAssignment` (the holder's WHOLE assignment is
 * ended, history kept, then a new active entry is created) -- never two calls
 * with a gap between them.
 */
export type ClaimRequest = {
  label: string;
  columnId: string;
  /** The cell being written, when the caller chose one (Grid, Picker). */
  roundId?: string | null;
};

type Held = Extract<ClaimVerdict, { kind: "held" }>;

type Pending = ClaimRequest & { verdict: Held };

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
    });
    close();
  }

  function transfer() {
    if (!pending || pending.verdict.holders.length !== 1) return;
    const holder = pending.verdict.holders[0];
    onTransfer({
      sourceRoundId: holder.roundId,
      sourceColumnId: holder.columnId,
      destColumnId: pending.columnId,
    });
    close();
  }

  const copy = pending
    ? describeHeldConflict(pending.verdict, {
        wantedLabel: pending.label,
        requesterName: nameOf(pending.columnId),
        holderName: nameOf,
      })
    : null;

  const dialog = (
    <Dialog
      open={!!pending}
      onClose={close}
      title={copy?.title ?? ""}
      description={copy?.description}
    >
      {copy ? (
        <div className="flex flex-col gap-1.5">
          {copy.transferLabel ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={transfer}
            >
              {copy.transferLabel}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={endAndAssign}
          >
            {copy.endAndAssignLabel}
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
