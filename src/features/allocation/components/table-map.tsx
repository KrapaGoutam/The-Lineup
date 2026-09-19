"use client";

import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";
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
 * name semantics for free, which raw SVG shapes would have to hand-roll
 * (this repo has no Dialog/Popover primitive yet either, so table detail
 * is surfaced by the caller via `selectedLabel`, not a floating panel
 * anchored to the SVG node).
 */
export function TableMap({
  tables,
  selectedLabel,
  onSelectTable,
  disabled = false,
}: {
  tables: ResolvedFloorTable[];
  selectedLabel: string | null;
  onSelectTable: (label: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="border-border bg-muted/20 relative aspect-square w-full overflow-hidden rounded-xl border sm:aspect-video"
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
            disabled={disabled}
            onClick={() => onSelectTable(table.label)}
            aria-label={
              occupied
                ? `Table ${table.label}, assigned to ${table.occupiedBy!.name}`
                : `Table ${table.label}, available`
            }
            aria-pressed={selected}
            className={cn(
              "border-border bg-card focus-visible:ring-ring absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border font-mono text-[11px] font-bold shadow-sm transition-transform focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
              isBar ? "size-9 rounded-full" : "size-11 rounded-lg",
              selected && "ring-ring ring-2",
              // Matches Badge's tone="success" convention (--ok token) --
              // never a raw Tailwind color, so this reads correctly in
              // both themes instead of only the one it happened to look
              // right in.
              !occupied && "border-ok/40 bg-ok/10 text-ok hover:bg-ok/20",
            )}
            style={{
              left: `${table.x}%`,
              top: `${table.y}%`,
              ...(occupied
                ? {
                    backgroundColor: `color-mix(in srgb, ${table.occupiedBy!.color} 25%, var(--card))`,
                    borderColor: table.occupiedBy!.color,
                    color: table.occupiedBy!.color,
                  }
                : undefined),
            }}
          >
            {table.label}
          </button>
        );
      })}
    </div>
  );
}
