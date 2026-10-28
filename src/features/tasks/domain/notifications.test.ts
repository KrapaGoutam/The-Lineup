import { describe, expect, it } from "vitest";

import { generateDailyChecklists } from "./checklist-engine";
import type { TaskCommand, TaskCreateInput } from "./task-commands";
import {
  applyCommand,
  buildSnapshot,
  emptyTasksState,
  isOperationalNotification,
  notify,
  sweepNotifications,
  type TasksState,
} from "./task-engine";
import { ctxFor, makeTask } from "./task-test-helpers";

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

const OPENING_TEMPLATE: TaskCommand = {
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
};

/** A state whose Opening checklist was started by `starter`. */
function withOpeningChecklist(starter = "cal"): TasksState {
  const state = must(emptyTasksState(), "mona", OPENING_TEMPLATE);
  return generateDailyChecklists(
    state,
    ctxFor(starter, NOW),
    "2026-10-30",
    "2026-10-30",
  );
}

const eventTypes = (state: TasksState) => state.events.map((e) => e.type);

// PLAN D-3 (#154): the inbox carries Opening / Closing operational work only.
describe("ordinary task notifications are suppressed (TS-040)", () => {
  it("stores nothing when a normal task is assigned", () => {
    const state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    expect(state.notifications).toEqual([]);
    expect(snapshotFor(state, "ann").notifications).toEqual([]);
    expect(snapshotFor(state, "ann").unreadCount).toBe(0);
  });

  it("stores nothing when a normal task is reassigned", () => {
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
    expect(state.notifications).toEqual([]);
  });

  it("stores nothing when a normal task is completed, for you or for the creator", () => {
    const state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    const id = state.tasks[0].id;
    const onBehalf = must(state, "asa", { type: "complete", taskId: id });
    expect(onBehalf.notifications).toEqual([]);
    const byAssignee = must(state, "ann", { type: "complete", taskId: id });
    expect(byAssignee.notifications).toEqual([]);
  });

  it("the due-soon / overdue sweep stores nothing", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Late", dueTime: "11:00", assigneeIds: ["bea"] },
    });
    const swept = sweepNotifications(state, ctxFor("cal", NOW));
    expect(swept).toBe(state);
    expect(swept.notifications).toEqual([]);
  });
});

describe("audit history survives the narrowing (TS-042)", () => {
  it("still records created / reassigned / completed / reopened / cancelled events", () => {
    let state = must(emptyTasksState(), "mona", {
      type: "create",
      input: base,
    });
    const id = state.tasks[0].id;
    state = must(state, "mona", {
      type: "assign",
      taskId: id,
      assignmentMode: "individual",
      assigneeIds: ["bea"],
    });
    state = must(state, "asa", { type: "complete", taskId: id });
    state = must(state, "asa", { type: "reopen", taskId: id });
    state = must(state, "mona", { type: "cancel", taskId: id, reason: null });

    // No inbox item at all...
    expect(state.notifications).toEqual([]);
    // ...yet every action left its audit event, attributed to the real actor.
    expect(eventTypes(state)).toEqual(
      expect.arrayContaining([
        "created",
        "reassigned",
        "completed",
        "reopened",
        "cancelled",
      ]),
    );
    const completed = state.events.find((e) => e.type === "completed");
    expect(completed?.actor?.profileId).toBe("asa");
  });

  it("keeps generation audit while announcing the checklist", () => {
    const state = withOpeningChecklist();
    expect(eventTypes(state)).toContain("checklist_generated");
  });
});

describe("Opening / Closing operational notifications are kept (TS-041)", () => {
  it("announces a new checklist to everyone except whoever started it", () => {
    const state = withOpeningChecklist("cal");
    expect(snapshotFor(state, "bea").notifications.map((n) => n.type)).toEqual([
      "checklist_available",
    ]);
    expect(snapshotFor(state, "ann").notifications).toHaveLength(1);
    expect(snapshotFor(state, "cal").notifications).toEqual([]);
  });

  it("announces a Closing checklist the same way", () => {
    const state = generateDailyChecklists(
      must(emptyTasksState(), "mona", {
        ...OPENING_TEMPLATE,
        input: {
          ...(
            OPENING_TEMPLATE as Extract<TaskCommand, { type: "templateSave" }>
          ).input,
          kind: "closing",
          name: "Weekday Closing",
        },
      } as TaskCommand),
      ctxFor("cal", NOW),
      "2026-10-30",
      "2026-10-30",
    );
    expect(snapshotFor(state, "bea").notifications.map((n) => n.title)).toEqual(
      ["Closing checklist is ready"],
    );
  });

  it("is idempotent: regenerating the day adds no duplicate", () => {
    const state = withOpeningChecklist("cal");
    const again = generateDailyChecklists(
      state,
      ctxFor("cal", NOW),
      "2026-10-30",
      "2026-10-30",
    );
    expect(again).toBe(state);
    expect(state.notifications).toHaveLength(4);
  });

  it("keeps Opening / Closing assignment and completion-for-you at the gate", () => {
    const state = withOpeningChecklist("cal");
    const opening = state.tasks.find((t) => t.kind === "opening")!;
    const closing = { ...opening, id: "closing-1", kind: "closing" as const };
    const withClosing: TasksState = {
      ...state,
      notifications: [],
      tasks: [...state.tasks, closing],
    };
    for (const task of [opening, closing]) {
      for (const [type, title] of [
        ["assigned", "New task for you"],
        ["reassigned", "A task was assigned to you"],
        ["completed", "Your task was completed for you"],
      ] as const) {
        const stored = notify(withClosing, ctxFor("mona", NOW), {
          recipientId: "ann",
          type,
          taskId: task.id,
          title,
          body: task.title,
        });
        expect(stored.notifications).toHaveLength(1);
        expect(stored.notifications[0]).toMatchObject({
          recipientId: "ann",
          type,
          taskId: task.id,
        });
      }
    }
  });

  it("only notifies the named recipient: nothing leaks to a coworker", () => {
    const state = withOpeningChecklist("cal");
    const task = state.tasks.find((t) => t.kind === "opening")!;
    const stored = notify(
      { ...state, notifications: [] },
      ctxFor("mona", NOW),
      {
        recipientId: "ann",
        type: "assigned",
        taskId: task.id,
        title: "New task for you",
        body: task.title,
      },
    );
    expect(snapshotFor(stored, "ann").notifications).toHaveLength(1);
    expect(snapshotFor(stored, "bea").notifications).toEqual([]);
    expect(snapshotFor(stored, "mona").notifications).toEqual([]);
  });

  it("still drops inactive recipients", () => {
    const state = withOpeningChecklist("cal");
    const task = state.tasks.find((t) => t.kind === "opening")!;
    const stored = notify(
      { ...state, notifications: [] },
      ctxFor("mona", NOW),
      {
        recipientId: "ghost",
        type: "assigned",
        taskId: task.id,
        title: "x",
        body: null,
      },
    );
    expect(stored.notifications).toEqual([]);
  });
});

describe("operational gate (TS-043 policy vectors)", () => {
  // Shared with pgTAP 0041: the same (type, source kind) pairs must agree.
  const vectors: [string, string | null, boolean][] = [
    ["assigned", "task", false],
    ["reassigned", "task", false],
    ["completed", "task", false],
    ["due_soon", "task", false],
    ["overdue", "task", false],
    ["assigned", "opening", true],
    ["reassigned", "opening", true],
    ["completed", "opening", true],
    ["assigned", "closing", true],
    ["completed", "closing", true],
    ["checklist_available", null, true],
    // Fails closed: nothing names an operational source.
    ["assigned", null, false],
    ["completed", "missing", false],
  ];

  it.each(vectors)("%s from %s -> kept: %s", (type, kind, kept) => {
    const state: TasksState = {
      ...emptyTasksState(),
      tasks:
        kind && kind !== "missing"
          ? [
              makeTask({
                id: "src",
                kind: kind as "task" | "opening" | "closing",
              }),
            ]
          : [],
    };
    expect(
      isOperationalNotification(state, {
        type: type as Parameters<typeof isOperationalNotification>[1]["type"],
        taskId: kind ? "src" : null,
      }),
    ).toBe(kept);
  });
});

describe("opening_reminder gate (T-4, mirrors pgTAP 0042 section 8)", () => {
  const reminder = {
    stage: "open" as const,
    serviceDate: "2026-07-01",
    locationId: "loc",
    stageAt: "2026-07-01T14:00:00Z",
    incompleteCount: 2,
    incompleteNow: 2,
  };
  const key = "opening_reminder:loc:2026-07-01:open";
  const input = {
    type: "opening_reminder" as const,
    taskId: null,
    reminder,
    dedupeKey: key,
  };
  const state = emptyTasksState();

  it("keeps a structured reminder", () => {
    expect(isOperationalNotification(state, input)).toBe(true);
  });

  it.each([
    [
      "a mismatched dedupe key",
      { ...input, dedupeKey: "opening_reminder:wrong" },
    ],
    ["no dedupe key", { ...input, dedupeKey: null }],
    ["no payload", { ...input, reminder: null }],
    ["a task reference", { ...input, taskId: "t1" }],
    [
      "a stage that does not match its key",
      { ...input, reminder: { ...reminder, stage: "plus_15" as const } },
    ],
  ])("fails closed on %s", (_label, bad) => {
    expect(isOperationalNotification(state, bad)).toBe(false);
  });

  it("an Opening task id cannot carry an opening_reminder through the task clause", () => {
    const withTask: TasksState = {
      ...state,
      tasks: [makeTask({ id: "src", kind: "opening" })],
    };
    expect(
      isOperationalNotification(withTask, {
        type: "opening_reminder",
        taskId: "src",
        reminder: null,
        dedupeKey: null,
      }),
    ).toBe(false);
  });

  it("notify stores one per recipient and key, with its payload, and nothing else leaks in", () => {
    const ctx = ctxFor("mona", NOW);
    const send = (s: TasksState, recipientId: string) =>
      notify(s, ctx, {
        recipientId,
        type: "opening_reminder",
        taskId: null,
        title: "Opening tasks are not complete",
        body: "2 Opening tasks are not complete",
        dedupeKey: key,
        reminder,
      });
    let next = send(state, "ann");
    next = send(next, "ann");
    next = send(next, "bea");
    expect(next.notifications.map((n) => n.recipientId)).toEqual([
      "ann",
      "bea",
    ]);
    expect(next.notifications[0]?.reminder).toEqual(reminder);
    expect(next.notifications[0]?.taskId).toBeNull();
    // An existing ordinary-notification policy is untouched.
    expect(
      isOperationalNotification(state, { type: "assigned", taskId: null }),
    ).toBe(false);
  });
});

describe("read state (TASK-053)", () => {
  it("marks some or all read, only for the viewer", () => {
    // Two checklists (Opening + Closing) give each non-starter two notifications.
    let state = must(emptyTasksState(), "mona", OPENING_TEMPLATE);
    state = must(state, "mona", {
      ...OPENING_TEMPLATE,
      input: {
        ...(OPENING_TEMPLATE as Extract<TaskCommand, { type: "templateSave" }>)
          .input,
        kind: "closing",
        name: "Weekday Closing",
      },
    } as TaskCommand);
    state = generateDailyChecklists(
      state,
      ctxFor("cal", NOW),
      "2026-10-30",
      "2026-10-30",
    );
    expect(snapshotFor(state, "ann").unreadCount).toBe(2);

    const first = snapshotFor(state, "ann").notifications[0].id;
    state = must(state, "ann", { type: "notificationsRead", ids: [first] });
    expect(snapshotFor(state, "ann").unreadCount).toBe(1);

    state = must(state, "ann", { type: "notificationsRead", ids: null });
    expect(snapshotFor(state, "ann").unreadCount).toBe(0);
    expect(snapshotFor(state, "bea").unreadCount).toBe(2);
  });
});
