"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { formatBusinessDateTime } from "@/lib/date-time";

import { changeSummary, SOURCE_LABELS } from "../domain/history";
import type { HistoryEntry } from "../domain/inventory-types";
import { ADJUSTMENT_REASON_LABELS } from "../domain/stock-rules";
import type { LoadHistory } from "./history-view";

/**
 * One item's latest count changes, from the same ledger and the same wording
 * as the History view. Loads when first opened.
 */
export function ItemHistory({
  productId,
  timeZone,
  load,
}: {
  productId: string;
  timeZone: string;
  load: LoadHistory;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<
    { ok: true; entries: HistoryEntry[] } | { ok: false; error: string } | null
  >(null);

  useEffect(() => {
    if (!open || result) return;
    let cancelled = false;
    void load(0, productId)
      .catch(() => ({
        ok: false as const,
        error: "History could not be loaded.",
      }))
      .then((outcome) => {
        if (!cancelled) setResult(outcome);
      });
    return () => {
      cancelled = true;
    };
  }, [open, result, load, productId]);

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section className="border-border rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold outline-none focus-visible:ring-2"
      >
        <Chevron aria-hidden="true" className="size-4" />
        History
      </button>
      {open ? (
        <div id={bodyId} className="border-t px-3 py-2">
          {!result ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading…
            </p>
          ) : !result.ok ? (
            <p role="alert" className="text-destructive text-sm">
              {result.error}
            </p>
          ) : result.entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No count changes yet.
            </p>
          ) : (
            <ul aria-label="Item history" className="divide-border divide-y">
              {result.entries.map((entry) => (
                <li
                  key={entry.id}
                  data-testid="item-history-entry"
                  className="flex flex-col gap-0.5 py-2 text-sm"
                >
                  <span className="font-medium">{changeSummary(entry)}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatBusinessDateTime(entry.at, timeZone)} ·{" "}
                    {ADJUSTMENT_REASON_LABELS[entry.reason]} ·{" "}
                    {SOURCE_LABELS[entry.source]}
                    {entry.actorName ? ` · ${entry.actorName}` : ""}
                  </span>
                  {entry.note ? <span>{entry.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
