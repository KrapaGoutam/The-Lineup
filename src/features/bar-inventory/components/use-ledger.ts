"use client";

import { useEffect, useState } from "react";

import type { HistoryEntry } from "../domain/inventory-types";
import type { LoadHistory } from "./history-view";

/** A year of changes: enough for every analytics window and the 14-day history test. */
export const ANALYTICS_LOOKBACK_DAYS = 365;

export type LedgerState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; entries: HistoryEntry[]; truncated: boolean };

/**
 * Reads the ledger for analytics. It re-reads whenever `refreshKey` changes
 * (pass the catalog snapshot, so a count just changed shows up) and, while
 * re-reading, keeps showing the last answer instead of blanking the screen.
 * `load` must be stable: a new one every render would re-read every render.
 */
export function useLedger(load: LoadHistory, refreshKey: unknown): LedgerState {
  const [state, setState] = useState<LedgerState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void load(ANALYTICS_LOOKBACK_DAYS, null)
      .then(
        (outcome): LedgerState =>
          outcome.ok
            ? {
                status: "ready",
                entries: outcome.entries,
                truncated: outcome.truncated,
              }
            : { status: "error", error: outcome.error },
      )
      .catch(
        (): LedgerState => ({
          status: "error",
          error: "Analytics could not be loaded.",
        }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  return state;
}
