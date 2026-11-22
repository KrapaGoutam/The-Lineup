import { describe, expect, it } from "vitest";

import {
  canTickSteps,
  filterRegister,
  matchesQuery,
  quickStatusOf,
  registerCounts,
  registerSummary,
  stepProgress,
  stepProgressText,
} from "./task-register";
import { makeTask, viewer } from "./task-test-helpers";
import type { TaskStepView } from "./task-types";

const step = (id: string, done: boolean, title = id): TaskStepView => ({
  id,
  title,
  sortOrder: 1,
  done,
  completedBy: null,
  completedAt: null,
});
const name = (slug: string) => (slug === "kitchen" ? "Kitchen" : "Other");

describe("step progress", () => {
  it("counts live steps and reads like a sentence", () => {
    const t = makeTask({
      steps: [step("a", true), step("b", true), step("c", false)],
    });
    const p = stepProgress(t);
    expect(p).toEqual({ done: 2, total: 3, percent: 67 });
    expect(stepProgressText(p)).toBe("2 of 3 completed");
    expect(stepProgress(makeTask())).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("register filtering", () => {
  const tasks = [
    makeTask({
      id: "1",
      title: "Clean patio",
      status: "open",
      category: "other",
    }),
    makeTask({
      id: "2",
      title: "Opening Kitchen",
      status: "in_progress",
      category: "kitchen",
      assignees: [{ profileId: "ann", name: "Ann" }],
      steps: [step("s", false, "Refill Mango Lassi")],
    }),
    makeTask({ id: "3", title: "Count bottles", status: "completed" }),
    makeTask({ id: "4", title: "Old job", status: "cancelled" }),
  ];

  it("counts every status and the total", () => {
    expect(registerCounts(tasks)).toEqual({
      all: 4,
      open: 1,
      in_progress: 1,
      blocked: 0,
      completed: 1,
      cancelled: 1,
    });
  });

  it("filters by status and by search over title, person, category and step", () => {
    expect(filterRegister(tasks, "open", "", name).map((t) => t.id)).toEqual([
      "1",
    ]);
    expect(filterRegister(tasks, "all", "ann", name).map((t) => t.id)).toEqual([
      "2",
    ]);
    expect(
      filterRegister(tasks, "all", "kitchen", name).map((t) => t.id),
    ).toEqual(["2"]);
    expect(
      filterRegister(tasks, "all", "mango", name).map((t) => t.id),
    ).toEqual(["2"]);
    expect(filterRegister(tasks, "in_progress", "patio", name)).toEqual([]);
    expect(matchesQuery(tasks[0], "  ", name)).toBe(true);
  });

  it("summarizes the register", () => {
    expect(registerSummary(tasks, new Date("2026-10-30T18:00:00Z"))).toBe(
      "4 tasks · 1 in progress",
    );
  });
});

describe("who may tick steps and quick statuses", () => {
  it("assignee and manager may tick open work; nobody ticks completed or cancelled work", () => {
    const t = makeTask({
      assignmentMode: "individual",
      assignees: [{ profileId: "ann", name: "Ann" }],
    });
    expect(canTickSteps(t, viewer("ann"))).toBe(true);
    expect(canTickSteps(t, viewer("mona"))).toBe(true);
    expect(canTickSteps(t, viewer("bea"))).toBe(false);
    expect(canTickSteps({ ...t, status: "completed" }, viewer("mona"))).toBe(
      false,
    );
    expect(canTickSteps({ ...t, status: "cancelled" }, viewer("mona"))).toBe(
      false,
    );
  });

  it("maps the three primary statuses and leaves blocked/cancelled unmapped", () => {
    expect(quickStatusOf(makeTask({ status: "open" }))).toBe("open");
    expect(quickStatusOf(makeTask({ status: "in_progress" }))).toBe(
      "in_progress",
    );
    expect(quickStatusOf(makeTask({ status: "completed" }))).toBe("completed");
    expect(quickStatusOf(makeTask({ status: "blocked" }))).toBeNull();
    expect(quickStatusOf(makeTask({ status: "cancelled" }))).toBeNull();
  });
});
