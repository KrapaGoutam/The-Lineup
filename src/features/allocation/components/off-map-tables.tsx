"use client";

import { otherTablesInAssignment } from "@/features/allocation/domain/assignment-scope";
import type { OffMapTable } from "@/features/allocation/domain/board-read-model";
import { cn } from "@/lib/utils";

/**
 * Cross-view integrity (X1): tables that have no position on the floor map.
 * They are real (a registered row with no coordinates, or a free-text board
 * label such as "Patio A"), so Floor and Picker list them here instead of
 * pretending they do not exist -- and never at made-up coordinates. Selecting
 * one behaves exactly like selecting a map tile (the caller supplies the same
 * handler), so the owner can act on them where permitted.
 *
 * Identity is the label exactly as stored. Numeric shorthand never lands here as a duplicate: "1" is stored as the registered "T1" (canonical input resolution), so what remains is genuinely free text or unpositioned.
 */
function combinedClause(table: OffMapTable): string {
  if (!table.occupiedBy) return "";
  const others = otherTablesInAssignment(
    table.occupiedBy.assignmentTables,
    table.label,
  );
  return others.length ? `, combined with ${others.join(" + ")}` : "";
}

export function OffMapTables({
  tables,
  selectedLabel = null,
  onSelectTable,
  disabled = false,
  heading = "Off-map tables",
}: {
  tables: OffMapTable[];
  selectedLabel?: string | null;
  onSelectTable: (label: string) => void;
  disabled?: boolean;
  heading?: string;
}) {
  if (tables.length === 0) return null;
  return (
    <section
      aria-label={heading}
      className="border-border bg-muted/20 flex flex-col gap-2 rounded-xl border p-3"
    >
      <div>
        <h3 className="text-xs font-semibold tracking-[0.1em] uppercase">
          {heading}
        </h3>
        <p className="text-muted-foreground text-[11px]">
          No position on the floor map. These are separate from the mapped
          tables above.
        </p>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {tables.map((table) => {
          const occupied = Boolean(table.occupiedBy);
          return (
            <li key={table.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectTable(table.label)}
                aria-pressed={selectedLabel === table.label}
                aria-label={
                  occupied
                    ? `Table ${table.label}, assigned to ${table.occupiedBy!.name}${combinedClause(table)}, off-map`
                    : `Table ${table.label}, available, off-map`
                }
                className={cn(
                  "border-border bg-card focus-visible:ring-ring flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                  selectedLabel === table.label &&
                    "ring-primary ring-offset-background ring-2 ring-offset-2",
                  !occupied && "border-ok/40 bg-ok/10",
                )}
                style={
                  occupied
                    ? { borderColor: table.occupiedBy!.color }
                    : undefined
                }
              >
                <span className="font-mono font-bold">{table.label}</span>
                {occupied ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: table.occupiedBy!.color }}
                      aria-hidden="true"
                    />
                    Active &mdash; {table.occupiedBy!.name}
                  </span>
                ) : (
                  <span className="text-ok text-xs">Available</span>
                )}
                {!table.registered ? (
                  <span className="text-muted-foreground ml-auto text-[10px]">
                    Not in the table list
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
