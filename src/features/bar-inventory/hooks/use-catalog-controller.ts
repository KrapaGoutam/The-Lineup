"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getCatalogSnapshotAction,
  runCatalogCommandAction,
} from "../actions/inventory-actions";
import type { CatalogCommand } from "../domain/catalog-commands";
import {
  applyCatalogCommand,
  withSystemVendor,
} from "../domain/catalog-engine";
import type {
  CatalogConflict,
  CatalogSnapshot,
  CatalogState,
  InventoryViewer,
} from "../domain/inventory-types";

/** Demo mode: the shell owns the catalog state so it survives tab changes. */
export type DemoCatalogBinding = {
  state: CatalogState;
  setState: (next: CatalogState) => void;
};

export type CatalogRunResult =
  | { ok: true; snapshot: CatalogSnapshot }
  | { ok: false; error: string; conflict?: CatalogConflict };

// Re-read on focus at most this often (notify-and-refetch: the database is
// the truth, the screen only ever shows what a read returned).
const FOCUS_REFRESH_MIN_MS = 15_000;

export function useCatalogController({
  demo,
  restaurantSlug,
  viewer,
  onSessionInvalid,
}: {
  demo: DemoCatalogBinding | null;
  restaurantSlug: string;
  viewer: InventoryViewer;
  onSessionInvalid?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (demo || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await getCatalogSnapshotAction({ restaurantSlug });
      lastFetch.current = Date.now();
      if (result.ok) {
        setSnapshot(result.data);
        setLoadError(null);
      } else if (result.sessionInvalid) {
        onSessionInvalid?.();
      } else {
        setLoadError(result.error);
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [demo, restaurantSlug, onSessionInvalid]);

  useEffect(() => {
    if (demo) return;
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastFetch.current < FOCUS_REFRESH_MIN_MS) return;
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [demo, refresh]);

  // Demo mode: make sure the system vendor exists (like inventory_bootstrap).
  useEffect(() => {
    if (!demo) return;
    const next = withSystemVendor(demo.state, {
      actorName: viewer.name,
      now: new Date(),
      newId: () => crypto.randomUUID(),
    });
    if (next !== demo.state) demo.setState(next);
  }, [demo, viewer.name]);

  const demoSnapshot = useMemo<CatalogSnapshot | null>(
    () => (demo ? { ...demo.state, loadedAt: new Date().toISOString() } : null),
    [demo],
  );

  const run = useCallback(
    async (command: CatalogCommand): Promise<CatalogRunResult> => {
      if (demo) {
        const result = applyCatalogCommand(demo.state, command, {
          actorName: viewer.name,
          now: new Date(),
          newId: () => crypto.randomUUID(),
        });
        if (!result.ok) {
          return { ok: false, error: result.error, conflict: result.conflict };
        }
        demo.setState(result.state);
        return {
          ok: true,
          snapshot: { ...result.state, loadedAt: new Date().toISOString() },
        };
      }
      const result = await runCatalogCommandAction({ restaurantSlug, command });
      if (result.ok) {
        lastFetch.current = Date.now();
        setSnapshot(result.data);
        return { ok: true, snapshot: result.data };
      }
      if (result.sessionInvalid) {
        onSessionInvalid?.();
        return { ok: false, error: result.error };
      }
      // A refused write may mean the screen is stale: show the latest.
      if (result.conflict?.kind === "stale") void refresh();
      return { ok: false, error: result.error, conflict: result.conflict };
    },
    [demo, viewer.name, restaurantSlug, onSessionInvalid, refresh],
  );

  return {
    snapshot: demo ? demoSnapshot : snapshot,
    loading: demo ? false : loading,
    loadError,
    refresh,
    run,
  };
}
