import { describe, expect, it } from "vitest";

import {
  canViewTask,
  canWorkTask,
  dueText,
  formatClock,
  isOverdue,
  personProgress,
  sortTasks,
  summarizeToday,
  taskBucket,
  taskProgress,
  taskTypeLabel,
} from "./task-rules";
import { makeTask, viewer } from "./task-test-helpers";

const NOW = new Date("2026-10-30T18:00:00Z");
const TODAY = "2026-10-30";
const ann = { profileId: "ann", name: "Ann" };
const bea = { profileId: "bea", name: "Bea" };

describe("isOverdue (TASK-010)", () => {
  it("is derived from dueAt for active statuses only", () => {
    const past = "2026-10-30T17:00:00Z";
    expect(isOverdue(makeTask({ dueAt: past }), NOW)).toBe(true);
    expect(
      isOverdue(makeTask({ dueAt: past, status: "in_progress" }), NOW),
    ).toBe(true);
    expect(isOverdue(makeTask({ dueAt: past, status: "blocked" }), NOW)).toBe(
      true,
    );
    expect(isOverdue(makeTask({ dueAt: past, status: "completed" }), NOW)).toBe(
      false,
    );
    expect(isOverdue(makeTask({ dueAt: past, status: "cancelled" }), NOW)).toBe(
      false,
    );
    expect(isOverdue(makeTask({ dueAt: "2026-10-30T19:00:00Z" }), NOW)).toBe(
      false,
    );
    expect(isOverdue(makeTask({ dueAt: null }), NOW)).toBe(false);
  });
});

describe("visibility and work permissions", () => {
  const individual = makeTask({
    assignmentMode: "individual",
    assignees: [ann],
  });

  it("staff see only their own individual tasks", () => {
    expect(canViewTask(viewer("ann"), individual)).toBe(true);
    expect(canViewTask(viewer("bea"), individual)).toBe(false);
  });

  it("managers see and work everything", () => {
    expect(canViewTask(viewer("mona"), individual)).toBe(true);
    expect(canWorkTask(viewer("mona"), individual)).toBe(true);
    expect(canWorkTask(viewer("asa"), individual)).toBe(true);
  });

  it("unrelated staff cannot work another person's task (TASK-007)", () => {
    expect(canWorkTask(viewer("bea"), individual)).toBe(false);
  });

  it("team/anyone tasks and checklist items are open to all", () => {
    expect(
      canWorkTask(viewer("bea"), makeTask({ assignmentMode: "all_team" })),
    ).toBe(true);
    const checklistItem = makeTask({
      kind: "opening",
      assignmentMode: "individual",
      assignees: [ann],
    });
    expect(canViewTask(viewer("bea"), checklistItem)).toBe(true);
    expect(canWorkTask(viewer("bea"), checklistItem)).toBe(false);
  });
});

describe("taskBucket", () => {
  it("separates today, upcoming, overdue and completed", () => {
    expect(
      taskBucket(
        makeTask({ dueDate: TODAY, dueAt: "2026-10-31T05:00:00Z" }),
        NOW,
        TODAY,
      ),
    ).toBe("today");
    expect(taskBucket(makeTask({ dueDate: "2026-11-02" }), NOW, TODAY)).toBe(
      "upcoming",
    );
    expect(taskBucket(makeTask({ startDate: "2026-11-01" }), NOW, TODAY)).toBe(
      "upcoming",
    );
    expect(
      taskBucket(
        makeTask({ startDate: TODAY, dueDate: "2026-11-02" }),
        NOW,
        TODAY,
      ),
    ).toBe("today");
    expect(
      taskBucket(makeTask({ dueAt: "2026-10-30T10:00:00Z" }), NOW, TODAY),
    ).toBe("overdue");
    expect(taskBucket(makeTask({ status: "completed" }), NOW, TODAY)).toBe(
      "completed",
    );
    expect(taskBucket(makeTask(), NOW, TODAY)).toBe("today");
  });
});

describe("sortTasks", () => {
  it("orders overdue, then urgent, then soonest due, then completed", () => {
    const tasks = [
      makeTask({ id: "normal", title: "b", dueAt: "2026-10-30T22:00:00Z" }),
      makeTask({
        id: "urgent",
        title: "a",
        priority: "urgent",
        dueAt: "2026-10-30T23:00:00Z",
      }),
      makeTask({ id: "late", title: "c", dueAt: "2026-10-30T01:00:00Z" }),
      makeTask({ id: "done", title: "d", status: "completed" }),
    ];
    expect(sortTasks(tasks, NOW, TODAY).map((t) => t.id)).toEqual([
      "late",
      "urgent",
      "normal",
      "done",
    ]);
  });
});

describe("progress", () => {
  it("excludes cancelled and rounds the percentage", () => {
    const tasks = [
      makeTask({ status: "completed" }),
      makeTask({ status: "completed" }),
      makeTask({ status: "open" }),
      makeTask({ status: "cancelled" }),
    ];
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 3, percent: 67 });
    expect(taskProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("rolls up per assignee", () => {
    const tasks = [
      makeTask({ assignees: [ann], status: "completed" }),
      makeTask({ assignees: [ann] }),
      makeTask({ assignees: [bea] }),
    ];
    expect(personProgress(tasks)).toEqual([
      { profileId: "ann", name: "Ann", done: 1, total: 2 },
      { profileId: "bea", name: "Bea", done: 0, total: 1 },
    ]);
  });
});

describe("summarizeToday", () => {
  it("counts my work, team work and upcoming", () => {
    const tasks = [
      makeTask({
        id: "1",
        assignmentMode: "individual",
        assignees: [ann],
        dueAt: "2026-10-30T10:00:00Z",
      }),
      makeTask({ id: "2", assignmentMode: "individual", assignees: [ann] }),
      makeTask({ id: "3", assignmentMode: "individual", assignees: [bea] }),
      makeTask({
        id: "4",
        assignmentMode: "individual",
        assignees: [ann],
        dueDate: "2026-11-05",
      }),
    ];
    expect(summarizeToday(tasks, viewer("ann"), NOW, TODAY)).toEqual({
      myOpen: 2,
      myOverdue: 1,
      teamOpen: 3,
      teamOverdue: 1,
      upcoming: 1,
    });
  });
});

describe("labels", () => {
  it("formats due text and clock times", () => {
    expect(formatClock("15:00")).toBe("3:00 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(
      dueText({ dueDate: TODAY, dueTime: "15:00", dueWindow: null }, TODAY),
    ).toBe("Due 3:00 PM");
    expect(
      dueText({ dueDate: TODAY, dueTime: null, dueWindow: "closing" }, TODAY),
    ).toBe("Due Closing");
    expect(
      dueText(
        { dueDate: "2026-10-31", dueTime: "09:30", dueWindow: null },
        TODAY,
      ),
    ).toBe("Due Tomorrow 9:30 AM");
    expect(
      dueText({ dueDate: "2026-11-05", dueTime: null, dueWindow: null }, TODAY),
    ).toBe("Due Nov 5");
    expect(
      dueText({ dueDate: null, dueTime: null, dueWindow: null }, TODAY),
    ).toBe("No due date");
  });

  it("names the task type", () => {
    expect(taskTypeLabel({ kind: "task", assignmentMode: "individual" })).toBe(
      "Individual",
    );
    expect(taskTypeLabel({ kind: "task", assignmentMode: "multiple" })).toBe(
      "Team",
    );
    expect(taskTypeLabel({ kind: "opening", assignmentMode: "anyone" })).toBe(
      "Opening",
    );
  });
});
