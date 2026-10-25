import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TasksSnapshot } from "../domain/task-types";

const actions = vi.hoisted(() => ({
  getTasksSnapshotAction: vi.fn(),
  runTaskCommandAction: vi.fn(),
}));
vi.mock("@/features/tasks/actions/tasks-actions", () => actions);

import { useTasksController } from "./use-tasks-controller";

function snapshot(title: string): TasksSnapshot {
  return {
    organizationId: "org",
    locationId: "loc",
    timeZone: "America/Chicago",
    today: "2026-10-30",
    generatedAt: "2026-10-30T18:00:00Z",
    tasks: [
      {
        id: "t1",
        kind: "task",
        title,
        instructions: null,
        category: "other",
        priority: "normal",
        status: "open",
        assignmentMode: "anyone",
        assignees: [],
        startDate: null,
        dueDate: null,
        dueTime: null,
        dueWindow: null,
        dueAt: null,
        blockedReason: null,
        completedBy: null,
        completedAt: null,
        completionNote: null,
        cancelledAt: null,
        groupId: null,
        recurrenceRuleId: null,
        checklistInstanceId: null,
        sortOrder: 0,
        createdBy: null,
        createdAt: "2026-10-30T00:00:00Z",
      },
    ],
    checklists: [],
    notifications: [],
    unreadCount: 0,
    series: [],
    templates: [],
    events: [],
    team: [],
    categories: [],
  };
}

const viewer = { profileId: "ann", name: "Ann", designation: "staff" as const };

describe("useTasksController in real mode (no Realtime)", () => {
  beforeEach(() => {
    actions.getTasksSnapshotAction.mockReset();
    actions.runTaskCommandAction.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("TASK-083 a failed mutation reports the error and re-reads server truth", async () => {
    actions.getTasksSnapshotAction.mockResolvedValue({
      ok: true,
      data: snapshot("server version"),
    });
    actions.runTaskCommandAction.mockResolvedValue({
      ok: false,
      error: "You cannot complete that.",
    });

    const { result } = renderHook(() =>
      useTasksController({ demo: null, restaurantSlug: "the-monks", viewer }),
    );
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(actions.getTasksSnapshotAction).toHaveBeenCalledTimes(1);

    let outcome: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      outcome = await result.current.run({ type: "complete", taskId: "t1" });
    });

    expect(outcome).toEqual({ ok: false, error: "You cannot complete that." });
    // The snapshot is never patched locally, and a refetch follows the failure.
    expect(result.current.snapshot?.tasks[0].status).toBe("open");
    await waitFor(() =>
      expect(actions.getTasksSnapshotAction).toHaveBeenCalledTimes(2),
    );
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("a successful mutation replaces the snapshot with the server's result", async () => {
    actions.getTasksSnapshotAction.mockResolvedValue({
      ok: true,
      data: snapshot("before"),
    });
    actions.runTaskCommandAction.mockResolvedValue({
      ok: true,
      data: snapshot("after"),
    });
    const { result } = renderHook(() =>
      useTasksController({ demo: null, restaurantSlug: "the-monks", viewer }),
    );
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(async () => {
      await result.current.run({ type: "complete", taskId: "t1" });
    });
    expect(result.current.snapshot?.tasks[0].title).toBe("after");
  });

  it("TASK-084 refocusing the window reconciles stale state", async () => {
    actions.getTasksSnapshotAction
      .mockResolvedValueOnce({ ok: true, data: snapshot("stale") })
      .mockResolvedValue({ ok: true, data: snapshot("fresh") });
    const { result } = renderHook(() =>
      useTasksController({ demo: null, restaurantSlug: "the-monks", viewer }),
    );
    await waitFor(() =>
      expect(result.current.snapshot?.tasks[0].title).toBe("stale"),
    );

    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 60_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(result.current.snapshot?.tasks[0].title).toBe("fresh"),
    );
  });
});
