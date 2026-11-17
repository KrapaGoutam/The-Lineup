"use client";

import type * as React from "react";

import { otherTablesInAssignment } from "@/features/allocation/domain/assignment-scope";
import {
  getInitials,
  type ResolvedFloorTable,
} from "@/features/allocation/domain/floor-layout";
import { cn } from "@/lib/utils";

/**
 * Shared physical-floor renderer -- Table Rotation Multi-View,
 * IMPLEMENTATION_CONTRACT.md section 11. One implementation for Floor
 * (full interactive map), Picker (embedded next to Grid), and Server
 * Board's "+ Table" (opened in context) -- selection semantics differ per
 * caller, not per copy of this component.
 *
 * Data-driven percentage layout (see floor-layout.ts), not the approved
 * design's reference JPG rendered as the interactive surface -- the JPG
 * only supplied the physical arrangement this file's coordinates encode.
 *
 * Implementation note: the contract suggested "React + SVG/viewBox."
 * This uses a plain relative container with absolutely percentage-
 * positioned native <button> elements instead -- same data-driven,
 * fully responsive outcome, but with correct keyboard/focus/accessible-
 * name semantics for free, which raw SVG shapes would have to hand-roll.
 * Table detail is surfaced by the caller (Floor's side panel via
 * `selectedLabel`; Picker and Servers open this map inside the shared
 * `Dialog`), not a floating panel anchored to a map node.
 */
// #109 U3: a combined assignment is announced on each of its tables. Appended
// after the existing "assigned to <server>" text so the leading part of the
// accessible name is unchanged.
function combinedClause(table: ResolvedFloorTable): string {
  if (!table.occupiedBy) return "";
  const others = otherTablesInAssignment(
    table.occupiedBy.assignmentTables,
    table.label,
  );
  return others.length ? `, combined with ${others.join(" + ")}` : "";
}

export function TableMap({
  tables,
  selectedLabel,
  onSelectTable,
  disabled = false,
  loadError = false,
  compact = false,
  fitRatio,
  isTableDisabled,
  className,
}: {
  tables: ResolvedFloorTable[];
  selectedLabel: string | null;
  onSelectTable: (label: string) => void;
  disabled?: boolean;
  // Production stability hotfix: true only when the dining_tables query
  // itself failed server-side (allocation-data.ts's
  // physicalTablesQueryFailed) -- distinct from `tables.length === 0`,
  // which is also true for a genuinely empty, correctly-loaded location.
  // Conflating the two used to show "No tables are configured" for a
  // query failure too, which reads as a data/onboarding problem instead
  // of the transient error it actually is.
  loadError?: boolean;
  // V2.0.4 (Combined View): smaller tiles so a dense floor still separates
  // at half-screen width. Same buttons, same accessible names.
  compact?: boolean;
  // V2.0.4: on lg+ the map is sized to the largest box of this width/height
  // ratio that fits its (size-contained) parent, so the whole floor is visible
  // without page scrolling. Below lg it keeps its natural width-driven shape.
  // The parent must set `container-type: size` at lg (see CombinedView).
  fitRatio?: number;
  // V2.0.4: per-table disable (the quick picker disables occupied tables while
  // keeping them visible and identifiable).
  isTableDisabled?: (table: ResolvedFloorTable) => boolean;
  className?: string;
}) {
  if (loadError) {
    return (
      <div
        className="border-border bg-muted/20 flex aspect-square w-full items-center justify-center rounded-xl border p-6 text-center sm:aspect-video"
        role="status"
      >
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t load the floor layout. Try refreshing the page.
        </p>
      </div>
    );
  }

  // Production parity fix: a genuinely unconfigured location (zero
  // dining_tables rows -- confirmed the root cause of Floor/Picker/
  // Servers all rendering blank in production, see
  // TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md section 12) must say so
  // explicitly, not render a silent, unexplained empty panel that looks
  // broken. Every caller (Floor, Picker's popup, Server Board's popup)
  // shares this one component, so the message only needs to exist here.
  if (tables.length === 0) {
    return (
      <div
        className="border-border bg-muted/20 flex aspect-square w-full items-center justify-center rounded-xl border p-6 text-center sm:aspect-video"
        role="status"
      >
        <p className="text-muted-foreground text-sm">
          No tables are configured for this location.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border bg-muted/20 relative aspect-square w-full overflow-hidden rounded-xl border sm:aspect-video",
        fitRatio &&
          "lg:aspect-[var(--map-ratio)] lg:w-[min(100cqw,calc(100cqh*var(--map-ratio)))]",
        // Compact maps are their own size container so tiles can scale with
        // the map (below) instead of overlapping when the map is small.
        compact && "[container-type:size]",
        className,
      )}
      style={
        fitRatio
          ? ({ "--map-ratio": fitRatio } as React.CSSProperties)
          : undefined
      }
      role="group"
      aria-label="Floor map"
    >
      {tables.map((table) => {
        const occupied = Boolean(table.occupiedBy);
        const selected = selectedLabel === table.label;
        const isBar = table.resourceType === "bar_seat";
        return (
          <button
            key={table.label}
            type="button"
            disabled={disabled || isTableDisabled?.(table) === true}
            onClick={() => onSelectTable(table.label)}
            aria-label={
              occupied
                ? `Table ${table.label}, assigned to ${table.occupiedBy!.name}${combinedClause(table)}`
                : `Table ${table.label}, available`
            }
            aria-pressed={selected}
            className={cn(
              "border-border bg-card focus-visible:ring-ring absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border font-mono font-bold shadow-sm transition-transform focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
              occupied ? "leading-tight" : "text-[11px]",
              isBar
                ? compact
                  ? "rounded-full"
                  : "size-9 rounded-full"
                : compact
                  ? "rounded-lg"
                  : "size-11 rounded-lg",
              // Selected is a separate, temporary state from ownership --
              // a stronger ring plus an offset so it stays visible on top
              // of any server accent color, never confusable with
              // ownership itself.
              selected &&
                "ring-primary ring-offset-background ring-2 ring-offset-2",
              // Matches Badge's tone="success" convention (--ok token) --
              // never a raw Tailwind color, so this reads correctly in
              // both themes instead of only the one it happened to look
              // right in.
              !occupied && "border-ok/40 bg-ok/10 text-ok hover:bg-ok/20",
            )}
            style={{
              left: `${table.x}%`,
              top: `${table.y}%`,
              // Compact: tile edge is a share of the MAP's own width/height
              // (cq units resolve against the map, the nearest size
              // container), so adjacent tables keep apart at any map size.
              ...(compact
                ? {
                    width: isBar
                      ? "clamp(1.25rem, min(7.2cqw, 10.4cqh), 2rem)"
                      : "clamp(1.5rem, min(9cqw, 13cqh), 2.5rem)",
                    height: isBar
                      ? "clamp(1.25rem, min(7.2cqw, 10.4cqh), 2rem)"
                      : "clamp(1.5rem, min(9cqw, 13cqh), 2.5rem)",
                  }
                : undefined),
              ...(occupied
                ? {
                    backgroundColor: `color-mix(in srgb, ${table.occupiedBy!.color} 25%, var(--card))`,
                    borderColor: table.occupiedBy!.color,
                    color: table.occupiedBy!.color,
                  }
                : undefined),
            }}
          >
            {occupied ? (
              <>
                <span className="text-[9px]">{table.label}</span>
                <span className="text-[8px] tracking-wide">
                  {getInitials(table.occupiedBy!.name)}
                </span>
              </>
            ) : (
              table.label
            )}
          </button>
        );
      })}
    </div>
  );
}
