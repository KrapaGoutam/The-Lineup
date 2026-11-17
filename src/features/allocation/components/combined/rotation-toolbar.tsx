"use client";

import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  Plus,
  SkipForward,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/features/allocation/domain/floor-layout";
import type { ServerSummary } from "@/features/allocation/domain/board-read-model";
import type { RotationColumn } from "@/features/allocation/domain/rotation-board";
import { cn } from "@/lib/utils";

/**
 * Server chips + the selected server's controls + the two add buttons.
 * `+ Table` (any server) and `+ Server` (an existing branch employee) are
 * deliberately separate. Move Up / Move Down, Pause / Resume and Skip Turn act
 * on the server selected by its chip or its column heading and go through the
 * existing board actions (reorder never rewrites history; pause never closes
 * tables). Chips are hidden in Rotation Focus, where the column headings are
 * the selector.
 */
export function RotationToolbar({
  columns,
  servers,
  nextColumnId,
  selectedServerId,
  showChips,
  disabled,
  colorOf,
  onSelectServer,
  onMove,
  onTogglePause,
  onSkip,
  onAddTable,
  onAddServer,
  onExpand,
}: {
  columns: RotationColumn[];
  servers: ServerSummary[];
  nextColumnId: string | null;
  selectedServerId: string | null;
  showChips: boolean;
  disabled: boolean;
  colorOf: (columnId: string) => string | undefined;
  onSelectServer: (columnId: string) => void;
  onMove: (columnId: string, direction: "up" | "down") => void;
  onTogglePause: (columnId: string) => void;
  onSkip: (columnId: string) => void;
  onAddTable: () => void;
  onAddServer: () => void;
  /** Split Screen only: open Rotation Focus with the same selection. */
  onExpand?: () => void;
}) {
  const selected = columns.find(({ id }) => id === selectedServerId);
  const index = selected
    ? columns.findIndex(({ id }) => id === selected.id)
    : -1;
  const paused = selected?.status === "paused";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {showChips ? (
          <ul
            aria-label="Servers"
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5"
          >
            {columns.map((column) => {
              const summary = servers.find(
                ({ columnId }) => columnId === column.id,
              );
              const isSelected = selectedServerId === column.id;
              return (
                <li key={column.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${column.name}, ${column.status}, ${summary?.activeTableLabels.length ?? 0} tables${column.id === nextColumnId ? ", next up" : ""}`}
                    onClick={() => onSelectServer(column.id)}
                    className={cn(
                      "border-border bg-card focus-visible:ring-ring flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none",
                      isSelected && "bg-primary/15 ring-primary ring-2",
                      column.status === "paused" && "opacity-70",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(column.id) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono font-bold">
                      {getInitials(column.name)}
                    </span>
                    <span className="text-muted-foreground">
                      {summary?.activeTableLabels.length ?? 0}
                    </span>
                    {column.status === "paused" ? (
                      <span className="text-muted-foreground">· Paused</span>
                    ) : null}
                    {column.id === nextColumnId ? (
                      <Badge tone="accent" className="px-1.5 py-0 text-[10px]">
                        Next
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex-1" />
        )}
        {onExpand ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Expand to Rotation Focus"
            title="Expand to Rotation Focus"
            onClick={onExpand}
          >
            <Maximize2 aria-hidden="true" /> Expand
          </Button>
        ) : null}
        <Button size="sm" disabled={disabled} onClick={onAddTable}>
          <Plus aria-hidden="true" /> Table
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={onAddServer}
        >
          <UserPlus aria-hidden="true" /> Server
        </Button>
      </div>

      {selected ? (
        <div
          role="group"
          aria-label={`${selected.name} controls`}
          className="border-border bg-muted/20 flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1"
        >
          <span className="mr-1 text-xs font-semibold">{selected.name}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || index <= 0}
            aria-label={`Move ${selected.name} up`}
            onClick={() => onMove(selected.id, "up")}
          >
            <ChevronLeft aria-hidden="true" /> Move up
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || index === columns.length - 1}
            aria-label={`Move ${selected.name} down`}
            onClick={() => onMove(selected.id, "down")}
          >
            Move down <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onTogglePause(selected.id)}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || paused}
            onClick={() => onSkip(selected.id)}
          >
            <SkipForward aria-hidden="true" /> Skip turn
          </Button>
        </div>
      ) : null}
    </div>
  );
}
