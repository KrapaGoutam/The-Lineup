"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceExpectation } from "@/features/context/domain/workspace-expectation";
import {
  getChoreHistoryAction,
  getChoreRunDetailAction,
  getChoreSnapshotAction,
  runChoreCommandAction,
} from "@/features/tasks/actions/chore-actions";
import type { ChoreCommand } from "@/features/tasks/domain/chore-commands";
import {
  applyChoreCommand,
  buildChoreSnapshot,
  choreRunDetail,
  emptyChoreState,
  listChoreRuns,
  type ChoreState,
} from "@/features/tasks/domain/chore-engine";
import { cellKey, withCellOverlay } from "@/features/tasks/domain/chore-rules";
import type {
  ChoreHistoryData,
  ChoreRunDetail,
  ChoreSnapshot,
  ChoreViewer,
} from "@/features/tasks/domain/chore-types";
import { DEMO_CHORE_LOCATION_ID } from "@/features/tasks/domain/demo-chores";
import type { TasksState } from "@/features/tasks/domain/task-engine";
import type { TaskTeamMember } from "@/features/tasks/domain/task-types";

export type ChoreRunResult =
  | { ok: true; outcome?: string }
  | { ok: false; error: string };

export type ChoreHistoryResult =
  | { ok: true; data: ChoreHistoryData }
  | { ok: false; error: string };
export type ChoreRunDetailResult =
  | { ok: true; data: ChoreRunDetail }
  | { ok: false; error: string };

export type ChoreController = {
  /** Server truth with the in-flight tick shown on top; null until first load. */
  snapshot: ChoreSnapshot | null;
  loading: boolean;
  loadError: string | null;
  viewer: ChoreViewer;
  /** Cells with a write in flight (the UI disables them: no duplicate taps). */
  pendingCells: ReadonlySet<string>;
  /** First use of the Chore Wheel loads it; later calls are no-ops. */
  ensureLoaded: () => void;
  run: (command: ChoreCommand) => Promise<ChoreRunResult>;
  /** Tick / untick one cell. Reverts the display and reports on failure. */
  setCell: (
    boardId: string,
    rowId: string,
    columnId: string,
    done: boolean,
    /** The run on screen: a tick that names a finished run is refused (stale tab). */
    cycleId?: string | null,
  ) => Promise<ChoreRunResult>;
  refresh: () => Promise<void>;
  /** Finished runs (frozen snapshots), bounded by month and optionally one board. */
  loadHistory: (filter: {
    month: string | null;
    boardId: string | null;
  }) => Promise<ChoreHistoryResult>;
  /** One finished run: its frozen matrix and corrections (managers only). */
  loadRunDetail: (cycleId: string) => Promise<ChoreRunDetailResult>;
};

type DemoBinding = {
  state: TasksState;
  setState: (next: TasksState) => void;
  team: readonly TaskTeamMember[];
  organizationId: string;
  /** IANA zone of the demo location (daily / weekly periods follow it). */
  timeZone?: string;
};

type Options = {
  demo: DemoBinding | null;
  restaurantSlug: string;
  viewer: ChoreViewer;
  onSessionInvalid?: () => void;
  expectedContext?: WorkspaceExpectation | null;
  onContextStale?: () => void;
};

const FOCUS_REFRESH_MIN_MS = 5_000;

/**
 * The seam between the Chore Wheel screens and their data source. Real mode: the
 * database is authoritative; every write is a Server Action that returns the
 * refetched snapshot, which replaces ours wholesale. Demo mode: the same
 * commands run through the in-memory twin of the RPCs.
 */
export function useChoreController({
  demo,
  restaurantSlug,
  viewer,
  onSessionInvalid,
  expectedContext = null,
  onContextStale,
}: Options): ChoreController {
  const [enabled, setEnabled] = useState(false);
  const [remote, setRemote] = useState<ChoreSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [overlay, setOverlay] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const lastFetch = useRef(0);
  const inFlight = useRef(false);
  // Synchronous guard: two taps in the same frame must not both write.
  const writing = useRef(new Set<string>());
  const demoRef = useRef(demo);
  // The newest demo state we produced. Commands can follow each other faster than
  // React re-renders (e.g. adding several chores in a loop), so each one must build
  // on the previous result, not on the state of the last render.
  const demoStateRef = useRef<TasksState | null>(demo?.state ?? null);
  useEffect(() => {
    demoRef.current = demo;
    demoStateRef.current = demo?.state ?? null;
  }, [demo]);

  const refresh = useCallback(async () => {
    if (demo || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await getChoreSnapshotAction({
        restaurantSlug,
        expectedContext,
      });
      lastFetch.current = Date.now();
      if (result.ok) {
        setRemote(result.data);
        setLoadError(null);
      } else if (result.sessionInvalid) {
        onSessionInvalid?.();
      } else if (result.contextStale) {
        onContextStale?.();
      } else {
        setLoadError(result.error);
      }
    } catch {
      setLoadError("Chore boards could not be loaded. Please try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [demo, restaurantSlug, expectedContext, onSessionInvalid, onContextStale]);

  useEffect(() => {
    if (demo || !enabled) return;
    void Promise.resolve().then(refresh);
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
  }, [demo, enabled, refresh]);

  const demoSnapshot = useMemo(() => {
    if (!demo) return null;
    return buildChoreSnapshot(demo.state.chores ?? emptyChoreState(), viewer);
  }, [demo, viewer]);

  const base = demo ? demoSnapshot : remote;
  const snapshot = useMemo(
    () => (base ? withCellOverlay(base, overlay, viewer) : null),
    [base, overlay, viewer],
  );

  const run = useCallback(
    async (command: ChoreCommand): Promise<ChoreRunResult> => {
      const current = demoRef.current;
      if (current) {
        const base = demoStateRef.current ?? current.state;
        const result = applyChoreCommand(
          base.chores ?? emptyChoreState(),
          command,
          {
            viewer,
            team: current.team,
            organizationId: current.organizationId,
            locationId: DEMO_CHORE_LOCATION_ID,
            now: new Date(),
            timeZone: current.timeZone,
          },
        );
        if (!result.ok) return { ok: false, error: result.error };
        const next = { ...base, chores: result.value };
        demoStateRef.current = next;
        current.setState(next);
        return { ok: true, outcome: result.outcome };
      }
      try {
        const result = await runChoreCommandAction({
          restaurantSlug,
          command,
          expectedContext,
        });
        if (result.ok) {
          setRemote(result.data);
          setLoadError(null);
          return { ok: true, outcome: result.outcome };
        }
        if (result.sessionInvalid) onSessionInvalid?.();
        if (result.contextStale) onContextStale?.();
        // Server truth wins: drop whatever the screen assumed and re-read.
        void refresh();
        return { ok: false, error: result.error };
      } catch {
        void refresh();
        return { ok: false, error: "That didn't work. Please try again." };
      }
    },
    [
      viewer,
      restaurantSlug,
      expectedContext,
      onSessionInvalid,
      onContextStale,
      refresh,
    ],
  );

  const setCell = useCallback(
    async (
      boardId: string,
      rowId: string,
      columnId: string,
      done: boolean,
      cycleId?: string | null,
    ): Promise<ChoreRunResult> => {
      const key = cellKey(boardId, rowId, columnId);
      if (writing.current.has(key)) {
        return { ok: false, error: "Still saving the last change." };
      }
      writing.current.add(key);
      setPending((p) => new Set(p).add(key));
      setOverlay((o) => new Map(o).set(key, done));
      try {
        return await run({
          type: "cellSet",
          boardId,
          rowId,
          columnId,
          done,
          cycleId: cycleId ?? null,
        });
      } finally {
        // Success: the returned snapshot already holds the new state. Failure:
        // dropping the overlay reverts the cell to what the server last said.
        writing.current.delete(key);
        setPending((p) => {
          const next = new Set(p);
          next.delete(key);
          return next;
        });
        setOverlay((o) => {
          const next = new Map(o);
          next.delete(key);
          return next;
        });
      }
    },
    [run],
  );

  const ensureLoaded = useCallback(() => setEnabled(true), []);

  // Demo twin of the on-load sweep the real snapshot read runs: roll the boards of
  // this location forward once when the Chore Wheel is first opened.
  const demoSwept = useRef(false);
  useEffect(() => {
    if (!demo || !enabled || demoSwept.current) return;
    demoSwept.current = true;
    void run({ type: "cyclesSweep" });
  }, [demo, enabled, run]);

  const loadHistory = useCallback(
    async (filter: {
      month: string | null;
      boardId: string | null;
    }): Promise<ChoreHistoryResult> => {
      const current = demoRef.current;
      if (current) {
        const state = demoStateRef.current ?? current.state;
        return {
          ok: true,
          data: listChoreRuns(
            state.chores ?? emptyChoreState(),
            viewer,
            filter,
          ),
        };
      }
      try {
        const result = await getChoreHistoryAction({
          restaurantSlug,
          expectedContext,
          month: filter.month,
          boardId: filter.boardId,
        });
        if (result.ok) return { ok: true, data: result.data };
        if (result.sessionInvalid) onSessionInvalid?.();
        if (result.contextStale) onContextStale?.();
        return { ok: false, error: result.error };
      } catch {
        return { ok: false, error: "Chore history could not be loaded." };
      }
    },
    [viewer, restaurantSlug, expectedContext, onSessionInvalid, onContextStale],
  );

  const loadRunDetail = useCallback(
    async (cycleId: string): Promise<ChoreRunDetailResult> => {
      const current = demoRef.current;
      if (current) {
        const state = demoStateRef.current ?? current.state;
        const detail = choreRunDetail(
          state.chores ?? emptyChoreState(),
          viewer,
          cycleId,
        );
        return detail
          ? { ok: true, data: detail }
          : { ok: false, error: "That run could not be found." };
      }
      try {
        const result = await getChoreRunDetailAction({
          restaurantSlug,
          expectedContext,
          cycleId,
        });
        if (result.ok) return { ok: true, data: result.data };
        if (result.sessionInvalid) onSessionInvalid?.();
        if (result.contextStale) onContextStale?.();
        return { ok: false, error: result.error };
      } catch {
        return { ok: false, error: "That run could not be loaded." };
      }
    },
    [viewer, restaurantSlug, expectedContext, onSessionInvalid, onContextStale],
  );

  return {
    snapshot,
    loading: !demo && enabled && loading && remote === null,
    loadError,
    viewer,
    pendingCells: pending,
    ensureLoaded,
    run,
    setCell,
    refresh,
    loadHistory,
    loadRunDetail,
  };
}

export type { ChoreState };
