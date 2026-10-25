"use client";

import { useId, useState } from "react";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  LogOut,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  ActionNote,
  AssignmentSummary,
} from "@/features/allocation/components/assignment-scope-note";
import { TableMap } from "@/features/allocation/components/table-map";
import { useTableAssignmentDecision } from "@/features/allocation/components/table-assignment-decision";
import {
  getAssignmentScope,
  otherTablesInAssignment,
} from "@/features/allocation/domain/assignment-scope";
import type { ServerSummary } from "@/features/allocation/domain/board-read-model";
import {
  parseCombinedTableLabel,
  type ResolvedFloorTable,
} from "@/features/allocation/domain/floor-layout";
import {
  type ColumnStatus,
  type RotationBoard,
  type RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import type { TeamMember } from "@/lib/demo-data";

/** One table a server holds, as the Servers card shows and acts on it. */
type HeldTable = {
  label: string;
  roundId: string;
  /** Every table in the same logical assignment, this one included. */
  assignmentTables: string[];
  /** Held, but not on the floor map (so no tile exists for it). */
  offMap: boolean;
};

/**
 * #109 U4: a server's tables come from the shared read model (their active
 * board entries), NOT from which tables have a map position -- a held table
 * with no map row is still the server's table and is still actionable here.
 */
function heldTables(summary: ServerSummary | undefined): HeldTable[] {
  if (!summary) return [];
  const offMap = new Set(summary.unmappedTableLabels);
  return summary.activeAssignments.flatMap(({ roundId, label }) => {
    const assignmentTables = parseCombinedTableLabel(label);
    return assignmentTables.map((part) => ({
      label: part,
      roundId,
      assignmentTables,
      offMap: offMap.has(part),
    }));
  });
}

/** ", combined with T2" for a table that shares an assignment, else "". */
function combinedClause(table: HeldTable): string {
  const others = otherTablesInAssignment(table.assignmentTables, table.label);
  return others.length ? `, combined with ${others.join(" + ")}` : "";
}

/** One scope per combined assignment (it shows once, not once per table). */
function combinedAssignments(summary: ServerSummary | undefined) {
  return (summary?.activeAssignments ?? [])
    .map(({ label }) => getAssignmentScope(label))
    .filter((scope) => scope.combined);
}

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md section 16,
 * extended by the Floor-parity follow-up. One card per active rotation
 * column. Reorder/pause/resume/clear/remove all call the exact same RPCs
 * the Grid's column header controls use -- same global `position` order,
 * no separate per-view state.
 *
 * "+ Table" opens the shared TableMap (mode: server-picker) as a popup,
 * already scoped to this card's server -- no server-choice step, unlike
 * Floor, which always picks the table first. Selecting an available
 * table then runs through the exact same `useTableAssignmentDecision`
 * flow Floor uses (zero active tables -> assign immediately; one or more
 * -> Assign Also / Transfer / End existing table(s) & Assign / Cancel),
 * so the two surfaces can never drift into different semantics for the
 * same underlying action -- only how the operator arrives at the
 * (table, server) pair differs.
 *
 * Each already-assigned table badge is itself a button: tapping it opens
 * a small dialog scoped to *that one table* (Transfer / End table /
 * Unassign), mirroring Floor's occupied-table panel but acting only on
 * the tapped round -- a server holding T1/T3/T8 and tapping T3 never
 * touches T1 or T8.
 */
export function ServerBoardView({
  columns,
  team,
  tables,
  servers,
  tablesLoadError = false,
  board,
  disabled,
  onAssign,
  onMove,
  onSetStatus,
  onClearColumn,
  onTransfer,
  onEndTable,
  onEndAndAssign,
  onUnassign,
}: {
  columns: RotationColumn[];
  team: TeamMember[];
  tables: ResolvedFloorTable[];
  /** Per-server summaries from the shared read model (counts + held tables). */
  servers: ServerSummary[];
  tablesLoadError?: boolean;
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
  onUnassign: (input: { columnId: string; roundId: string }) => void;
}) {
  const [mapOpenForColumnId, setMapOpenForColumnId] = useState<string | null>(
    null,
  );
  const [mapError, setMapError] = useState<string | null>(null);
  // Scoped to one already-assigned table at a time -- Transfer/End
  // Table/Unassign here only ever act on this one roundId, never any
  // other table the same server might also hold.
  const [activeTableAction, setActiveTableAction] = useState<{
    roundId: string;
    columnId: string;
    tableLabel: string;
    // #109 U3: every physical table in this table's logical assignment.
    assignmentTables: string[];
  } | null>(null);
  const [transferringActiveTable, setTransferringActiveTable] = useState(false);

  const noteId = useId();
  const actionScope = getAssignmentScope(
    activeTableAction?.assignmentTables ?? [],
  );

  const decision = useTableAssignmentDecision({
    board,
    disabled,
    onAssign,
    onEndAndAssign,
  });

  function closeMap() {
    setMapOpenForColumnId(null);
    setMapError(null);
  }

  function closeTableAction() {
    setActiveTableAction(null);
    setTransferringActiveTable(false);
  }

  const mapOpenColumn = columns.find(
    (column) => column.id === mapOpenForColumnId,
  );
  const assignableColumns = columns.filter(
    (column) => column.status === "active",
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {columns.map((column, index) => {
        const member = team.find(({ id }) => id === column.id);
        const summary = servers.find(({ columnId }) => columnId === column.id);
        const assignedTables = heldTables(summary);
        const offMapTables = assignedTables.filter(({ offMap }) => offMap);
        const paused = column.status === "paused";
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
                  {offMapTables.length ? (
                    <p className="text-muted-foreground text-[11px]">
                      {offMapTables.length} not on the floor map (
                      {offMapTables.map(({ label }) => label).join(", ")})
                    </p>
                  ) : null}
                </div>
              </div>
              {paused ? <Badge tone="neutral">Paused</Badge> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {assignedTables.length ? (
                <div className="flex flex-wrap gap-1">
                  {assignedTables.map((table) => (
                    <button
                      key={table.label}
                      type="button"
                      disabled={disabled}
                      aria-label={`Table ${table.label}, assigned to ${column.name}${combinedClause(table)}${table.offMap ? ", not on the floor map" : ""} -- open table actions`}
                      onClick={() =>
                        setActiveTableAction({
                          roundId: table.roundId,
                          columnId: column.id,
                          tableLabel: table.label,
                          assignmentTables: table.assignmentTables,
                        })
                      }
                      className="rounded-full p-0.5 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Badge tone={table.offMap ? "warning" : "success"}>
                        {table.label}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No tables assigned.
                </p>
              )}
              {combinedAssignments(summary).map((scope) => (
                <p
                  key={scope.label}
                  className="text-muted-foreground text-[11px]"
                >
                  <span className="text-foreground font-medium">
                    {scope.label}
                  </span>{" "}
                  · one assignment
                </p>
              ))}

              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setMapOpenForColumnId(column.id)}
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
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={!!mapOpenForColumnId}
        onClose={closeMap}
        title={mapOpenColumn ? `Choose a table for ${mapOpenColumn.name}` : ""}
        description="Select an available physical table to assign to this server."
      >
        <TableMap
          tables={tables}
          loadError={tablesLoadError}
          selectedLabel={null}
          disabled={disabled}
          onSelectTable={(label) => {
            if (!mapOpenColumn) return;
            const table = tables.find((t) => t.label === label);
            if (table?.occupiedBy) {
              setMapError(
                `Table ${label} is already assigned to ${table.occupiedBy.name}.`,
              );
              return;
            }
            setMapOpenForColumnId(null);
            setMapError(null);
            decision.beginAssign(label, mapOpenColumn.id, mapOpenColumn.name);
          }}
        />
        {mapError ? (
          <p className="text-destructive text-xs" aria-live="polite">
            {mapError}
          </p>
        ) : null}
      </Dialog>

      {decision.dialog}

      <Dialog
        open={!!activeTableAction}
        onClose={closeTableAction}
        title={activeTableAction ? `Table ${activeTableAction.tableLabel}` : ""}
      >
        {activeTableAction && !transferringActiveTable ? (
          <div className="flex flex-col gap-1.5">
            <AssignmentSummary id={`${noteId}-summary`} scope={actionScope} />
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              aria-describedby={
                actionScope.transferNote ? `${noteId}-transfer` : undefined
              }
              onClick={() => setTransferringActiveTable(true)}
            >
              <ArrowRightLeft aria-hidden="true" /> Transfer
            </Button>
            <ActionNote
              id={`${noteId}-transfer`}
              text={actionScope.transferNote}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-describedby={
                actionScope.endNote ? `${noteId}-end` : undefined
              }
              onClick={() => {
                onEndTable({
                  roundId: activeTableAction.roundId,
                  columnId: activeTableAction.columnId,
                });
                closeTableAction();
              }}
            >
              <LogOut aria-hidden="true" /> End table
            </Button>
            <ActionNote id={`${noteId}-end`} text={actionScope.endNote} />
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-describedby={
                actionScope.unassignNote ? `${noteId}-unassign` : undefined
              }
              onClick={() => {
                onUnassign({
                  columnId: activeTableAction.columnId,
                  roundId: activeTableAction.roundId,
                });
                closeTableAction();
              }}
            >
              Unassign
            </Button>
            <ActionNote
              id={`${noteId}-unassign`}
              text={actionScope.unassignNote}
            />
            <Button variant="ghost" size="sm" onClick={closeTableAction}>
              Cancel
            </Button>
          </div>
        ) : activeTableAction ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs">
              {actionScope.combined
                ? `Give ${actionScope.label} to:`
                : "Give this table to:"}
            </p>
            {actionScope.transferNote ? (
              <p className="text-muted-foreground -mt-0.5 text-[11px]">
                {actionScope.transferNote}
              </p>
            ) : null}
            {assignableColumns
              .filter((column) => column.id !== activeTableAction.columnId)
              .map((column) => (
                <Button
                  key={column.id}
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    onTransfer({
                      sourceRoundId: activeTableAction.roundId,
                      sourceColumnId: activeTableAction.columnId,
                      destColumnId: column.id,
                    });
                    closeTableAction();
                  }}
                >
                  {column.name}
                </Button>
              ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTransferringActiveTable(false)}
            >
              Back
            </Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
