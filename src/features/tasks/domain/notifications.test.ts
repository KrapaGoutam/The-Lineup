import { describe, expect, it } from "vitest";

import { generateDailyChecklists } from "./checklist-engine";
import type { TaskCommand, TaskCreateInput } from "./task-commands";
import {
  applyCommand,
  buildSnapshot,
  emptyTasksState,
  sweepNotifications,
  type TasksState,
} from "./task-engine";
import { ctxFor } from "./task-test-helpers";

const NOW = new Date("2026-10-30T18:00:00Z"); // 1:00 PM CDT

const base: TaskCreateInput = {
  title: "Clean patio",
  instructions: null,
  category: "cleaning",
  priority: "normal",
  startDate: null,
  dueDate: "2026-10-30",
  dueTime: "13:30", // 30 minutes after NOW in Chicago
  dueWindow: null,
  assignmentMode: "individual",
  assigneeIds: ["ann"],
  eachPerson: false,
};

function must(state: TasksState, actor: string, command: TaskCommand) {
  const result = applyCommand(state, command, ctxFor(actor, NOW));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const snapshotFor = (state: TasksState, actor: string) =>
  buildSnapshot(state, {
    ...ctxFor(actor, NOW),
    organizationId: "org",
    locationId: "loc",
    today: "2026-10-30",
  });

describe("event notifications (TASK-050/051)", () => {
  it("notifies the assignee, not the manager who assigned", () => {
    const state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    expect(snapshotFor(state, "ann").notifications.map((n) => n.type)).toEqual([
      "assigned",
    ]);
    expect(snapshotFor(state, "mona").notifications).toEqual([]);
  });

  it("notifies only people newly added by a reassignment", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    state = must(state, "mona", {
      type: "assign",
      taskId: state.tasks[0].id,
      assignmentMode: "individual",
      assigneeIds: ["bea"],
    });
    expect(snapshotFor(state, "bea").notifications.map((n) => n.type)).toEqual([
      "reassigned",
    ]);
    expect(snapshotFor(state, "ann").notifications).toHaveLength(1);
  });

  it("tells assignees when a manager completes for them, else the creator", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    const id = state.tasks[0].id;
    const onBehalf = must(state, "asa", { type: "complete", taskId: id });
    expect(
      snapshotFor(onBehalf, "ann").notifications.map((n) => n.type),
    ).toContain("completed");
    state = must(state, "ann", { type: "complete", taskId: id });
    expect(snapshotFor(state, "mona").notifications.map((n) => n.type)).toEqual(
      ["completed"],
    );
  });

  it("announces a new checklist to everyone except whoever started it", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "templateSave",
      templateId: null,
      input: {
        kind: "opening",
        name: "Weekday Opening",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        items: [
          {
            title: "Unlock",
            instructions: null,
            category: "opening",
            priority: "normal",
            assignmentMode: "anyone",
            assigneeIds: [],
            dueWindow: null,
            dueTime: null,
          },
        ],
      },
    });
    state = generateDailyChecklists(
      state,
      ctxFor("cal", NOW),
      "2026-10-30",
      "2026-10-30",
    );
    expect(snapshotFor(state, "bea").notifications.map((n) => n.type)).toEqual([
      "checklist_available",
    ]);
    expect(snapshotFor(state, "cal").notifications).toEqual([]);
  });
});

describe("due-soon / overdue sweep (TASK-052)", () => {
  it("creates one due-soon and one overdue notification, once", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Late", dueTime: "11:00", assigneeIds: ["bea"] },
    });
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Far", dueTime: "18:00", assigneeIds: ["cal"] },
    });
    state = must(state, "mona", {
      type: "create",
      input: {
        ...base,
        title: "Team",
        assignmentMode: "all_team",
        assigneeIds: [],
        dueTime: "11:00",
      },
    });
    const swept = sweepNotifications(state, ctxFor("cal", NOW));
    const types = (who: string) =>
      snapshotFor(swept, who)
        .notifications.map((n) => n.type)
        .sort();
    expect(types("ann")).toEqual(["assigned", "due_soon"]);
    expect(types("bea")).toEqual(["assigned", "overdue"]);
    expect(types("cal")).toEqual(["assigned"]);
    expect(sweepNotifications(swept, ctxFor("cal", NOW))).toBe(swept);
  });
});

describe("read state (TASK-053)", () => {
  it("marks some or all read, only for the viewer", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Second" },
    });
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Other", assigneeIds: ["bea"] },
    });
    expect(snapshotFor(state, "ann").unreadCount).toBe(2);

    const first = snapshotFor(state, "ann").notifications[0].id;
    state = must(state, "ann", { type: "notificationsRead", ids: [first] });
    expect(snapshotFor(state, "ann").unreadCount).toBe(1);

    state = must(state, "ann", { type: "notificationsRead", ids: null });
    expect(snapshotFor(state, "ann").unreadCount).toBe(0);
    expect(snapshotFor(state, "bea").unreadCount).toBe(1);
  });
});
