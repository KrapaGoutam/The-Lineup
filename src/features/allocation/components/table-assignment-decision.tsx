"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  findEarliestEmptyRoundForColumn,
  getActiveTablesForColumn,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";

type PendingAssign = {
  label: string;
  columnId: string;
  columnName: string;
  activeTables: { roundId: string; tableLabel: string }[];
};

/**
 * Table Rotation Multi-View Upgrade 1.1, Picker/Server follow-up. Floor
 * and Server Board both need the identical "this server already has
 * active tables, what do you want to do with the new one" decision --
 * Assign Also, Transfer an existing table (same server, relabel in
 * place), End existing table(s) & Assign, or Cancel. Extracted out of
 * `floor-view.tsx` (where it originated) so Server Board can reuse the
 * exact same semantics instead of a second implementation that could
 * drift -- see ARCHITECTURE.md's "shared domain, differing UI context"
 * note. The two callers differ only in how they arrive at a (label,
 * columnId, columnName) triple: Floor picks the table first, then the
 * server; Server Board already knows the server from its own card, and
 * picks the table via its own `+ Table` popup.
 */
export function useTableAssignmentDecision({
  board,
  disabled,
  onAssign,
  onEndAndAssign,
  onClosed,
}: {
  board: RotationBoard;
  disabled: boolean;
  onAssign: (input: {
    label: string;
    columnId: string;
    roundId: string;
    confirmTransfer: boolean;
  }) => void;
  onEndAndAssign: (input: {
    endRoundIds: string[];
    columnId: string;
    tableLabel: string;
  }) => void;
  // Called every time the dialog fully closes, whether via Cancel, ESC,
  // backdrop, or an action completing -- lets a caller like Floor keep
  // its own separate selection state (the tapped table's side panel) in
  // sync, the same way it always deselected on any exit from this flow.
  onClosed?: () => void;
}) {
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(
    null,
  );
  const [decisionStep, setDecisionStep] = useState<
    "choice" | "transfer-pick" | "end-pick"
  >("choice");
  const [selectedEndRoundIds, setSelectedEndRoundIds] = useState<Set<string>>(
    new Set(),
  );

  function close() {
    setPendingAssign(null);
    setDecisionStep("choice");
    setSelectedEndRoundIds(new Set());
    onClosed?.();
  }

  function toggleEndRoundId(roundId: string) {
    setSelectedEndRoundIds((current) => {
      const next = new Set(current);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  }

  function assignToColumn(label: string, columnId: string) {
    const destRound = findEarliestEmptyRoundForColumn(board, columnId);
    if (!destRound) return; // defensive: ensureTrailingRound always keeps one available
    onAssign({
      label,
      columnId,
      roundId: destRound.id,
      confirmTransfer: false,
    });
  }

  /**
   * Zero active tables -> assigns immediately and returns false (nothing
   * for the caller to wait on). One or more -> opens the decision dialog
   * and returns true, so a caller with its own selection panel (Floor)
   * knows not to close it out from under the now-open dialog.
   */
  function beginAssign(
    label: string,
    columnId: string,
    columnName: string,
  ): boolean {
    const activeTables = getActiveTablesForColumn(board, columnId);
    if (activeTables.length === 0) {
      assignToColumn(label, columnId);
      return false;
    }
    setPendingAssign({ label, columnId, columnName, activeTables });
    return true;
  }

  const dialog = (
    <Dialog
      open={!!pendingAssign}
      onClose={close}
      title={
        pendingAssign
          ? `${pendingAssign.columnName} already has active tables`
          : ""
      }
      description={
        pendingAssign
          ? `${pendingAssign.columnName} is currently serving ${pendingAssign.activeTables
              .map((t) => t.tableLabel)
              .join(
                ", ",
              )}. What should happen with Table ${pendingAssign.label}?`
          : undefined
      }
    >
      {pendingAssign && decisionStep === "choice" ? (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              assignToColumn(pendingAssign.label, pendingAssign.columnId);
              close();
            }}
          >
            + Assign {pendingAssign.label} also
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              if (pendingAssign.activeTables.length === 1) {
                // Same server, same ongoing turn -- this relabels that one
                // existing active row in place (board_assign's own
                // upsert-in-place), not a board_transfer: the table
                // changes, the round/entry doesn't. board_transfer is for
                // moving a table between two *different* servers.
                onAssign({
                  label: pendingAssign.label,
                  columnId: pendingAssign.columnId,
                  roundId: pendingAssign.activeTables[0].roundId,
                  confirmTransfer: false,
                });
                close();
              } else {
                setDecisionStep("transfer-pick");
              }
            }}
          >
            Transfer an existing table
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              if (pendingAssign.activeTables.length === 1) {
                onEndAndAssign({
                  endRoundIds: [pendingAssign.activeTables[0].roundId],
                  columnId: pendingAssign.columnId,
                  tableLabel: pendingAssign.label,
                });
                close();
              } else {
                setDecisionStep("end-pick");
              }
            }}
          >
            End existing table(s) & assign {pendingAssign.label}
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
      ) : null}

      {pendingAssign && decisionStep === "transfer-pick" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs">
            Which table should be replaced by {pendingAssign.label}?
          </p>
          {pendingAssign.activeTables.map((table) => (
            <Button
              key={table.roundId}
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onAssign({
                  label: pendingAssign.label,
                  columnId: pendingAssign.columnId,
                  roundId: table.roundId,
                  confirmTransfer: false,
                });
                close();
              }}
            >
              {table.tableLabel} → {pendingAssign.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDecisionStep("choice")}
          >
            Back
          </Button>
        </div>
      ) : null}

      {pendingAssign && decisionStep === "end-pick" ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Select one or more tables to end before assigning{" "}
            {pendingAssign.label}.
          </p>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              {selectedEndRoundIds.size} of {pendingAssign.activeTables.length}{" "}
              selected
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelectedEndRoundIds((current) =>
                  current.size === pendingAssign.activeTables.length
                    ? new Set()
                    : new Set(pendingAssign.activeTables.map((t) => t.roundId)),
                )
              }
            >
              {selectedEndRoundIds.size === pendingAssign.activeTables.length
                ? "Clear all"
                : "Select all"}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {pendingAssign.activeTables.map((table) => (
              <label
                key={table.roundId}
                className="border-border has-checked:border-primary/60 has-checked:bg-primary/10 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selectedEndRoundIds.has(table.roundId)}
                  onChange={() => toggleEndRoundId(table.roundId)}
                />
                {table.tableLabel}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || selectedEndRoundIds.size === 0}
              onClick={() => {
                onEndAndAssign({
                  endRoundIds: [...selectedEndRoundIds],
                  columnId: pendingAssign.columnId,
                  tableLabel: pendingAssign.label,
                });
                close();
              }}
            >
              End {selectedEndRoundIds.size}{" "}
              {selectedEndRoundIds.size === 1 ? "Table" : "Tables"} & Assign{" "}
              {pendingAssign.label}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDecisionStep("choice")}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );

  return { pendingAssign, beginAssign, close, dialog };
}
