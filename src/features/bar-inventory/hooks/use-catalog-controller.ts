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

export const OFFLINE_READ_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";
export const OFFLINE_WRITE_MESSAGE =
  "Couldn't reach the server, so we can't confirm that was saved. Refresh to check, then try again.";

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
  // The shell hands over a new function every render (it re-renders every
  // second for the header clock). Read through a ref so it can never be a
  // dependency of the loader: as one, every render re-ran the load effect and
  // the snapshot was re-read once a second.
  const sessionInvalid = useRef(onSessionInvalid);
  useEffect(() => {
    sessionInvalid.current = onSessionInvalid;
  });
  const reading = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);

  // One read at a time. A request that arrives while a read is in flight is
  // remembered and run once it ends -- the read in flight may have started
  // before the change that prompted the request, so dropping it could leave
  // the screen one change behind. Every caller gets the same promise, which
  // settles after the last read.
  const read = useCallback((): Promise<void> => {
    if (demo) return Promise.resolve();
    if (reading.current) {
      rerun.current = true;
      return reading.current;
    }
    const run = (async () => {
      try {
        do {
          rerun.current = false;
          let result: Awaited<ReturnType<typeof getCatalogSnapshotAction>>;
          try {
            result = await getCatalogSnapshotAction({ restaurantSlug });
          } catch {
            // Offline or the server dropped the request: say so, never freeze.
            setLoadError(OFFLINE_READ_MESSAGE);
            break;
          }
          lastFetch.current = Date.now();
          if (result.ok) {
            setSnapshot(result.data);
            setLoadError(null);
          } else if (result.sessionInvalid) {
            sessionInvalid.current?.();
            break;
          } else {
            setLoadError(result.error);
          }
        } while (rerun.current);
      } finally {
        reading.current = null;
        rerun.current = false;
        setLoading(false);
      }
    })();
    reading.current = run;
    return run;
  }, [demo, restaurantSlug]);

  // A manual refresh shows "Refreshing…"; `background` re-reads (Realtime,
  // focus) keep the screen exactly as it is.
  const refresh = useCallback(
    async (options?: { background?: boolean }) => {
      if (demo) return;
      if (options?.background !== true) setLoading(true);
      await read();
    },
    [demo, read],
  );

  useEffect(() => {
    if (demo) return;
    void read();
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastFetch.current < FOCUS_REFRESH_MIN_MS) return;
      void read();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [demo, read]);

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

  // Keyed on the state, not on `demo`: the shell rebuilds the `demo` object
  // every second (header clock), and a new snapshot each time would make every
  // view that follows the snapshot re-read each second.
  const demoState = demo?.state ?? null;
  const demoSnapshot = useMemo<CatalogSnapshot | null>(
    () =>
      demoState ? { ...demoState, loadedAt: new Date().toISOString() } : null,
    [demoState],
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
      let result: Awaited<ReturnType<typeof runCatalogCommandAction>>;
      try {
        result = await runCatalogCommandAction({ restaurantSlug, command });
      } catch {
        return { ok: false, error: OFFLINE_WRITE_MESSAGE };
      }
      if (result.ok) {
        lastFetch.current = Date.now();
        setSnapshot(result.data);
        return { ok: true, snapshot: result.data };
      }
      if (result.sessionInvalid) {
        sessionInvalid.current?.();
        return { ok: false, error: result.error };
      }
      // A refused write may mean the screen is stale: show the latest.
      if (result.conflict?.kind === "stale") void refresh();
      return { ok: false, error: result.error, conflict: result.conflict };
    },
    [demo, viewer.name, restaurantSlug, refresh],
  );

  return {
    snapshot: demo ? demoSnapshot : snapshot,
    loading: demo ? false : loading,
    loadError,
    refresh,
    run,
  };
}
