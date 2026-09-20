"use client";

import { useState } from "react";
import { ArrowRightLeft, LogOut, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TableMap } from "@/features/allocation/components/table-map";
import { useTableAssignmentDecision } from "@/features/allocation/components/table-assignment-decision";
import type {
  RotationBoard,
  RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import {
  getInitials,
  type ResolvedFloorTable,
} from "@/features/allocation/domain/floor-layout";
import type { TeamMember } from "@/lib/demo-data";

/**
 * Floor ownership visual follow-up: a compact "who's on the floor and
 * how many tables do they hold right now" strip, supporting information
 * alongside the table tiles' own initials -- never the only place
 * ownership is legible. One entry per currently active-on-floor column
 * (paused/removed servers are excluded, matching the same
 * `assignableColumns` set Floor already uses for "pick a server"),
 * including servers who currently hold zero active tables, so it reads
 * as "the floor team," not just "who has a table right now." Overflow
 * scrolls horizontally rather than wrapping, the same working pattern
 * already proven for the view-switcher tabs (see
 * allocation-workspace.tsx's own comment on that) -- reliable no-page-
 * overflow behavior at any width, including mobile.
 */
function FloorLegend({
  entries,
}: {
  entries: {
    id: string;
    name: string;
    initials: string;
    color: string;
    activeTableCount: number;
  }[];
}) {
  if (!entries.length) return null;
  return (
    <div
      className="border-border bg-muted/20 flex w-full max-w-full gap-2 overflow-x-auto rounded-lg border p-2"
      role="list"
      aria-label="Server legend"
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          role="listitem"
          className="border-border bg-card flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="font-mono font-bold">{entry.initials}</span>
          <span>{entry.name}</span>
          <span className="text-muted-foreground">
            · {entry.activeTableCount}{" "}
            {entry.activeTableCount === 1 ? "table" : "tables"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 14,
 * extended by Upgrade 1.1 and its multi-table follow-up. Tap available
 * table -> pick a server. Tap an occupied table -> Transfer, End Table,
 * or Unassign, acting on that one selected table only (never any other
 * table the same server might also hold).
 *
 * A server can have zero, one, or many active tables at once -- nothing
 * in the domain model limits a column to one. Picking a server for an
 * available table therefore branches on whether they already hold any
 * (see `useTableAssignmentDecision`, shared with Server Board): zero ->
 * assign directly, into this column's own earliest genuinely empty round
 * -- not a single shared "current round" -- reusing one shared round
 * across every column is exactly what caused the original bug where a
 * second assignment silently collided with, and looked like it
 * transferred, a column's first one. One or more -> the decision dialog:
 * Assign Also, Transfer, End existing table(s) & Assign, or Cancel. "End
 * existing table(s)" is a multi-select -- one, several, or every one of
 * the server's active tables can be ended in the same step, not limited
 * to ending exactly one.
 */
export function FloorView({
  tables,
  tablesLoadError = false,
  activeColumns,
  team,
  board,
  disabled,
  onAssign,
  onUnassign,
  onTransfer,
  onEndTable,
  onEndAndAssign,
}: {
  tables: ResolvedFloorTable[];
  tablesLoadError?: boolean;
  activeColumns: RotationColumn[];
  team: TeamMember[];
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

  const selected = tables.find((table) => table.label === selectedLabel);

  function closePanel() {
    setSelectedLabel(null);
    setTransferring(false);
  }

  function selectTable(label: string) {
    setTransferring(false);
    setSelectedLabel((current) => (current === label ? null : label));
  }

  // Every path out of the decision dialog (an action completing, or
  // Cancel) ends the Floor interaction the same way the pre-existing
  // occupied-table flow always has: deselect. Without this, the table
  // stays selected with its *old* availability baked into the local
  // `selectedLabel` toggle -- tapping the same table again would then
  // toggle the selection off instead of reopening its panel in the new
  // (now occupied) state.
  const decision = useTableAssignmentDecision({
    board,
    disabled,
    onAssign,
    onEndAndAssign,
    onClosed: closePanel,
  });

  const assignableColumns = activeColumns.filter(
    (column) => column.status === "active",
  );

  // Legend entries: active-table count derived from the same `tables`
  // (resolveFloorTables) prop the map itself renders from -- Ended/
  // Unassigned rows are already excluded there, and a Transfer's count
  // moves from the old column to the new one automatically, since it's
  // just a fresh read of current occupancy each render, not a separate
  // running tally.
  const legendEntries = assignableColumns.map((column) => {
    const member = team.find((m) => m.id === column.id);
    return {
      id: column.id,
      name: column.name,
      initials: getInitials(column.name),
      color: member?.color ?? "var(--muted-foreground)",
      activeTableCount: tables.filter(
        (table) => table.occupiedBy?.columnId === column.id,
      ).length,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <FloorLegend entries={legendEntries} />
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <TableMap
          tables={tables}
          loadError={tablesLoadError}
          selectedLabel={selectedLabel}
          onSelectTable={selectTable}
          disabled={disabled}
        />
        {selected?.occupiedBy ? (
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

      {/* Floor UX follow-up: an AVAILABLE table's "pick a server" flow is
          a popup, not an always-visible section below the map -- see
          TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md section 11. The
          occupied-table panel above is unaffected. */}
      <Dialog
        open={!!selected && !selected.occupiedBy}
        onClose={closePanel}
        title={selected ? `Assign ${selected.label}` : ""}
        description="Available. Select a server to assign this table to."
      >
        {selected && assignableColumns.length ? (
          <div className="flex flex-col gap-1.5">
            {assignableColumns.map((column) => (
              <Button
                key={column.id}
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  // The popup itself always closes on a server pick --
                  // the shared decision hook then either assigns
                  // immediately (zero active tables) or opens its own
                  // dialog on top (one or more), same as Server Board's
                  // identical popup -> decision flow.
                  closePanel();
                  decision.beginAssign(selected.label, column.id, column.name);
                }}
              >
                {column.name}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        ) : selected ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs">
              No active servers to assign yet.
            </p>
            <Button variant="ghost" size="sm" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        ) : null}
      </Dialog>

      {decision.dialog}
    </div>
  );
}
