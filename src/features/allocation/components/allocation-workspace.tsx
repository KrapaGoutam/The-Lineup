"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Pause,
  Play,
  Plus,
  Redo2,
  Rows3,
  RotateCcw,
  ShieldAlert,
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
  executeBoardActionRemote,
  redoBoardAction,
  undoBoardAction,
} from "@/features/allocation/actions/allocation-actions";
import type {
  AllocationContext,
  CrossEditEntry,
} from "@/features/allocation/data/allocation-data";
import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  getWorkingRound,
  isCrossColumnEdit,
  mayWriteColumn,
  redoBoard,
  undoBoard,
  type BoardAction,
  type BoardHistory,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import type { TipsAuditEntry } from "@/features/tips/domain/tips-status";
import { team as seedTeam, type TeamMember } from "@/lib/demo-data";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const EMPTY_BOARD: RotationBoard = {
  columns: [],
  rounds: [],
  nextRoundNumber: 1,
};

function buildInitialHistory() {
  let history = createBoardHistory(
    createRotationBoard(
      // Seeds the board's starting four columns from the static demo
      // roster once, at first mount only — unrelated to who can be added
      // live afterward (that reads the `team` prop below, not this seed).
      seedTeam.slice(0, 4).map((member, position) => ({
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
  // Mia's very first assignment above already opened round 2 (see
  // `ensureTrailingRound`'s doc comment — a round's first value is what
  // creates the next one, not waiting for the whole round to fill), so
  // round 2 already exists as index 1 by the time this runs. It's round
  // 2 itself, not whatever trailing buffer exists past it, where the
  // demo's partial second turn belongs.
  const second = history.present.rounds[1].id;
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
    const form = new FormData(event.currentTarget);
    const input = form.get("table");
    if (typeof input !== "string" || !input.trim()) return;
    // Feature 011, revised twice: a reason was first made optional, then
    // removed entirely — one input, no second field under it, for every
    // column regardless of whose it is. Attribution (who/what column/
    // when) is recorded by the caller unconditionally for any
    // cross-column write; that was always the actual safeguard, not the
    // reason text.
    onSubmit(input);
    event.currentTarget.reset();
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

export function AllocationWorkspace({
  user,
  team,
  boardLocked,
  onReopenTips,
  tipsAuditLog,
  demoMode,
  restaurantSlug,
  initialContext = null,
  onSessionInvalid,
}: {
  user: SignedInUser;
  team: TeamMember[];
  boardLocked: boolean;
  onReopenTips: (reason: string) => void;
  tipsAuditLog: TipsAuditEntry[];
  demoMode: boolean;
  restaurantSlug: string;
  initialContext?: AllocationContext | null;
  // Feature 017: called instead of setting the local error banner when a
  // board action's result reports sessionInvalid (this person was
  // deactivated mid-session, most commonly) -- the parent owns signing
  // out, this component only detects and reports it.
  onSessionInvalid: () => void;
}) {
  const router = useRouter();
  const isManager = user.role !== "server";
  const [history, setHistory] = useState<BoardHistory>(() =>
    demoMode
      ? buildInitialHistory()
      : createBoardHistory(initialContext?.board ?? EMPTY_BOARD),
  );
  const [eventCount, setEventCount] = useState(
    () => initialContext?.eventCount ?? 6,
  );
  const [crossEditLog, setCrossEditLog] = useState<CrossEditEntry[]>(
    () => initialContext?.crossEditLog ?? [],
  );
  const [serviceSessionId, setServiceSessionId] = useState<number | null>(
    () => initialContext?.serviceSessionId ?? null,
  );
  const [canUndo, setCanUndo] = useState(
    () => initialContext?.canUndo ?? false,
  );
  const [canRedo, setCanRedo] = useState(
    () => initialContext?.canRedo ?? false,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const board = history.present;

  // A fresh initialContext arrives either from this browser's own action
  // completing (revalidatePath re-fetches automatically) or from the
  // Realtime subscription below calling router.refresh() after someone
  // else's change. Either way, it's the authoritative state -- resync
  // local state from it rather than leaving the lazy useState initializer
  // stuck on whatever was true at first mount (the same staleness bug
  // Phase B/D already hit once with schedule/tips state). Done during
  // render (React's own documented pattern for "adjust state when a prop
  // changes"), not in an effect -- an effect would commit the stale frame
  // first and only correct it a tick later.
  const [syncedContext, setSyncedContext] = useState(initialContext);
  if (!demoMode && initialContext !== syncedContext) {
    setSyncedContext(initialContext);
    setHistory(createBoardHistory(initialContext?.board ?? EMPTY_BOARD));
    setEventCount(initialContext?.eventCount ?? 0);
    setCrossEditLog(initialContext?.crossEditLog ?? []);
    setServiceSessionId(initialContext?.serviceSessionId ?? null);
    setCanUndo(initialContext?.canUndo ?? false);
    setCanRedo(initialContext?.canRedo ?? false);
  }

  // Realtime: every board-mutating RPC inserts a board_events row
  // regardless of which table it actually changed, so subscribing to
  // that one table, filtered to this session, is sufficient to learn
  // about every kind of change -- scoped to service_session_id, not
  // organization-wide, per the spec. Before a session exists yet (an
  // all-empty board), subscribe to service_sessions instead, scoped to
  // the organization, just to learn the moment one gets created.
  useEffect(() => {
    if (demoMode) return;
    const supabase = createBrowserSupabaseClient();
    const channel =
      serviceSessionId !== null
        ? supabase
            .channel(`allocation-board-${serviceSessionId}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "board_events",
                filter: `service_session_id=eq.${serviceSessionId}`,
              },
              () => router.refresh(),
            )
            .subscribe()
        : supabase
            .channel(`allocation-session-watch-${user.organizationId}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "service_sessions",
                filter: `organization_id=eq.${user.organizationId}`,
              },
              () => router.refresh(),
            )
            .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demoMode, serviceSessionId, user.organizationId, router]);
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
  // The row people are actually filling in, not the standing empty
  // buffer row past it (see `getWorkingRound`'s doc comment).
  const currentRound = getWorkingRound(board);
  const nextColumn = visibleColumns.find(
    (column) =>
      column.status === "active" &&
      !currentRound?.cells.find((cell) => cell.columnId === column.id)
        ?.tableLabel,
  );

  async function execute(action: BoardAction) {
    // Defense in depth, same principle as RLS re-checking eligibility
    // server-side: the freeze banner disables the UI, but the mutation path
    // itself refuses too, in case a control somehow slips through disabled.
    if (boardLocked) return;

    // Applied immediately in both modes -- demo mode has nothing else;
    // real mode gets the same instant feedback while the write is still
    // in flight, then either stays (the common case) or gets corrected by
    // the automatic refresh that follows a successful revalidatePath, or
    // rolled back below if the write itself failed.
    const previousHistory = history;
    setHistory((current) => executeBoardAction(current, action));
    setEventCount((count) => count + 1);

    if (demoMode) return;

    const result = await executeBoardActionRemote({
      restaurantSlug,
      organizationId: user.organizationId,
      locationId: initialContext?.locationId ?? "",
      timeZone: initialContext?.timeZone ?? "America/Chicago",
      serviceSessionId,
      action,
    });
    if (!result.ok) {
      setHistory(previousHistory);
      setEventCount((count) => count - 1);
      if (result.sessionInvalid) {
        onSessionInvalid();
        return;
      }
      setActionError(result.error);
      return;
    }
    setServiceSessionId(result.data.serviceSessionId);
  }

  async function undo() {
    if (demoMode) {
      setHistory((current) => undoBoard(current));
      return;
    }
    if (serviceSessionId === null) return;
    const result = await undoBoardAction({
      restaurantSlug,
      organizationId: user.organizationId,
      serviceSessionId,
    });
    if (!result.ok) {
      if (result.sessionInvalid) onSessionInvalid();
      else setActionError(result.error);
    }
  }

  async function redo() {
    if (demoMode) {
      setHistory((current) => redoBoard(current));
      return;
    }
    if (serviceSessionId === null) return;
    const result = await redoBoardAction({
      restaurantSlug,
      organizationId: user.organizationId,
      serviceSessionId,
    });
    if (!result.ok) {
      if (result.sessionInvalid) onSessionInvalid();
      else setActionError(result.error);
    }
  }

  function submitReopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReopenError("");
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 3) {
      setReopenError("Enter a short reason (at least 3 characters).");
      return;
    }
    onReopenTips(reason);
    setShowReopenForm(false);
  }

  const lastTipsAuditEntry = tipsAuditLog.at(-1);

  return (
    <div className="space-y-4">
      {actionError ? (
        <div className="border-destructive/30 bg-destructive/10 flex items-center justify-between rounded-xl border px-4 py-2 text-sm">
          <span className="text-destructive">{actionError}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
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
            onClick={undo}
            disabled={
              (demoMode ? history.past.length === 0 : !canUndo) || boardLocked
            }
          >
            <Undo2 aria-hidden="true" /> Undo
          </Button>
          <Button
            variant="secondary"
            onClick={redo}
            disabled={
              (demoMode ? history.future.length === 0 : !canRedo) || boardLocked
            }
          >
            <Redo2 aria-hidden="true" /> Redo
          </Button>
          {isManager && !boardLocked ? (
            <Button
              variant="outline"
              onClick={() => execute({ type: "add-row" })}
            >
              <Rows3 aria-hidden="true" /> Add row
            </Button>
          ) : null}
          {isManager && !boardLocked ? (
            <Button
              variant="outline"
              onClick={() => execute({ type: "clear-board" })}
            >
              <Eraser aria-hidden="true" /> Clear board
            </Button>
          ) : null}
        </div>
      </div>

      {boardLocked ? (
        <Card className="border-amber-400/30 bg-amber-400/10">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              Tips are finalized for today — the board is locked for everyone.
            </p>
            {isManager ? (
              showReopenForm ? (
                <form
                  onSubmit={submitReopen}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Input
                    name="reason"
                    placeholder="Reason for reopening"
                    aria-label="Reason for reopening tips"
                    className="h-9 w-48"
                    required
                    minLength={3}
                  />
                  <Button type="submit" size="sm">
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReopenForm(false)}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReopenForm(true)}
                >
                  Reopen tips for corrections
                </Button>
              )
            ) : null}
          </CardContent>
          {reopenError ? (
            <CardContent className="pt-0">
              <p className="text-destructive text-xs" aria-live="polite">
                {reopenError}
              </p>
            </CardContent>
          ) : null}
          {lastTipsAuditEntry ? (
            <CardContent className="text-muted-foreground pt-0 text-xs">
              Last: {lastTipsAuditEntry.action} by{" "}
              {lastTipsAuditEntry.actorName}
              {lastTipsAuditEntry.reason
                ? ` — ${lastTipsAuditEntry.reason}`
                : ""}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

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

      {isManager && !boardLocked && availableMembers.length ? (
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
              {visibleColumns.map((column, columnIndex) => {
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
                    {isManager && !boardLocked ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Move ${column.name} up`}
                          disabled={columnIndex === 0}
                          onClick={() =>
                            execute({
                              type: "move-column",
                              columnId: column.id,
                              direction: "up",
                            })
                          }
                        >
                          <ChevronUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Move ${column.name} down`}
                          disabled={columnIndex === visibleColumns.length - 1}
                          onClick={() =>
                            execute({
                              type: "move-column",
                              columnId: column.id,
                              direction: "down",
                            })
                          }
                        >
                          <ChevronDown />
                        </Button>
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
                    {isManager && !boardLocked ? (
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
                      mayWriteColumn() &&
                      !boardLocked;
                    const crossColumn = isCrossColumnEdit({
                      profileId: user.profileId,
                      columnId: column.id,
                    });
                    return (
                      <div
                        key={`${round.id}-${column.id}`}
                        className={cn(
                          "border-border min-h-20 border-t border-r p-3 last:border-r-0",
                          column.status === "paused" && "bg-muted",
                        )}
                      >
                        <TableEntry
                          value={cell?.tableLabel ?? null}
                          disabled={!canWrite}
                          onSubmit={(tableLabel) => {
                            execute({
                              type: "assign",
                              roundId: round.id,
                              columnId: column.id,
                              tableLabel,
                            });
                            // Attribution is recorded for every
                            // cross-column write, unconditionally — there
                            // is no reason field to gate it on anymore.
                            if (crossColumn) {
                              setCrossEditLog((log) => [
                                ...log,
                                {
                                  at: new Date().toISOString(),
                                  actorName: user.name,
                                  columnName: column.name,
                                },
                              ]);
                            }
                          }}
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

      {crossEditLog.length > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Cross-column edits</h2>
            <p className="text-muted-foreground text-xs">
              Anyone can edit any column now — every edit to someone else&apos;s
              column is recorded here with who did it and when, visible to the
              whole team, not just managers.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {crossEditLog
              .slice(-5)
              .reverse()
              .map((entry, index) => (
                <p key={index} className="text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {entry.actorName}
                  </span>{" "}
                  edited {entry.columnName}&apos;s column
                </p>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Undo and redo restore the previous board state. In Supabase mode the
        same operations are stored as append-only events with actor and
        timestamp.
      </p>
    </div>
  );
}
