"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpToLine, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  HistoryCell,
  HistoryRow,
} from "@/features/allocation/domain/combined-view";
import type { RotationColumn } from "@/features/allocation/domain/rotation-board";
import { cn } from "@/lib/utils";

const TURN_COL = "3.25rem";
const SERVER_COL_MIN = "5.5rem";

function cellText(cell: HistoryCell | undefined) {
  if (!cell) return { text: "", spoken: "no entry" };
  if (cell.status === "skipped")
    return { text: "Skip", spoken: "skipped turn" };
  const label = cell.label ?? "";
  if (cell.status === "ended") {
    return { text: `${label} ✓`, spoken: `${label}, ended` };
  }
  return { text: `${label} •`, spoken: `${label}, active` };
}

/**
 * The rotation board: SERVER NAMES are the columns, TURNS are the rows --
 * newest turn first, with the NEXT row pinned directly under the server
 * headings. A column heading selects that server; a "+ Table" in the NEXT row
 * opens the quick table picker already aimed at that server; a recorded cell
 * selects that entry for correction. Nothing here writes: every action is a
 * callback into the workspace's validated paths.
 *
 * History follows the latest by default. If the host scrolls down to read
 * older turns the position is preserved when a new turn arrives, and "Jump to
 * latest" resumes following. The scroll box has a bounded height of its own
 * (it fills whatever room the layout gives it) -- there is no fixed pixel
 * height -- and scrolls on both axes so three servers or twelve both work.
 */
export function RotationBoardGrid({
  columns,
  rows,
  nextColumnId,
  selectedServerId,
  selectedEntry,
  disabled,
  colorOf,
  onSelectServer,
  onSelectEntry,
  onNextCell,
  className,
}: {
  columns: RotationColumn[];
  rows: HistoryRow[];
  nextColumnId: string | null;
  selectedServerId: string | null;
  selectedEntry: { roundId: string; columnId: string } | null;
  disabled: boolean;
  colorOf: (columnId: string) => string | undefined;
  onSelectServer: (columnId: string) => void;
  onSelectEntry: (roundId: string, columnId: string) => void;
  onNextCell: (columnId: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atLatest, setAtLatest] = useState(true);
  const atLatestRef = useRef(true);
  const lastHeight = useRef(0);
  const lastRowKey = useRef("");

  const template = `${TURN_COL} repeat(${Math.max(columns.length, 1)}, minmax(${SERVER_COL_MIN}, 1fr))`;
  const minWidth = `calc(${TURN_COL} + ${columns.length} * ${SERVER_COL_MIN})`;

  // Keep the viewing position honest when rows change underneath it.
  const newestKey = rows[0]?.roundId ?? "";
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = el.scrollHeight - lastHeight.current;
    if (lastRowKey.current !== newestKey) {
      if (atLatestRef.current) {
        el.scrollTop = 0; // following the latest: show the new turn
      } else if (grew > 0) {
        el.scrollTop += grew; // reading older turns: do not move them
      }
    }
    lastRowKey.current = newestKey;
    lastHeight.current = el.scrollHeight;
  });

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const latest = el.scrollTop <= 4;
    lastHeight.current = el.scrollHeight;
    atLatestRef.current = latest;
    setAtLatest(latest);
  }

  function jumpToLatest() {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    atLatestRef.current = true;
    setAtLatest(true);
  }

  return (
    <div className={cn("relative flex min-h-0 flex-col", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="region"
        aria-label="Rotation history"
        // Reads and writes both scroll; anchoring is handled above, so the
        // browser's own (inconsistent across engines) anchoring is off.
        style={{ overflowAnchor: "none" }}
        className="border-border bg-card min-h-0 flex-1 overflow-auto rounded-xl border"
      >
        <div style={{ minWidth }}>
          {/* Sticky block: server headings + the NEXT row. */}
          <div className="bg-card sticky top-0 z-20 shadow-[0_1px_0_var(--border)]">
            <div className="grid" style={{ gridTemplateColumns: template }}>
              <div className="bg-secondary text-muted-foreground sticky left-0 z-10 flex items-center justify-center p-1 text-[11px] font-semibold">
                Turn
              </div>
              {columns.map((column) => {
                const selected = selectedServerId === column.id;
                const isNext = column.id === nextColumnId;
                return (
                  <button
                    key={column.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectServer(column.id)}
                    className={cn(
                      "bg-secondary focus-visible:ring-ring flex min-h-10 min-w-0 flex-col items-center justify-center gap-0 border-l px-1.5 py-1 text-center focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                      selected && "bg-primary/15",
                    )}
                  >
                    <span className="flex max-w-full items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf(column.id) }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-xs font-semibold">
                        {column.name.split(" ")[0]}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-[10px] leading-none">
                      {column.status === "paused"
                        ? "Paused"
                        : isNext
                          ? "Next up"
                          : " "}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="border-border grid border-t"
              style={{ gridTemplateColumns: template }}
            >
              <div className="bg-secondary text-primary sticky left-0 z-10 flex items-center justify-center p-1 text-[11px] font-bold tracking-wide">
                NEXT
              </div>
              {columns.map((column) => {
                const paused = column.status !== "active";
                const isNext = column.id === nextColumnId;
                return (
                  <div
                    key={column.id}
                    className={cn(
                      "border-border border-l p-1",
                      isNext && "bg-primary/10",
                    )}
                  >
                    {paused ? (
                      <span
                        className="text-muted-foreground flex min-h-9 items-center justify-center text-xs"
                        aria-label={`${column.name} is paused and cannot be assigned`}
                      >
                        Paused
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant={isNext ? "default" : "outline"}
                        className="w-full min-w-0 px-1"
                        disabled={disabled}
                        aria-label={`Assign next table to ${column.name}`}
                        onClick={() => onNextCell(column.id)}
                      >
                        <Plus aria-hidden="true" /> Table
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {rows.map((row) => (
            <div
              key={row.roundId}
              className="border-border grid border-t"
              style={{ gridTemplateColumns: template }}
            >
              <div className="bg-card text-muted-foreground sticky left-0 z-10 flex items-center justify-center font-mono text-xs font-bold">
                {row.sequence}
              </div>
              {columns.map((column) => {
                const cell = row.cells.get(column.id);
                const { text, spoken } = cellText(cell);
                const selected =
                  selectedEntry?.roundId === row.roundId &&
                  selectedEntry?.columnId === column.id;
                return (
                  <button
                    key={column.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Turn ${row.sequence}, ${column.name}: ${spoken}${cell?.transferredIn ? ", transferred in" : ""}`}
                    onClick={() => onSelectEntry(row.roundId, column.id)}
                    className={cn(
                      "border-border focus-visible:ring-ring flex min-h-10 min-w-0 items-center justify-center border-l px-1 text-center font-mono text-xs focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                      cell?.status === "active" && "font-bold",
                      (cell?.status === "ended" ||
                        cell?.status === "skipped") &&
                        "text-muted-foreground",
                      column.status === "paused" && "bg-muted/40",
                      selected &&
                        "bg-primary/20 ring-primary ring-2 ring-inset",
                    )}
                  >
                    <span className="truncate">
                      {cell?.transferredIn ? "↪ " : ""}
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              No turns recorded yet. Use a NEXT cell or a table to start.
            </p>
          ) : null}
        </div>
      </div>
      {!atLatest ? (
        <Button
          size="sm"
          className="absolute right-3 bottom-3 z-30 shadow-lg"
          onClick={jumpToLatest}
        >
          <ArrowUpToLine aria-hidden="true" /> Jump to latest
        </Button>
      ) : null}
    </div>
  );
}
