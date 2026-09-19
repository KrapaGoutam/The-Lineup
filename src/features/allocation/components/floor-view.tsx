"use client";

import { useState } from "react";
import { ArrowRightLeft, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TableMap } from "@/features/allocation/components/table-map";
import type { RotationColumn } from "@/features/allocation/domain/rotation-board";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 14.
 * Tap available table -> pick a server (2 taps). Tap an occupied table ->
 * transfer or unassign. All three call the exact same `onAssign`/
 * `onUnassign` the Grid's own cell entry uses (`execute({type:"assign"|
 * "clear-cell", ...})` in allocation-workspace.tsx) -- occupancy, auto-
 * row, and undo/redo behave identically regardless of entry path.
 */
export function FloorView({
  tables,
  activeColumns,
  currentRoundId,
  disabled,
  onAssign,
  onUnassign,
}: {
  tables: ResolvedFloorTable[];
  activeColumns: RotationColumn[];
  currentRoundId: string | null;
  disabled: boolean;
  onAssign: (input: {
    label: string;
    columnId: string;
    roundId: string;
    confirmTransfer: boolean;
  }) => void;
  onUnassign: (input: { columnId: string; roundId: string }) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const selected = tables.find((table) => table.label === selectedLabel);

  function closePanel() {
    setSelectedLabel(null);
    setTransferring(false);
  }

  function selectTable(label: string) {
    setTransferring(false);
    setSelectedLabel((current) => (current === label ? null : label));
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
                {currentRoundId && assignableColumns.length ? (
                  <div className="flex flex-col gap-1.5">
                    {assignableColumns.map((column) => (
                      <Button
                        key={column.id}
                        variant="secondary"
                        size="sm"
                        disabled={disabled}
                        onClick={() => {
                          onAssign({
                            label: selected.label,
                            columnId: column.id,
                            roundId: currentRoundId,
                            confirmTransfer: false,
                          });
                          closePanel();
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
                            onAssign({
                              label: selected.label,
                              columnId: column.id,
                              roundId: selected.occupiedBy!.roundId,
                              confirmTransfer: true,
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
    </div>
  );
}
