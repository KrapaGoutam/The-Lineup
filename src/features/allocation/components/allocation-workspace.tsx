"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Eraser,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  UserPlus,
  UsersRound,
} from "lucide-react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  mayWriteColumn,
  redoBoard,
  undoBoard,
  type BoardAction,
  type BoardHistory,
} from "@/features/allocation/domain/rotation-board";
import { team } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

function buildInitialHistory() {
  let history = createBoardHistory(
    createRotationBoard(
      team.slice(0, 4).map((member, position) => ({
        id: member.id,
        name: member.name,
        position,
        status: "active" as const,
      })),
    ),
  );
  const first = history.present.rounds[0].id;
  for (const [columnId, tableLabel] of [
    ["mia", "12"],
    ["leo", "8"],
    ["ava", "21 + 22"],
    ["noah", "4"],
  ]) {
    history = executeBoardAction(history, {
      type: "assign",
      roundId: first,
      columnId,
      tableLabel,
    });
  }
  const second = history.present.rounds.at(-1)!.id;
  for (const [columnId, tableLabel] of [
    ["mia", "15"],
    ["leo", "10"],
  ]) {
    history = executeBoardAction(history, {
      type: "assign",
      roundId: second,
      columnId,
      tableLabel,
    });
  }
  return { past: [], present: history.present, future: [] };
}

function TableEntry({
  value,
  disabled,
  onSubmit,
}: {
  value: string | null;
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget).get("table");
    if (typeof input === "string" && input.trim()) {
      onSubmit(input);
      event.currentTarget.reset();
    }
  }
  if (value) {
    return (
      <div className="border-border bg-background/80 flex min-h-14 items-center justify-between rounded-xl border px-3">
        <span className="font-mono text-sm font-bold">Table {value}</span>
        <span
          className="size-2 rounded-full bg-emerald-300"
          aria-label="Recorded"
        />
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex min-h-14 gap-2">
      <Input
        name="table"
        aria-label="Table number or combined tables"
        placeholder={disabled ? "Not available" : "Table #"}
        disabled={disabled}
        className="min-w-0 font-mono"
      />
      <Button
        size="icon"
        type="submit"
        disabled={disabled}
        aria-label="Add table"
      >
        <Plus aria-hidden="true" />
      </Button>
    </form>
  );
}

export function AllocationWorkspace({ user }: { user: SignedInUser }) {
  const isManager = user.role !== "server";
  const [history, setHistory] = useState<BoardHistory>(buildInitialHistory);
  const [eventCount, setEventCount] = useState(6);
  const board = history.present;
  const visibleColumns = useMemo(
    () =>
      board.columns
        .filter(({ status }) => status !== "removed")
        .sort((a, b) => a.position - b.position),
    [board.columns],
  );
  const availableMembers = team.filter(
    (member) => !visibleColumns.some(({ id }) => id === member.id),
  );
  const currentRound = board.rounds.at(-1);
  const nextColumn = visibleColumns.find(
    (column) =>
      column.status === "active" &&
      !currentRound?.cells.find((cell) => cell.columnId === column.id)
        ?.tableLabel,
  );

  function execute(action: BoardAction) {
    setHistory((current) => executeBoardAction(current, action));
    setEventCount((count) => count + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Module 2</Badge>
            <Badge tone="success">
              <span className="size-1.5 rounded-full bg-emerald-300" /> Live
              board
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            Table allocation rotation
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Add each table as it is assigned. The next row opens automatically
            when every active server has a turn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setHistory((current) => undoBoard(current))}
            disabled={history.past.length === 0}
          >
            <Undo2 aria-hidden="true" /> Undo
          </Button>
          <Button
            variant="secondary"
            onClick={() => setHistory((current) => redoBoard(current))}
            disabled={history.future.length === 0}
          >
            <Redo2 aria-hidden="true" /> Redo
          </Button>
          {isManager ? (
            <Button
              variant="outline"
              onClick={() => execute({ type: "clear-board" })}
            >
              <Eraser aria-hidden="true" /> Clear board
            </Button>
          ) : null}
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Allocation summary"
      >
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Servers on floor
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {
                visibleColumns.filter(({ status }) => status === "active")
                  .length
              }
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
              Recorded events
            </p>
            <p className="mt-2 text-2xl font-semibold">{eventCount}</p>
          </CardContent>
        </Card>
      </section>

      {isManager && availableMembers.length ? (
        <Card className="border-primary/15">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                <UserPlus className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">Floor team changed?</p>
                <p className="text-muted-foreground text-xs">
                  Add a server column without rebuilding the board.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableMembers.map((member) => (
                <Button
                  key={member.id}
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    execute({
                      type: "add-column",
                      column: {
                        id: member.id,
                        name: member.name,
                        position: board.columns.length,
                        status: "active",
                      },
                    })
                  }
                >
                  <Plus aria-hidden="true" /> {member.shortName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
              <UsersRound className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Dinner rotation</h2>
              <p className="text-muted-foreground text-xs">
                Scrollable on smaller screens · combined tables accepted
              </p>
            </div>
          </div>
          <Badge tone="neutral">{board.rounds.length} rows</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pt-5">
          <div className="border-border min-w-max border-t">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `72px repeat(${visibleColumns.length}, minmax(190px, 1fr))`,
              }}
            >
              <div className="border-border bg-secondary text-muted-foreground sticky left-0 z-20 border-r p-3 text-xs font-semibold">
                Turn
              </div>
              {visibleColumns.map((column) => {
                const member = team.find(({ id }) => id === column.id);
                const own = column.id === user.profileId;
                return (
                  <div
                    key={column.id}
                    className={cn(
                      "border-border bg-secondary border-r p-3 last:border-r-0",
                      own && "bg-primary/10",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: member?.color }}
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {column.name}
                      </p>
                      {own ? <Badge tone="accent">You</Badge> : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-[11px] capitalize">
                      {column.status}
                    </p>
                    {isManager ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            execute({
                              type: "set-column-status",
                              columnId: column.id,
                              status:
                                column.status === "paused"
                                  ? "active"
                                  : "paused",
                            })
                          }
                        >
                          {column.status === "paused" ? <Play /> : <Pause />}
                          {column.status === "paused" ? "Resume" : "Pause"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            execute({
                              type: "clear-column",
                              columnId: column.id,
                            })
                          }
                        >
                          <RotateCcw /> Clear
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${column.name}`}
                          onClick={() =>
                            execute({
                              type: "set-column-status",
                              columnId: column.id,
                              status: "removed",
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {board.rounds.map((round) => (
                <div className="contents" key={round.id}>
                  <div className="border-border bg-card sticky left-0 z-10 flex min-h-20 flex-col items-center justify-center border-t border-r p-2">
                    <span className="font-mono text-sm font-bold">
                      {round.sequence}
                    </span>
                    {isManager ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 size-8 min-h-8"
                        aria-label={`Clear row ${round.sequence}`}
                        onClick={() =>
                          execute({ type: "clear-row", roundId: round.id })
                        }
                      >
                        <Eraser className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                  {visibleColumns.map((column) => {
                    const cell = round.cells.find(
                      ({ columnId }) => columnId === column.id,
                    );
                    const canWrite =
                      column.status === "active" &&
                      mayWriteColumn({
                        isManager,
                        profileId: user.profileId,
                        columnId: column.id,
                      });
                    return (
                      <div
                        key={`${round.id}-${column.id}`}
                        className={cn(
                          "border-border min-h-20 border-t border-r p-3 last:border-r-0",
                          column.status === "paused" && "bg-black/20",
                        )}
                      >
                        <TableEntry
                          value={cell?.tableLabel ?? null}
                          disabled={!canWrite}
                          onSubmit={(tableLabel) =>
                            execute({
                              type: "assign",
                              roundId: round.id,
                              columnId: column.id,
                              tableLabel,
                            })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Undo and redo restore the previous board state. In Supabase mode the
        same operations are stored as append-only events with actor and
        timestamp.
      </p>
    </div>
  );
}
