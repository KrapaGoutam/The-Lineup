import { describe, expect, it } from "vitest";

import { generateDailyChecklists } from "./checklist-engine";
import {
  demoOpeningReminderPromptData,
  runDemoOpeningReminders,
} from "./opening-reminder-engine";
import { selectOpeningReminderPopup } from "./opening-reminder-popup";
import type { TaskCommand } from "./task-commands";
import { applyCommand, emptyTasksState, type TasksState } from "./task-engine";
import { ctxFor } from "./task-test-helpers";

// 2026-10-30 is CDT (UTC-5): the demo location opens at 09:00 = 14:00Z.
const at = (hhmm: string) => new Date(`2026-10-30T${hhmm}:00Z`);
const OPEN = "14:00";
const P15 = "14:15";
const P30 = "14:30";
const TODAY = "2026-10-30";

const item = (
  title: string,
  assignmentMode: "anyone" | "individual" | "multiple" | "all_team",
  assigneeIds: string[] = [],
) => ({
  title,
  instructions: null,
  category: "opening",
  priority: "normal" as const,
  assignmentMode,
  assigneeIds,
  dueWindow: null,
  dueTime: null,
});

function must(
  state: TasksState,
  actor: string,
  command: TaskCommand,
  now = at("13:00"),
) {
  const result = applyCommand(state, command, ctxFor(actor, now));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Ann: patio + register + anyone + TVs (4). Bea: register + anyone + TVs (3). Cal: anyone + TVs (2). */
function seeded(): TasksState {
  const withTemplate = must(emptyTasksState(), "mona", {
    type: "templateSave",
    templateId: null,
    input: {
      kind: "opening",
      name: "Weekday Opening",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      items: [
        item("Unlock entrance", "anyone"),
        item("Set patio", "individual", ["ann"]),
        item("Count register", "multiple", ["ann", "bea"]),
        item("Turn on TVs", "all_team"),
      ],
    },
  });
  return generateDailyChecklists(
    withTemplate,
    ctxFor("mona", at("13:00")),
    TODAY,
    TODAY,
  );
}

const sweep = (state: TasksState, hhmm: string) =>
  runDemoOpeningReminders(state, ctxFor("mona", at(hhmm)));

const stagesFor = (state: TasksState, who: string) =>
  state.notifications
    .filter((n) => n.recipientId === who && n.type === "opening_reminder")
    .map((n) => n.reminder?.stage);

const popupFor = (state: TasksState, who: string, hhmm: string) => {
  const data = demoOpeningReminderPromptData(state, ctxFor(who, at(hhmm)));
  return selectOpeningReminderPopup({
    reminders: data.reminders,
    today: data.today,
    locationId: data.locationId,
    currentIncomplete: data.currentIncomplete,
  });
};

describe("demo Opening reminder engine mirrors the T-4 sweep", () => {
  it("stores nothing before the opening instant", () => {
    expect(
      sweep(seeded(), "13:59").notifications.filter(
        (n) => n.type === "opening_reminder",
      ),
    ).toHaveLength(0);
  });

  it("OPEN at the opening instant, +15 and +30 at their own instants", () => {
    let state = sweep(seeded(), OPEN);
    expect(stagesFor(state, "mona")).toEqual(["open"]);
    state = sweep(state, "14:14");
    expect(stagesFor(state, "mona")).toEqual(["open"]);
    state = sweep(state, P15);
    expect(stagesFor(state, "mona")).toEqual(["open", "plus_15"]);
    state = sweep(state, P30);
    expect(stagesFor(state, "mona")).toEqual(["open", "plus_15", "plus_30"]);
    // Nothing exists after +30.
    state = sweep(state, "16:00");
    expect(stagesFor(state, "mona")).toHaveLength(3);
  });

  it("is idempotent", () => {
    const once = sweep(seeded(), "14:34");
    expect(sweep(once, "14:34")).toBe(once);
    expect(sweep(once, "14:40")).toBe(once);
  });

  it("CATCH-UP: a first look at 09:34 on open work stores OPEN, +15 and +30 as history", () => {
    const state = sweep(seeded(), "14:34");
    for (const who of ["mona", "asa", "ann", "bea", "cal"]) {
      expect(stagesFor(state, who)).toEqual(["open", "plus_15", "plus_30"]);
    }
  });

  it("CATCH-UP popup: all three stored and unread, the popup is +30 only", () => {
    const state = sweep(seeded(), "14:34");
    const popup = popupFor(state, "mona", "14:34");
    expect(popup?.reminder.stage).toBe("plus_30");
    // The stored history is untouched: three unread rows.
    const own = state.notifications.filter(
      (n) => n.recipientId === "mona" && n.type === "opening_reminder",
    );
    expect(own).toHaveLength(3);
    expect(own.every((n) => n.readAt === null)).toBe(true);
  });

  it("dismissing the +30 popup acknowledges only +30 and never surfaces the others", () => {
    let state = sweep(seeded(), "14:34");
    const popup = popupFor(state, "mona", "14:34")!;
    state = must(
      state,
      "mona",
      { type: "notificationsRead", ids: [popup.notificationId] },
      at("14:35"),
    );
    expect(popupFor(state, "mona", "14:36")).toBeNull();
    const own = state.notifications.filter(
      (n) => n.recipientId === "mona" && n.type === "opening_reminder",
    );
    expect(own.filter((n) => n.readAt).map((n) => n.reminder?.stage)).toEqual([
      "plus_30",
    ]);
    expect(own.filter((n) => !n.readAt)).toHaveLength(2);
  });

  it("work completed before the first look stores nothing and shows nothing", () => {
    let state = seeded();
    for (const task of state.tasks) {
      state = must(
        state,
        "mona",
        { type: "complete", taskId: task.id },
        at("14:05"),
      );
    }
    state = sweep(state, "14:34");
    // Nothing is open now, so no stage is stored (the SQL needs both).
    expect(stagesFor(state, "mona")).toEqual([]);
    expect(popupFor(state, "mona", "14:34")).toBeNull();
  });

  it("work completed AFTER the reminders were stored: history stays, no popup", () => {
    let state = sweep(seeded(), "14:34");
    for (const task of state.tasks) {
      state = must(
        state,
        "mona",
        { type: "complete", taskId: task.id },
        at("14:36"),
      );
    }
    expect(stagesFor(state, "mona")).toHaveLength(3);
    expect(popupFor(state, "mona", "14:37")).toBeNull();
  });

  it("work cancelled after the reminders were stored: no popup", () => {
    let state = sweep(seeded(), "14:34");
    for (const task of state.tasks) {
      state = must(
        state,
        "mona",
        { type: "cancel", taskId: task.id, reason: null },
        at("14:36"),
      );
    }
    expect(stagesFor(state, "mona")).toHaveLength(3);
    expect(popupFor(state, "mona", "14:37")).toBeNull();
  });

  it("a stage that was complete at its own instant is never back-filled", () => {
    let state = seeded();
    for (const task of state.tasks) {
      state = must(
        state,
        "mona",
        { type: "complete", taskId: task.id },
        at("14:05"),
      );
    }
    for (const task of state.tasks) {
      state = must(
        state,
        "mona",
        { type: "reopen", taskId: task.id },
        at("14:20"),
      );
    }
    state = sweep(state, "14:31");
    expect(stagesFor(state, "mona")).toEqual(["open", "plus_30"]);
  });

  it("staff only get reminders for work they may do, with no coworker data", () => {
    const state = sweep(seeded(), OPEN);
    const countOf = (who: string) =>
      state.notifications.find(
        (n) => n.recipientId === who && n.type === "opening_reminder",
      )?.reminder?.incompleteCount;
    expect(countOf("mona")).toBe(4);
    expect(countOf("ann")).toBe(4);
    expect(countOf("bea")).toBe(3);
    expect(countOf("cal")).toBe(2);
    for (const n of state.notifications.filter(
      (x) => x.type === "opening_reminder",
    )) {
      expect(n.taskId).toBeNull();
      expect(n.checklistInstanceId).toBeNull();
      expect(JSON.stringify(n)).not.toMatch(/Set patio|Count register|Unlock/);
    }
    // The read model the popup uses carries a number for the viewer's scope.
    const cal = demoOpeningReminderPromptData(state, ctxFor("cal", at(OPEN)));
    expect(cal.currentIncomplete).toBe(2);
    expect(cal.reminders.every((r) => r.taskId === null)).toBe(true);
  });

  it("a staff member with no authorized open item gets nothing", () => {
    // Only Ann's item remains open; Bea and Cal have nothing they may work.
    let state = seeded();
    for (const task of state.tasks.filter((t) => t.title !== "Set patio")) {
      state = must(
        state,
        "mona",
        { type: "complete", taskId: task.id },
        at("13:30"),
      );
    }
    state = sweep(state, OPEN);
    expect(stagesFor(state, "ann")).toEqual(["open"]);
    expect(stagesFor(state, "bea")).toEqual([]);
    expect(stagesFor(state, "cal")).toEqual([]);
    expect(stagesFor(state, "mona")).toEqual(["open"]);
  });

  it("does nothing without today's Opening checklist", () => {
    const state = emptyTasksState();
    expect(sweep(state, "14:34")).toBe(state);
  });
});
