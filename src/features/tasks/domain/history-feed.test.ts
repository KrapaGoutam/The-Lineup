import { describe, expect, it } from "vitest";

import {
  DEFAULT_FEED_FILTERS,
  buildHistoryItems,
  feedMonths,
  filterHistoryItems,
  groupHistoryItems,
  taskMonthInfo,
  type FeedTask,
} from "./history-feed";
import type { ChoreRunSummary } from "./chore-types";
import { makeTask } from "./task-test-helpers";

const TZ = "America/Chicago";
const ann = { profileId: "ann", name: "Ann" };

function ft(overrides: Parameters<typeof makeTask>[0]): FeedTask {
  return { task: makeTask(overrides), assignedAt: null, archived: false };
}

function run(overrides: Partial<ChoreRunSummary>): ChoreRunSummary {
  return {
    cycleId: "c1",
    boardId: "b1",
    boardName: "Mango Lassi",
    sequence: 1,
    status: "completed",
    completed: true,
    businessDate: "2026-11-12",
    requiredTotal: 9,
    requiredDone: 9,
    optionalTotal: 0,
    optionalDone: 0,
    openedAt: "2026-11-12T15:00:00Z",
    closedAt: "2026-11-12T16:00:00Z",
    closedByKind: "system",
    closedByName: null,
    closeTrigger: "automatic",
    note: null,
    structureChanged: false,
    ...overrides,
  };
}

describe("month basis (documented grouping rule)", () => {
  it("a completed task is grouped by the LOCATION-local month it was completed", () => {
    // 2026-12-01T03:30Z is still Nov 30 in Chicago: November, not December.
    expect(
      taskMonthInfo(
        makeTask({ status: "completed", completedAt: "2026-12-01T03:30:00Z" }),
        TZ,
      ),
    ).toMatchObject({
      month: "2026-11",
      basis: "completed",
      date: "2026-11-30",
    });
  });

  it("work that is not completed is grouped by its due date, else by its created month", () => {
    expect(
      taskMonthInfo(makeTask({ status: "open", dueDate: "2026-12-02" }), TZ),
    ).toMatchObject({ month: "2026-12", basis: "due" });
    expect(
      taskMonthInfo(
        makeTask({ status: "in_progress", createdAt: "2026-10-31T23:00:00Z" }),
        TZ,
      ),
    ).toMatchObject({ month: "2026-10", basis: "created" });
  });

  it("a task that moves from Completed back to In Progress changes group, not history", () => {
    const completed = taskMonthInfo(
      makeTask({
        status: "completed",
        completedAt: "2026-11-02T18:00:00Z",
        dueDate: "2026-10-05",
      }),
      TZ,
    );
    const reopened = taskMonthInfo(
      makeTask({
        status: "in_progress",
        completedAt: null,
        dueDate: "2026-10-05",
      }),
      TZ,
    );
    expect(completed.month).toBe("2026-11");
    expect(reopened.month).toBe("2026-10");
  });
});

describe("grouping and filtering", () => {
  const items = buildHistoryItems({
    timeZone: TZ,
    tasks: [
      ft({
        id: "a",
        title: "Prepare bar closing checklist",
        status: "completed",
        completedAt: "2026-11-05T20:00:00Z",
        assignees: [ann],
        completedBy: ann,
      }),
      ft({
        id: "b",
        title: "Refill dining room napkins",
        status: "open",
        dueDate: "2026-11-20",
      }),
      ft({
        id: "c",
        title: "Check refrigerator temperatures",
        status: "in_progress",
        dueDate: "2026-11-21",
      }),
      ft({
        id: "d",
        title: "Order replacement blender",
        status: "completed",
        completedAt: "2026-10-08T18:00:00Z",
      }),
      ft({
        id: "e",
        title: "Deep-clean prep shelves",
        status: "cancelled",
        dueDate: "2026-10-20",
      }),
      ft({
        id: "f",
        title: "Blocked thing",
        status: "blocked",
        dueDate: "2026-10-21",
      }),
    ],
    runs: [
      run({ cycleId: "r1", sequence: 3 }),
      run({
        cycleId: "r2",
        boardId: "b2",
        boardName: "Rasmalai",
        sequence: 1,
        status: "open",
        completed: false,
        requiredDone: 4,
        closedAt: null,
        closedByKind: null,
        closeTrigger: null,
      }),
      run({
        cycleId: "r3",
        boardId: "b1",
        sequence: 2,
        status: "cancelled",
        completed: false,
        businessDate: "2026-10-30",
        requiredDone: 2,
        closedByKind: "user",
        closedByName: "Maya",
        closeTrigger: "cancelled",
        note: "Closed early",
      }),
    ],
  });

  it("groups Month → Completed / Not completed and keeps every status distinct", () => {
    const groups = groupHistoryItems(items, "newest");
    expect(groups.map((g) => g.label)).toEqual([
      "November 2026",
      "October 2026",
    ]);
    const nov = groups[0];
    expect(nov.completed.map((i) => i.id).sort()).toEqual(["run:r1", "task:a"]);
    expect(nov.notCompleted.map((i) => i.id).sort()).toEqual([
      "run:r2", // in progress is Not Completed
      "task:b",
      "task:c",
    ]);
    const oct = groups[1];
    expect(oct.completed.map((i) => i.id)).toEqual(["task:d"]);
    // Cancelled / blocked tasks and cancelled runs are Not Completed, never silently collapsed.
    expect(oct.notCompleted.map((i) => i.id).sort()).toEqual([
      "run:r3",
      "task:e",
      "task:f",
    ]);
  });

  it("filters All / Tasks / Chore Wheel, by board, by status and by employee", () => {
    const count = (f: Partial<typeof DEFAULT_FEED_FILTERS>) =>
      filterHistoryItems(items, { ...DEFAULT_FEED_FILTERS, ...f }).length;
    expect(count({})).toBe(9);
    expect(count({ scope: "tasks" })).toBe(6);
    expect(count({ scope: "chores" })).toBe(3);
    expect(count({ scope: "chores", boardId: "b2" })).toBe(1);
    expect(count({ month: "2026-10" })).toBe(4);
    expect(count({ status: "task:blocked" })).toBe(1);
    expect(count({ status: "run:cancelled" })).toBe(1);
    expect(count({ employee: "ann" })).toBe(1); // runs have no single employee
    expect(count({ search: "mango" })).toBe(2);
    expect(count({ search: "run 3" })).toBe(1);
  });

  it("orders newest first by default and lists months newest first", () => {
    expect(feedMonths(items).map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
    const oldest = groupHistoryItems(items, "oldest");
    expect(oldest[0].label).toBe("October 2026");
  });
});
