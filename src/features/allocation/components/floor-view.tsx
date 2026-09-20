"use client";

import { useState } from "react";
import { ArrowRightLeft, LogOut, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TableMap } from "@/features/allocation/components/table-map";
import {
  findEarliestEmptyRoundForColumn,
  getActiveTablesForColumn,
  type RotationBoard,
  type RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";

type PendingAssign = {
  label: string;
  columnId: string;
  columnName: string;
  activeTables: { roundId: string; tableLabel: string }[];
};

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 14,
 * extended by Upgrade 1.1 and its multi-table follow-up. Tap available
 * table -> pick a server. Tap an occupied table -> Transfer, End Table,
 * or Unassign, acting on that one selected table only (never any other
 * table the same server might also hold).
 *
 * A server can have zero, one, or many active tables at once -- nothing
 * in the domain model limits a column to one. Picking a server for an
 * available table therefore branches on whether they already hold any:
 * zero -> assign directly, into this column's own earliest genuinely
 * empty round (`findEarliestEmptyRoundForColumn`, not a single shared
 * "current round" -- reusing one shared round across every column is
 * exactly what caused the original bug where a second assignment
 * silently collided with, and looked like it transferred, a column's
 * first one). One or more -> the decision dialog below: Assign Also,
 * Transfer, End existing table(s) & Assign, or Cancel. "End existing
 * table(s)" is a multi-select -- one, several, or every one of the
 * server's active tables can be ended in the same step (see
 * `selectedEndRoundIds` below); it is not limited to ending exactly one.
 */
export function FloorView({
  tables,
  activeColumns,
  board,
  disabled,
  onAssign,
  onUnassign,
  onTransfer,
  onEndTable,
  onEndAndAssign,
}: {
  tables: ResolvedFloorTable[];
  activeColumns: RotationColumn[];
  board: RotationBoard;
  disabled: boolean;
  onAssign: (input: {
    label: string;
    columnId: string;
    roundId: string;
    confirmTransfer: boolean;
  }) => void;
  onUnassign: (input: { columnId: string; roundId: string }) => void;
  onTransfer: (input: {
    sourceRoundId: string;
    sourceColumnId: string;
    destColumnId: string;
  }) => void;
  onEndTable: (input: { roundId: string; columnId: string }) => void;
  onEndAndAssign: (input: {
    endRoundIds: string[];
    columnId: string;
    tableLabel: string;
  }) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(
    null,
  );
  const [decisionStep, setDecisionStep] = useState<
    "choice" | "transfer-pick" | "end-pick"
  >("choice");
  // Multi-table follow-up: which of the server's active tables are
  // checked in the "End existing table(s)" multi-select. A plain Set,
  // not an array, since toggling one entry is the only mutation this
  // needs and it makes "is this one checked" an O(1) lookup in the list
  // render below.
  const [selectedEndRoundIds, setSelectedEndRoundIds] = useState<Set<string>>(
    new Set(),
  );

  const selected = tables.find((table) => table.label === selectedLabel);

  function closePanel() {
    setSelectedLabel(null);
    setTransferring(false);
  }

  function selectTable(label: string) {
    setTransferring(false);
    setSelectedLabel((current) => (current === label ? null : label));
  }

  function closeDecisionDialog() {
    setPendingAssign(null);
    setDecisionStep("choice");
    setSelectedEndRoundIds(new Set());
    // Every path out of this dialog (an action completing, or Cancel)
    // ends the Floor interaction the same way the pre-existing
    // occupied-table flow always has: deselect. Without this, the table
    // stays selected with its *old* availability baked into the local
    // `selectedLabel` toggle -- tapping the same table again would then
    // toggle the selection off instead of reopening its panel in the
    // new (now occupied) state.
    closePanel();
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

  const assignableColumns = activeColumns.filter(
    (column) => column.status === "active",
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
      <TableMap
        tables={tables}
        selectedLabel={selectedLabel}
        onSelectTable={selectTable}
        disabled={disabled}
      />
      {selected ? (
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <p className="font-mono font-semibold">
              Table {selected.label}
              {selected.resourceType === "bar_seat" ? (
                <Badge tone="neutral" className="ml-2">
                  Bar
                </Badge>
              ) : null}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={closePanel}
            >
              <X aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!selected.occupiedBy ? (
              <>
                <p className="text-muted-foreground text-xs">
                  Available — pick a server to assign it.
                </p>
                {assignableColumns.length ? (
                  <div className="flex flex-col gap-1.5">
                    {assignableColumns.map((column) => (
                      <Button
                        key={column.id}
                        variant="secondary"
                        size="sm"
                        disabled={disabled}
                        onClick={() => {
                          const activeTables = getActiveTablesForColumn(
                            board,
                            column.id,
                          );
                          if (activeTables.length === 0) {
                            assignToColumn(selected.label, column.id);
                            closePanel();
                            return;
                          }
                          // Ambiguous: this server is already serving one
                          // or more tables -- ask what the operator means
                          // instead of silently guessing (that silent
                          // guess, always overwriting into one shared
                          // round, was the original bug).
                          setPendingAssign({
                            label: selected.label,
                            columnId: column.id,
                            columnName: column.name,
                            activeTables,
                          });
                        }}
                      >
                        {column.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No active servers to assign yet.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">
                  Assigned to{" "}
                  <span
                    className="font-semibold"
                    style={{ color: selected.occupiedBy.color }}
                  >
                    {selected.occupiedBy.name}
                  </span>
                </p>
                {!transferring ? (
                  <div className="flex flex-col gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => setTransferring(true)}
                    >
                      <ArrowRightLeft aria-hidden="true" /> Transfer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        onEndTable({
                          columnId: selected.occupiedBy!.columnId,
                          roundId: selected.occupiedBy!.roundId,
                        });
                        closePanel();
                      }}
                    >
                      <LogOut aria-hidden="true" /> End table
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        onUnassign({
                          columnId: selected.occupiedBy!.columnId,
                          roundId: selected.occupiedBy!.roundId,
                        });
                        closePanel();
                      }}
                    >
                      Unassign
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground text-xs">
                      Give this table to:
                    </p>
                    {assignableColumns
                      .filter(
                        (column) => column.id !== selected.occupiedBy!.columnId,
                      )
                      .map((column) => (
                        <Button
                          key={column.id}
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          onClick={() => {
                            onTransfer({
                              sourceRoundId: selected.occupiedBy!.roundId,
                              sourceColumnId: selected.occupiedBy!.columnId,
                              destColumnId: column.id,
                            });
                            closePanel();
                          }}
                        >
                          {column.name}
                        </Button>
                      ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="h-fit">
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Tap a table to assign, transfer, or release it.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!pendingAssign}
        onClose={closeDecisionDialog}
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
                closeDecisionDialog();
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
                  // Same server, same ongoing turn -- this relabels that
                  // one existing active row in place (board_assign's own
                  // upsert-in-place, unchanged from Feature 028), not a
                  // board_transfer: the table changes, the round/entry
                  // doesn't. board_transfer is for moving a table
                  // between two *different* servers (Floor's existing
                  // occupied-table-tap flow below, untouched by this).
                  onAssign({
                    label: pendingAssign.label,
                    columnId: pendingAssign.columnId,
                    roundId: pendingAssign.activeTables[0].roundId,
                    confirmTransfer: false,
                  });
                  closeDecisionDialog();
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
                  closeDecisionDialog();
                } else {
                  setDecisionStep("end-pick");
                }
              }}
            >
              End existing table(s) & assign {pendingAssign.label}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeDecisionDialog}>
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
                  closeDecisionDialog();
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
                {selectedEndRoundIds.size} of{" "}
                {pendingAssign.activeTables.length} selected
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelectedEndRoundIds((current) =>
                    current.size === pendingAssign.activeTables.length
                      ? new Set()
                      : new Set(
                          pendingAssign.activeTables.map((t) => t.roundId),
                        ),
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
                  closeDecisionDialog();
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
    </div>
  );
}
