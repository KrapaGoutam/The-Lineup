"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getTaskHistoryAction,
  getTasksSnapshotAction,
  runTaskCommandAction,
} from "@/features/tasks/actions/tasks-actions";
import type { WorkspaceExpectation } from "@/features/context/domain/workspace-expectation";
import type { TaskCommand } from "@/features/tasks/domain/task-commands";
import { generateDailyChecklists } from "@/features/tasks/domain/checklist-engine";
import { runDemoOpeningReminders } from "@/features/tasks/domain/opening-reminder-engine";
import {
  applyCommand,
  buildSnapshot,
  generateRecurringTasks,
  sweepNotifications,
  type TasksState,
} from "@/features/tasks/domain/task-engine";
import {
  demoHistoryEntries,
  type TaskHistoryData,
} from "@/features/tasks/domain/task-history";
import type {
  TaskTeamMember,
  TaskViewer,
  TasksSnapshot,
} from "@/features/tasks/domain/task-types";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

export type TaskRunResult = { ok: true } | { ok: false; error: string };

export type TaskHistoryLoadResult =
  | { ok: true; data: TaskHistoryData }
  | { ok: false; error: string };

export type TasksController = {
  snapshot: TasksSnapshot | null;
  /** Re-evaluated on a timer so derived OVERDUE flips without a refetch. */
  now: Date;
  loading: boolean;
  /** Last load failure; mutations report through `run` instead. */
  loadError: string | null;
  /** Task ids with a mutation in flight (UI shows a transient state only). */
  pendingIds: ReadonlySet<string>;
  viewer: TaskViewer;
  run: (command: TaskCommand) => Promise<TaskRunResult>;
  refresh: () => Promise<void>;
  /** Read-only completed-task history for Tasks → History. */
  loadHistory: () => Promise<TaskHistoryLoadResult>;
};

type DemoBinding = {
  state: TasksState;
  setState: (next: TasksState) => void;
  team: readonly TaskTeamMember[];
  timeZone: string;
  organizationId: string;
  openingReminders?: boolean;
};

type Options = {
  demo: DemoBinding | null;
  restaurantSlug: string;
  viewer: TaskViewer;
  onSessionInvalid?: () => void;
  /**
   * V2-003.005: the workspace (profile, organization, location) this screen
   * was rendered for. Sent with every real-mode call as an UNTRUSTED assertion
   * the server must confirm before it reads or writes anything.
   */
  expectedContext?: WorkspaceExpectation | null;
  /** The server refused because that workspace is no longer the active one. */
  onContextStale?: () => void;
};

const CLOCK_TICK_MS = 30_000;
const FOCUS_REFRESH_MIN_MS = 5_000;

function commandTaskIds(command: TaskCommand): string[] {
  if (
    command.type === "create" ||
    command.type === "notificationsRead" ||
    command.type === "templateSave" ||
    command.type === "templateSetActive" ||
    command.type === "seriesCreate" ||
    command.type === "seriesUpdate" ||
    command.type === "seriesStop"
  ) {
    return [];
  }
  if (command.type === "carryForward") return command.taskIds;
  return [command.taskId];
}

/**
 * The single seam between Tasks screens and their data source.
 *
 * Real mode: the database is authoritative. Every mutation goes through a
 * Server Action that returns the refetched snapshot; the snapshot is replaced
 * wholesale (never patched), and is re-fetched on mount, on tab focus and
 * after any failure -- so a missed update can never leave stale state, with
 * or without Realtime (see #134).
 *
 * Demo mode: the same commands run through the in-memory engine.
 */
export function useTasksController({
  demo,
  restaurantSlug,
  viewer,
  onSessionInvalid,
  expectedContext = null,
  onContextStale,
}: Options): TasksController {
  const [now, setNow] = useState(() => new Date());
  const [remote, setRemote] = useState<TasksSnapshot | null>(null);
  const [loading, setLoading] = useState(demo === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (demo || inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await getTasksSnapshotAction({
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
      setLoadError("Tasks could not be loaded. Please try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [demo, restaurantSlug, onSessionInvalid, expectedContext, onContextStale]);

  useEffect(() => {
    if (demo) return;
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
  }, [demo, refresh]);

  // Demo mode: start today's checklists on first open, like the database's
  // idempotent checklist_generate_daily does for real mode.
  useEffect(() => {
    if (!demo) return;
    const today = zonedWallTimeFromInstant(now, demo.timeZone).date;
    const ctx = {
      actor: viewer,
      team: demo.team,
      timeZone: demo.timeZone,
      now,
    };
    const withChecklists = generateDailyChecklists(
      demo.state,
      ctx,
      today,
      today,
    );
    // Same lazy, idempotent top-up as task_recurrence_generate.
    const withSeries = generateRecurringTasks(withChecklists, ctx, today);
    // Same idempotent Opening reminder sweep as task_opening_reminders_sweep
    // (opt-in in demo mode, so an ordinary demo is never interrupted).
    const withReminders = demo.openingReminders
      ? runDemoOpeningReminders(withSeries, ctx)
      : withSeries;
    // Same idempotent due-soon / overdue sweep as task_notifications_sweep.
    const next = sweepNotifications(withReminders, ctx);
    if (next !== demo.state) demo.setState(next);
  }, [demo, viewer, now]);

  const demoSnapshot = useMemo(() => {
    if (!demo) return null;
    return buildSnapshot(demo.state, {
      actor: viewer,
      team: demo.team,
      timeZone: demo.timeZone,
      now,
      organizationId: demo.organizationId,
      locationId: null,
      today: zonedWallTimeFromInstant(now, demo.timeZone).date,
    });
  }, [demo, viewer, now]);

  const run = useCallback(
    async (command: TaskCommand): Promise<TaskRunResult> => {
      const ids = commandTaskIds(command);
      setPendingIds((current) => new Set([...current, ...ids]));
      const settle = () =>
        setPendingIds((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });

      try {
        if (demo) {
          const result = applyCommand(demo.state, command, {
            actor: viewer,
            team: demo.team,
            timeZone: demo.timeZone,
            now: new Date(),
          });
          if (!result.ok) return { ok: false, error: result.error };
          demo.setState(result.value);
          return { ok: true };
        }

        const result = await runTaskCommandAction({
          restaurantSlug,
          command,
          expectedContext,
        });
        if (result.ok) {
          setRemote(result.data);
          setLoadError(null);
          return { ok: true };
        }
        if (result.sessionInvalid) onSessionInvalid?.();
        if (result.contextStale) onContextStale?.();
        // Server truth wins: drop whatever the screen assumed and re-read.
        void refresh();
        return { ok: false, error: result.error };
      } catch {
        void refresh();
        return { ok: false, error: "That didn't work. Please try again." };
      } finally {
        settle();
      }
    },
    [
      demo,
      viewer,
      restaurantSlug,
      onSessionInvalid,
      expectedContext,
      onContextStale,
      refresh,
    ],
  );

  const loadHistory = useCallback(async (): Promise<TaskHistoryLoadResult> => {
    if (demo) {
      // Same rows the Today / Opening / Closing screens already show this
      // viewer, completed ones only (demo mode keeps everything in memory).
      const visible = demoSnapshot
        ? [
            ...demoSnapshot.tasks,
            ...demoSnapshot.checklists.flatMap((c) => c.items),
          ]
        : [];
      return {
        ok: true,
        data: {
          entries: demoHistoryEntries(visible, demo.state.events),
          truncated: false,
        },
      };
    }
    try {
      const result = await getTaskHistoryAction({
        restaurantSlug,
        expectedContext,
      });
      if (result.ok) return { ok: true, data: result.data };
      if (result.sessionInvalid) onSessionInvalid?.();
      if (result.contextStale) onContextStale?.();
      return { ok: false, error: result.error };
    } catch {
      return { ok: false, error: "Task history could not be loaded." };
    }
  }, [
    demo,
    demoSnapshot,
    restaurantSlug,
    onSessionInvalid,
    expectedContext,
    onContextStale,
  ]);

  return {
    snapshot: demo ? demoSnapshot : remote,
    now,
    loading,
    loadError,
    pendingIds,
    viewer,
    run,
    refresh,
    loadHistory,
  };
}
