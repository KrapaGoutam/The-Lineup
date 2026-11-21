"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { recurrenceSummary } from "../domain/chore-cycles";
import {
  boardProgress,
  isBoardLive,
  liveColumns,
  sortByOrder,
} from "../domain/chore-rules";
import type { ChoreController } from "../hooks/use-chore-controller";
import { ChoreMatrix } from "./chore-matrix";
import { ChorePersonList } from "./chore-person-list";
import { ChoreRunPanel } from "./chore-run-panel";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on a phone-width viewport. The Tasks module only mounts after hydration. */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

type Props = {
  controller: ChoreController;
  /** Active organization and branch ("Org · Branch"), real mode. */
  contextLabel?: string | null;
  /** Managers get a direct entry into Tasks → Manage. */
  onManage?: (boardId: string | null) => void;
  /** Opens Tasks → History on one board's finished runs. */
  onOpenHistory?: (boardId: string) => void;
  /** Board to show first (e.g. coming from an in-progress run in History). */
  initialBoardId?: string | null;
};

/**
 * The Chore Wheel: an interactive prep-area board. Everything on screen comes
 * from the controller's snapshot (server truth plus the one in-flight tick), so a
 * reload shows exactly what was saved.
 */
export function ChoreWheelView({
  controller,
  contextLabel = null,
  onManage,
  onOpenHistory,
  initialBoardId = null,
}: Props) {
  const { snapshot, viewer, pendingCells, ensureLoaded } = controller;
  const phone = useIsPhone();
  const [selected, setSelected] = useState<string | null>(initialBoardId);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const boards = useMemo(
    () =>
      sortByOrder(
        (snapshot?.boards ?? []).filter(
          (b) => viewer.isManager || isBoardLive(b),
        ),
      ).filter((b) => !b.archived),
    [snapshot, viewer.isManager],
  );
  const board = boards.find((b) => b.id === selected) ?? boards[0] ?? null;

  async function toggle(rowId: string, columnId: string, done: boolean) {
    if (!board) return;
    setNotice(null);
    setInfo(null);
    const result = await controller.setCell(
      board.id,
      rowId,
      columnId,
      done,
      board.cycle?.id ?? null,
    );
    if (!result.ok) setNotice(result.error);
    else if (result.outcome === "checked_closed") {
      setInfo(
        `Run ${board.cycle?.sequence ?? ""} is complete and was saved to History.`,
      );
    }
  }

  if (controller.loadError && !snapshot) {
    return (
      <div className="border-border rounded-2xl border p-6 text-center">
        <p className="text-sm">{controller.loadError}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void controller.refresh()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <p
        role="status"
        className="text-muted-foreground p-6 text-center text-sm"
      >
        Loading chore boards…
      </p>
    );
  }
  if (!board) {
    return (
      <section
        aria-label="Chore Wheel"
        className="border-border space-y-3 rounded-2xl border border-dashed p-8 text-center"
      >
        <h2 className="text-lg font-semibold">No chore boards yet</h2>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          {viewer.isManager
            ? "Create a board for a prep or cleaning routine, add the people and the chores, and your team can check them off here."
            : "A manager has not set up a chore board for this location yet."}
        </p>
        {viewer.isManager && onManage ? (
          <Button onClick={() => onManage(null)}>
            <Settings2 aria-hidden="true" />
            Set up a board
          </Button>
        ) : null}
      </section>
    );
  }

  const progress = boardProgress(board);
  const live = isBoardLive(board);
  const peopleCount = liveColumns(board).length;

  return (
    <section aria-label="Chore Wheel" className="space-y-4">
      {boards.length > 1 ? (
        <nav aria-label="Chore boards" className="-mx-1 overflow-x-auto px-1">
          <div className="flex gap-1.5">
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-current={b.id === board.id ? "page" : undefined}
                onClick={() => setSelected(b.id)}
                className={cn(
                  "focus-visible:ring-ring min-h-11 rounded-xl px-4 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2",
                  b.id === board.id
                    ? "bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground border",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" data-testid="chore-board-name">
            {board.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {contextLabel ? `${contextLabel} · ` : ""}
            {board.cycle ? `Run ${board.cycle.sequence}` : "No open run"} ·{" "}
            {peopleCount} {peopleCount === 1 ? "column" : "columns"}
          </p>
          <p
            className="text-muted-foreground text-xs"
            data-testid="chore-recurrence"
          >
            {recurrenceSummary(board.recurrenceIntent, board.resetIntent)}
          </p>
          {board.description ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {board.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!live ? <Badge tone="warning">Turned off</Badge> : null}
          {viewer.isManager && onManage ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onManage(board.id)}
            >
              <Settings2 aria-hidden="true" />
              Manage board
            </Button>
          ) : null}
        </div>
      </header>

      {board.cycle ? (
        <div
          data-testid="chore-summary"
          className="border-border grid grid-cols-2 gap-3 rounded-2xl border p-3 sm:grid-cols-4"
        >
          <Stat
            id="required"
            label="Required checks"
            value={progress.required}
          />
          <Stat id="completed" label="Completed" value={progress.completed} />
          <Stat id="remaining" label="Remaining" value={progress.remaining} />
          <Stat id="percent" label="Complete" value={`${progress.percent}%`} />
          <div className="col-span-2 sm:col-span-4">
            <div
              role="progressbar"
              aria-label={`${board.name} completion`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="bg-muted h-2.5 overflow-hidden rounded-full"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] motion-reduce:transition-none",
                  progress.percent === 100 ? "bg-ok" : "bg-primary",
                )}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            {progress.optionalTotal > 0 ? (
              <p className="text-muted-foreground mt-1.5 text-xs">
                Optional: {progress.optionalCompleted} of{" "}
                {progress.optionalTotal} (not counted above)
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ChoreRunPanel
        board={board}
        viewer={viewer}
        run={controller.run}
        onOpenHistory={onOpenHistory}
      />

      {!live ? (
        <p
          role="status"
          className="border-warn/30 bg-warn/10 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          This board is turned off, so it cannot be checked. Turn it on in
          Manage → Boards.
        </p>
      ) : null}

      {notice ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <span className="text-destructive">{notice}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {info ? (
        <div
          role="status"
          data-testid="chore-info"
          className="border-ok/30 bg-ok/10 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <span>{info}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setInfo(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!board.cycle ? null : phone ? (
        <ChorePersonList
          board={board}
          viewer={viewer}
          pendingCells={pendingCells}
          onToggle={(r, c, d) => void toggle(r, c, d)}
        />
      ) : (
        <ChoreMatrix
          board={board}
          viewer={viewer}
          pendingCells={pendingCells}
          onToggle={(r, c, d) => void toggle(r, c, d)}
        />
      )}
    </section>
  );
}

function Stat({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: number | string;
}) {
  return (
    <div data-testid={`chore-stat-${id}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
