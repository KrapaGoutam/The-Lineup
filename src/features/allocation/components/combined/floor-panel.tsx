"use client";

import { useState } from "react";
import { LayoutGrid, Map as MapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OffMapTables } from "@/features/allocation/components/off-map-tables";
import { TableMap } from "@/features/allocation/components/table-map";
import type { OffMapTable } from "@/features/allocation/domain/board-read-model";
import {
  buildPickerTiles,
  type PickerTile,
} from "@/features/allocation/domain/combined-view";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";
import { cn } from "@/lib/utils";

type FloorViewMode = "plan" | "grid";

/**
 * The Combined View's floor: a Plan / Grid toggle over ONE set of resolved
 * tables. Plan is the existing `TableMap` (the branch's real saved
 * coordinates -- `tables` here are display-fitted copies, the saved rows are
 * never modified); Grid is a density-optimised list of the same tables. Both
 * select through the same handler, and switching between them writes nothing.
 * Tables with no map position stay reachable in the off-map rail (Plan) or as
 * ordinary tiles (Grid), exactly as on the Floor view.
 */
export function FloorPanel({
  tables,
  offMapTables,
  loadError,
  selectedLabel,
  disabled,
  fitRatio,
  onSelectTable,
  className,
}: {
  tables: ResolvedFloorTable[];
  offMapTables: OffMapTable[];
  loadError: boolean;
  selectedLabel: string | null;
  disabled: boolean;
  fitRatio: number;
  onSelectTable: (label: string) => void;
  className?: string;
}) {
  const [view, setView] = useState<FloorViewMode>("plan");
  const tiles = buildPickerTiles(tables, offMapTables);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Floor</h2>
        <div
          role="group"
          aria-label="Floor layout"
          className="border-border bg-muted/30 flex gap-1 rounded-lg border p-0.5"
        >
          <Button
            size="sm"
            variant={view === "plan" ? "secondary" : "ghost"}
            aria-pressed={view === "plan"}
            onClick={() => setView("plan")}
          >
            <MapIcon aria-hidden="true" /> Plan
          </Button>
          <Button
            size="sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid aria-hidden="true" /> Grid
          </Button>
        </div>
      </div>

      {view === "plan" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:overflow-y-auto">
          {/* lg+: the map's box is size-contained so TableMap can fit the
              largest map of its ratio into the room that is left. */}
          <div className="flex min-h-0 flex-1 items-center justify-center lg:[container-type:size]">
            <TableMap
              tables={tables}
              loadError={loadError}
              selectedLabel={selectedLabel}
              disabled={disabled}
              compact
              fitRatio={fitRatio}
              onSelectTable={onSelectTable}
            />
          </div>
          <OffMapTables
            compact
            tables={offMapTables}
            selectedLabel={selectedLabel}
            disabled={disabled}
            onSelectTable={onSelectTable}
          />
        </div>
      ) : (
        <ul
          aria-label="Tables"
          className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1.5 overflow-y-auto"
        >
          {tiles.map((tile) => (
            <li key={tile.label}>
              <GridTile
                tile={tile}
                selected={selectedLabel === tile.label}
                disabled={disabled}
                onSelect={() => onSelectTable(tile.label)}
              />
            </li>
          ))}
          {tiles.length === 0 ? (
            <li className="text-muted-foreground col-span-full text-sm">
              {loadError
                ? "Couldn't load the floor layout. Try refreshing the page."
                : "No tables are configured for this location."}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function GridTile({
  tile,
  selected,
  disabled,
  onSelect,
}: {
  tile: PickerTile;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const occupied = Boolean(tile.occupiedBy);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      // Same accessible-name shape as the map tiles so the views read alike.
      aria-label={
        occupied
          ? `Table ${tile.label}, assigned to ${tile.occupiedBy!.name}${tile.offMap ? ", off-map" : ""}`
          : `Table ${tile.label}, available${tile.offMap ? ", off-map" : ""}`
      }
      className={cn(
        "focus-visible:ring-ring flex min-h-12 w-full flex-col items-center justify-center rounded-lg border px-1 py-1 text-center focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
        occupied
          ? "border-border bg-muted/40"
          : "border-ok/40 bg-ok/10 hover:bg-ok/20",
        selected && "ring-primary ring-offset-background ring-2 ring-offset-2",
      )}
    >
      <span className="font-mono text-sm leading-tight font-bold">
        {tile.label}
      </span>
      <span className="text-muted-foreground max-w-full truncate text-[10px] leading-tight">
        {occupied ? tile.occupiedBy!.name.split(" ")[0] : "Free"}
      </span>
    </button>
  );
}
