import { describe, expect, it } from "vitest";

import {
  generateDailyChecklists,
  resolveItemAssignment,
  templateAppliesOn,
  weekdayOf,
} from "./checklist-engine";
import type { TaskCommand } from "./task-commands";
import { applyCommand, emptyTasksState, type TasksState } from "./task-engine";
import { taskProgress } from "./task-rules";
import { ctxFor } from "./task-test-helpers";

const TODAY = "2026-10-30";
const TOMORROW = "2026-10-31";

function must(state: TasksState, actor: string, command: TaskCommand) {
  const result = applyCommand(state, command, ctxFor(actor));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

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

function withTemplate(): TasksState {
  return must(emptyTasksState(), "mona", {
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
}

const gen = (state: TasksState, date: string) =>
  generateDailyChecklists(state, ctxFor("cal"), TODAY, date);

describe("daily checklist generation (TASK-020)", () => {
  it("creates one instance with one task per item and is idempotent", () => {
    const once = gen(withTemplate(), TODAY);
    expect(once.instances).toHaveLength(1);
    expect(once.tasks).toHaveLength(4);
    expect(
      once.tasks.every((t) => t.kind === "opening" && t.dueDate === TODAY),
    ).toBe(true);
    expect(gen(once, TODAY)).toBe(once);
  });

  it("only generates for today or later and for applicable weekdays", () => {
    const state = withTemplate();
    expect(
      generateDailyChecklists(state, ctxFor("cal"), TODAY, "2026-10-29"),
    ).toBe(state);
    const saturdayOnly = must(emptyTasksState(), "mona", {
      type: "templateSave",
      templateId: null,
      input: {
        kind: "opening",
        name: "Sat",
        daysOfWeek: [6],
        active: true,
        items: [item("x", "anyone")],
      },
    });
    expect(weekdayOf("2026-10-31")).toBe(6);
    expect(gen(saturdayOnly, TODAY).instances).toHaveLength(0);
    expect(gen(saturdayOnly, TOMORROW).instances).toHaveLength(1);
    expect(
      templateAppliesOn({ daysOfWeek: [6], active: false }, TOMORROW),
    ).toBe(false);
  });
});

describe("day-to-day isolation (TASK-025/026/027)", () => {
  it("never carries yesterday's checked state into the next day", () => {
    let state = gen(withTemplate(), TODAY);
    const unlock = state.tasks.find((t) => t.title === "Unlock entrance")!;
    state = must(state, "cal", { type: "complete", taskId: unlock.id });
    state = generateDailyChecklists(state, ctxFor("cal"), TODAY, TOMORROW);

    const tomorrow = state.instances.find((i) => i.serviceDate === TOMORROW)!;
    const tomorrowItems = state.tasks.filter(
      (t) => t.checklistInstanceId === tomorrow.id,
    );
    expect(tomorrowItems).toHaveLength(4);
    expect(tomorrowItems.every((t) => t.status === "open")).toBe(true);
    expect(state.tasks.find((t) => t.id === unlock.id)?.status).toBe(
      "completed",
    );
    expect(new Set(state.tasks.map((t) => t.id)).size).toBe(8);
  });

  it("editing a template does not rewrite a day that already exists", () => {
    let state = gen(withTemplate(), TODAY);
    const template = state.templates[0];
    state = must(state, "mona", {
      type: "templateSave",
      templateId: template.id,
      input: {
        kind: "opening",
        name: template.name,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        items: [item("Only item", "anyone")],
      },
    });
    expect(state.tasks).toHaveLength(4);
    state = generateDailyChecklists(state, ctxFor("cal"), TODAY, TOMORROW);
    expect(state.tasks.filter((t) => t.title === "Only item")).toHaveLength(1);
  });
});

describe("item completion rules (TASK-021/022/023/024)", () => {
  const state = gen(withTemplate(), TODAY);
  const id = (title: string) => state.tasks.find((t) => t.title === title)!.id;

  it("shared and all-team items are open to anyone", () => {
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Unlock entrance") },
        ctxFor("cal"),
      ).ok,
    ).toBe(true);
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Turn on TVs") },
        ctxFor("cal"),
      ).ok,
    ).toBe(true);
  });

  it("person-specific items are limited to the assignee(s) and managers", () => {
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Set patio") },
        ctxFor("cal"),
      ).ok,
    ).toBe(false);
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Set patio") },
        ctxFor("ann"),
      ).ok,
    ).toBe(true);
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Count register") },
        ctxFor("bea"),
      ).ok,
    ).toBe(true);
    expect(
      applyCommand(
        state,
        { type: "complete", taskId: id("Count register") },
        ctxFor("cal"),
      ).ok,
    ).toBe(false);
  });

  it("a manager completes for the assignee without changing the assignment", () => {
    const done = must(state, "asa", {
      type: "complete",
      taskId: id("Set patio"),
    });
    const task = done.tasks.find((t) => t.title === "Set patio")!;
    expect(task.completedBy?.profileId).toBe("asa");
    expect(task.assignees.map((a) => a.profileId)).toEqual(["ann"]);
  });

  it("computes progress over the day's items", () => {
    const done = must(state, "ann", {
      type: "complete",
      taskId: id("Set patio"),
    });
    const items = done.tasks.filter((t) => t.kind === "opening");
    expect(taskProgress(items)).toEqual({ done: 1, total: 4, percent: 25 });
  });
});

describe("assignment degradation", () => {
  it("falls back gracefully when named people have left", () => {
    expect(resolveItemAssignment("individual", [])).toEqual({
      mode: "anyone",
      assigneeIds: [],
    });
    expect(resolveItemAssignment("multiple", ["ann"])).toEqual({
      mode: "individual",
      assigneeIds: ["ann"],
    });
    expect(resolveItemAssignment("multiple", ["bea", "ann"])).toEqual({
      mode: "multiple",
      assigneeIds: ["ann", "bea"],
    });
    expect(resolveItemAssignment("all_team", ["ann"])).toEqual({
      mode: "all_team",
      assigneeIds: [],
    });
  });
});
