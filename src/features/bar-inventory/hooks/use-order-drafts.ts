"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clearOrderDraftAction,
  fillOrderDraftAction,
  listOrderDraftsAction,
  openOrderDraftAction,
  saveOrderDraftAction,
  syncOrderDraftAction,
  type OrderDraftActionResult,
} from "../actions/order-draft-actions";
import type { CatalogContext } from "../domain/catalog-engine";
import type {
  CatalogConflict,
  CatalogState,
  InventoryViewer,
} from "../domain/inventory-types";
import type { OrderDraftFillMode } from "../domain/order-draft";
import {
  clearDraftDemo,
  draftsOf,
  fillDraftDemo,
  openDraftDemo,
  saveDraftDemo,
  syncDraftDemo,
  type DraftEngineResult,
} from "../domain/order-draft-demo";
import type {
  OrderDraftSavePayload,
  OrderDraftView,
} from "../domain/order-draft-view";
import {
  OFFLINE_READ_MESSAGE,
  OFFLINE_WRITE_MESSAGE,
  type DemoCatalogBinding,
} from "./use-catalog-controller";

export type DraftOpResult =
  | {
      ok: true;
      drafts: OrderDraftView[];
      draftId: string | null;
      changed: boolean;
    }
  | { ok: false; error: string; conflict?: CatalogConflict };

/** Every way the screens change a draft. One identity for the whole session. */
export type OrderDraftApi = {
  open: (vendorId: string) => Promise<DraftOpResult>;
  save: (
    input: { draftId: string; expectedVersion: number } & OrderDraftSavePayload,
  ) => Promise<DraftOpResult>;
  fill: (
    draftId: string,
    expectedVersion: number,
    mode: OrderDraftFillMode,
  ) => Promise<DraftOpResult>;
  clear: (draftId: string, expectedVersion: number) => Promise<DraftOpResult>;
  sync: (draftId: string, expectedVersion: number) => Promise<DraftOpResult>;
  /** Re-read the drafts from the database (the screen shows what a read returned). */
  reload: () => Promise<void>;
};

// Re-read on focus at most this often (notify-and-refetch, as the catalog does).
const FOCUS_REFRESH_MIN_MS = 15_000;

/**
 * The Order Drafts data layer. The database is the truth: every successful
 * write returns the authoritative active drafts and that is what the screen
 * shows. Demo mode runs the same operations on the in-memory catalog state
 * through the pure engine instead.
 */
export function useOrderDrafts({
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
  const [remote, setRemote] = useState<OrderDraftView[] | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The shell hands over a new `demo` object every second; read the latest
  // through a ref so the API below keeps one identity.
  const latest = useRef({ demo, restaurantSlug, viewer, onSessionInvalid });
  useLayoutEffect(() => {
    latest.current = { demo, restaurantSlug, viewer, onSessionInvalid };
  });

  const started = useRef(0);
  const applied = useRef(0);
  const lastRead = useRef(0);

  /** Apply a server result unless a newer one already landed. */
  const accept = useCallback(
    (ticket: number, result: OrderDraftActionResult) => {
      if (result.ok) {
        if (ticket >= applied.current) {
          applied.current = ticket;
          setRemote(result.drafts);
          setLoadError(null);
        }
      } else if (result.sessionInvalid) {
        latest.current.onSessionInvalid?.();
      }
    },
    [],
  );

  const reload = useCallback(async () => {
    if (latest.current.demo) return;
    const ticket = ++started.current;
    try {
      const result = await listOrderDraftsAction({
        restaurantSlug: latest.current.restaurantSlug,
      });
      lastRead.current = Date.now();
      accept(ticket, result);
      if (!result.ok && !result.sessionInvalid) setLoadError(result.error);
    } catch {
      setLoadError(OFFLINE_READ_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [accept]);

  const isDemoMode = demo !== null;
  useEffect(() => {
    if (isDemoMode) return;
    void reload();
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastRead.current < FOCUS_REFRESH_MIN_MS) return;
      void reload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isDemoMode, reload]);

  const demoState = demo?.state ?? null;
  const demoDrafts = useMemo(
    () => (demoState ? draftsOf(demoState) : null),
    [demoState],
  );

  const api = useMemo<OrderDraftApi>(() => {
    const runDemo = (
      step: (state: CatalogState, ctx: CatalogContext) => DraftEngineResult,
    ): DraftOpResult => {
      const { demo, viewer } = latest.current;
      if (!demo)
        return { ok: false, error: "That didn't work. Please try again." };
      const result = step(demo.state, {
        actorName: viewer.name,
        now: new Date(),
        newId: () => crypto.randomUUID(),
      });
      if (!result.ok) {
        return { ok: false, error: result.error, conflict: result.conflict };
      }
      if (result.state !== demo.state) demo.setState(result.state);
      return {
        ok: true,
        drafts: draftsOf(result.state),
        draftId: result.draftId,
        changed: result.changed,
      };
    };

    const runRemote = async (
      call: () => Promise<OrderDraftActionResult>,
    ): Promise<DraftOpResult> => {
      const ticket = ++started.current;
      let result: OrderDraftActionResult;
      try {
        result = await call();
      } catch {
        // Offline or dropped: we cannot confirm it saved, so never say it did.
        return { ok: false, error: OFFLINE_WRITE_MESSAGE };
      }
      accept(ticket, result);
      if (result.ok) return result;
      // A refused write may mean the screen is stale: show the latest first.
      if (result.conflict?.kind === "stale") await reload();
      return {
        ok: false,
        error: result.error,
        conflict: result.conflict,
      };
    };

    const slug = () => latest.current.restaurantSlug;
    const isDemo = () => latest.current.demo !== null;

    return {
      open: (vendorId) =>
        isDemo()
          ? Promise.resolve(runDemo((s, c) => openDraftDemo(s, vendorId, c)))
          : runRemote(() =>
              openOrderDraftAction({ restaurantSlug: slug(), vendorId }),
            ),
      save: (input) =>
        isDemo()
          ? Promise.resolve(runDemo((s, c) => saveDraftDemo(s, input, c)))
          : runRemote(() =>
              saveOrderDraftAction({
                restaurantSlug: slug(),
                draftId: input.draftId,
                expectedVersion: input.expectedVersion,
                vendorNote: input.vendorNote,
                lines: input.lines,
              }),
            ),
      fill: (draftId, expectedVersion, mode) =>
        isDemo()
          ? Promise.resolve(
              runDemo((s, c) =>
                fillDraftDemo(s, { draftId, expectedVersion, mode }, c),
              ),
            )
          : runRemote(() =>
              fillOrderDraftAction({
                restaurantSlug: slug(),
                draftId,
                expectedVersion,
                mode,
              }),
            ),
      clear: (draftId, expectedVersion) =>
        isDemo()
          ? Promise.resolve(
              runDemo((s, c) =>
                clearDraftDemo(s, { draftId, expectedVersion }, c),
              ),
            )
          : runRemote(() =>
              clearOrderDraftAction({
                restaurantSlug: slug(),
                draftId,
                expectedVersion,
              }),
            ),
      sync: (draftId, expectedVersion) =>
        isDemo()
          ? Promise.resolve(
              runDemo((s, c) =>
                syncDraftDemo(s, { draftId, expectedVersion }, c),
              ),
            )
          : runRemote(() =>
              syncOrderDraftAction({
                restaurantSlug: slug(),
                draftId,
                expectedVersion,
              }),
            ),
      reload: async () => {
        if (!isDemo()) {
          setLoading(true);
          await reload();
        }
      },
    };
  }, [accept, reload]);

  return {
    drafts: demo ? demoDrafts : remote,
    loading: demo ? false : loading,
    loadError: demo ? null : loadError,
    api,
  };
}
