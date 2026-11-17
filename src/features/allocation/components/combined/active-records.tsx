"use client";

import type { ActiveRecord } from "@/features/allocation/domain/combined-view";
import { cn } from "@/lib/utils";

/**
 * Active service records: the live assignments only -- never ended, skipped or
 * cleared entries (those stay in the rotation history). Selecting one selects
 * its table / entry so the same action panel can end, transfer or correct it
 * without leaving the current mode. Scrolls inside its own box when long.
 */
export function ActiveRecords({
  records,
  selected,
  onSelect,
  className,
}: {
  records: ActiveRecord[];
  selected: { roundId: string; columnId: string } | null;
  onSelect: (record: ActiveRecord) => void;
  className?: string;
}) {
  return (
    <section
      aria-label="Active service records"
      className={cn(
        "border-border bg-card flex min-h-0 flex-col rounded-xl border",
        className,
      )}
    >
      <h3 className="border-border text-muted-foreground border-b px-3 py-1.5 text-[11px] font-semibold tracking-[0.1em] uppercase">
        Active service records · {records.length}
      </h3>
      {records.length === 0 ? (
        <p className="text-muted-foreground px-3 py-2 text-xs">
          No tables are being served right now.
        </p>
      ) : (
        <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-1.5 overflow-y-auto p-2">
          {records.map((record) => {
            const isSelected =
              selected?.roundId === record.roundId &&
              selected?.columnId === record.columnId;
            return (
              <li key={`${record.roundId}|${record.columnId}`}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Table ${record.label}, ${record.serverName}, active`}
                  onClick={() => onSelect(record)}
                  className={cn(
                    "border-border focus-visible:ring-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none",
                    isSelected &&
                      "bg-primary/15 ring-primary ring-2 ring-inset",
                  )}
                >
                  <span className="font-mono text-sm font-bold">
                    {record.label}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {record.serverName.split(" ")[0]}
                  </span>
                  <span className="text-ok shrink-0 font-semibold">Active</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
