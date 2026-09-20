"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TableMap } from "@/features/allocation/components/table-map";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";
import {
  findEarliestEmptyRoundForColumn,
  type ColumnStatus,
  type RotationBoard,
  type RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import type { TeamMember } from "@/lib/demo-data";

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 16.
 * One card per active rotation column. Reorder/pause/resume/clear/remove
 * all call the exact same RPCs the Grid's column header controls use --
 * same global `position` order, no separate per-view state. "+ Table"
 * opens the shared TableMap (mode: server-picker) scoped to this column's
 * current round.
 */
export function ServerBoardView({
  columns,
  team,
  tables,
  board,
  disabled,
  onAssign,
  onMove,
  onSetStatus,
  onClearColumn,
}: {
  columns: RotationColumn[];
  team: TeamMember[];
  tables: ResolvedFloorTable[];
  board: RotationBoard;
  disabled: boolean;
  onAssign: (input: {
    label: string;
    columnId: string;
    roundId: string;
    confirmTransfer: boolean;
  }) => void;
  onMove: (columnId: string, direction: "up" | "down") => void;
  onSetStatus: (columnId: string, status: ColumnStatus) => void;
  onClearColumn: (columnId: string) => void;
}) {
  const [pickingForColumnId, setPickingForColumnId] = useState<string | null>(
    null,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {columns.map((column, index) => {
        const member = team.find(({ id }) => id === column.id);
        const assignedTables = tables.filter(
          (table) => table.occupiedBy?.columnId === column.id,
        );
        const paused = column.status === "paused";
        // Upgrade 1.1 (multi-table): this column's own earliest
        // genuinely empty round, not a single round shared by every
        // column -- see rotation-board.ts's own doc comment on why a
        // shared pointer caused a second assignment to silently collide
        // with (and look like it transferred) a column's existing one.
        // "+ Table" here is always additive (Assign Also), matching
        // Servers' own workload-focused UX -- Floor is the surface for
        // the ambiguous Transfer/End decision.
        const destRound = findEarliestEmptyRoundForColumn(board, column.id);
        return (
          <Card
            key={column.id}
            role="group"
            aria-label={`${column.name} server card`}
            className={paused ? "opacity-70" : undefined}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: member?.color }}
                />
                <div>
                  <p className="font-semibold">{column.name}</p>
                  <p className="text-muted-foreground text-[11px] capitalize">
                    {column.status} · #{index + 1} · {assignedTables.length}{" "}
                    table{assignedTables.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {paused ? <Badge tone="neutral">Paused</Badge> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {assignedTables.length ? (
                <div className="flex flex-wrap gap-1">
                  {assignedTables.map((table) => (
                    <Badge key={table.label} tone="success">
                      {table.label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No tables assigned.
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || !destRound}
                  onClick={() =>
                    setPickingForColumnId((current) =>
                      current === column.id ? null : column.id,
                    )
                  }
                >
                  <Plus aria-hidden="true" /> Table
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${column.name} up`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(column.id, "up")}
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${column.name} down`}
                  disabled={disabled || index === columns.length - 1}
                  onClick={() => onMove(column.id, "down")}
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    onSetStatus(column.id, paused ? "active" : "paused")
                  }
                >
                  {paused ? (
                    <Play aria-hidden="true" />
                  ) : (
                    <Pause aria-hidden="true" />
                  )}
                  {paused ? "Resume" : "Pause"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onClearColumn(column.id)}
                >
                  <RotateCcw aria-hidden="true" /> Clear
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${column.name}`}
                  disabled={disabled}
                  onClick={() => onSetStatus(column.id, "removed")}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>

              {pickingForColumnId === column.id && destRound ? (
                <TableMap
                  tables={tables}
                  selectedLabel={null}
                  disabled={disabled}
                  onSelectTable={(label) => {
                    onAssign({
                      label,
                      columnId: column.id,
                      roundId: destRound.id,
                      confirmTransfer: false,
                    });
                    setPickingForColumnId(null);
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
