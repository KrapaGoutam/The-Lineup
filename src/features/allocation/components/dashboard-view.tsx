"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";
import type {
  RotationBoard,
  RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import type { CrossEditEntry } from "@/features/allocation/data/allocation-data";

/**
 * Table Rotation Multi-View, IMPLEMENTATION_CONTRACT.md sections 17-18.
 * Operational summary + a read-only Master Rotation. Master Rotation is a
 * purpose-built read-only table over the same `board` data, not a second
 * instance of the interactive Grid component (that component isn't
 * factored out of allocation-workspace.tsx yet) -- same data, same
 * "Turn" + server-column shape, no mutation controls, with an obvious
 * route back to the editable Grid.
 */
export function DashboardView({
  columns,
  board,
  tables,
  nextColumn,
  crossEditLog,
  onOpenGrid,
}: {
  columns: RotationColumn[];
  board: RotationBoard;
  tables: ResolvedFloorTable[];
  nextColumn: RotationColumn | undefined;
  crossEditLog: CrossEditEntry[];
  onOpenGrid: () => void;
}) {
  const activeColumns = columns.filter((c) => c.status === "active");
  const activeTables = tables.filter((t) => t.occupiedBy);
  const availableTables = tables.filter((t) => !t.occupiedBy);

  return (
    <div className="space-y-4">
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Floor dashboard"
      >
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Servers on floor
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {activeColumns.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Next turn
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {nextColumn?.name.split(" ")[0] ?? "New round"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Active tables
            </p>
            <p className="mt-2 text-2xl font-semibold">{activeTables.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Available tables
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {availableTables.length}
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Upcoming rotation</h2>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {activeColumns.length ? (
              activeColumns.map((column, index) => (
                <p key={column.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground font-mono text-xs">
                    #{index + 1}
                  </span>
                  {column.name}
                  {column.id === nextColumn?.id ? (
                    <Badge tone="accent">Next</Badge>
                  ) : null}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">
                No active servers yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Recent activity</h2>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {crossEditLog.length ? (
              crossEditLog
                .slice(-5)
                .reverse()
                .map((entry, index) => (
                  <p key={index} className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {entry.actorName}
                    </span>{" "}
                    edited {entry.columnName}&apos;s column
                  </p>
                ))
            ) : (
              <p className="text-muted-foreground">
                No recent cross-column edits.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Master Rotation</h2>
            <p className="text-muted-foreground text-xs">
              Read-only. Switch to Grid to edit.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenGrid}>
            Open Grid
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pt-4">
          <div className="border-border min-w-max border-t">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `72px repeat(${Math.max(activeColumns.length, 1)}, minmax(140px, 1fr))`,
              }}
            >
              <div className="border-border bg-secondary text-muted-foreground sticky left-0 z-10 border-r p-3 text-xs font-semibold">
                Turn
              </div>
              {activeColumns.map((column) => (
                <div
                  key={column.id}
                  className="border-border bg-secondary truncate border-r p-3 text-sm font-semibold last:border-r-0"
                >
                  {column.name}
                </div>
              ))}
              {board.rounds.map((round) => (
                <div className="contents" key={round.id}>
                  <div className="border-border bg-card sticky left-0 flex min-h-14 items-center justify-center border-t border-r p-2 font-mono text-sm font-bold">
                    {round.sequence}
                  </div>
                  {activeColumns.map((column) => {
                    const cell = round.cells.find(
                      ({ columnId }) => columnId === column.id,
                    );
                    return (
                      <div
                        key={`${round.id}-${column.id}`}
                        className="border-border min-h-14 border-t border-r p-3 text-sm last:border-r-0"
                      >
                        {cell?.status === "skipped" ? (
                          <span role="status" aria-label="Skip turn">
                            0
                          </span>
                        ) : cell?.status === "ended" ? (
                          <span className="text-muted-foreground line-through decoration-2">
                            {cell.tableLabel}
                          </span>
                        ) : (
                          (cell?.tableLabel ?? (
                            <span className="text-muted-foreground">—</span>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
