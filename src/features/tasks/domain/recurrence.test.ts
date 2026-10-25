import { describe, expect, it } from "vitest";

import { occurrenceDates, recurrenceSummary, weekdayOf } from "./recurrence";
import type { SeriesInput, TaskCommand } from "./task-commands";
import {
  applyCommand,
  emptyTasksState,
  generateRecurringTasks,
  type TasksState,
} from "./task-engine";
import { ctxFor } from "./task-test-helpers";

const rule = (over: Partial<Parameters<typeof occurrenceDates>[0]>) => ({
  frequency: "daily" as const,
  weekdays: null,
  dayOfMonth: null,
  startsOn: "2026-11-02",
  endType: "never" as const,
  endsOn: null,
  maxOccurrences: null,
  ...over,
});

describe("occurrenceDates (mirrors private.recurrence_dates)", () => {
  it("weekly repeats on the start date's weekday (TASK-041)", () => {
    expect(weekdayOf("2026-11-06")).toBe(5);
    const dates = occurrenceDates(
      rule({ frequency: "weekly", weekdays: [5], startsOn: "2026-11-06" }),
      "2026-11-01",
      "2026-12-05",
    );
    expect(dates).toEqual([
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
      "2026-12-04",
    ]);
  });

  it("weekdays skips the weekend; selected weekdays (TASK-042)", () => {
    expect(
      occurrenceDates(
        rule({ frequency: "weekdays" }),
        "2026-11-02",
        "2026-11-08",
      ),
    ).toHaveLength(5);
    expect(
      occurrenceDates(
        rule({ frequency: "selected_weekdays", weekdays: [1, 3] }),
        "2026-11-02",
        "2026-11-15",
      ),
    ).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
  });

  it("monthly clamps to the last day of shorter months", () => {
    expect(
      occurrenceDates(
        rule({ frequency: "monthly", dayOfMonth: 31, startsOn: "2026-01-31" }),
        "2026-01-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("ends by date or by count counted from the start (TASK-044)", () => {
    expect(
      occurrenceDates(
        rule({ endType: "on_date", endsOn: "2026-11-04" }),
        "2026-11-01",
        "2027-01-01",
      ),
    ).toHaveLength(3);
    expect(
      occurrenceDates(
        rule({ endType: "after_count", maxOccurrences: 3 }),
        "2026-11-01",
        "2027-01-01",
      ),
    ).toHaveLength(3);
    // The count is not reset by a later window.
    expect(
      occurrenceDates(
        rule({ endType: "after_count", maxOccurrences: 3 }),
        "2026-11-05",
        "2027-01-01",
      ),
    ).toEqual([]);
  });

  it("summarises a rule for people", () => {
    expect(recurrenceSummary(rule({}))).toBe("Every day");
    expect(
      recurrenceSummary(
        rule({
          frequency: "selected_weekdays",
          weekdays: [1, 3],
          endType: "after_count",
          maxOccurrences: 4,
        }),
      ),
    ).toBe("Mon, Wed, 4 times");
  });
});

// --------------------------------------------------------------------
const NOW = new Date("2026-10-30T18:00:00Z"); // Fri 2026-10-30 in Chicago
const TODAY = "2026-10-30";

const series: SeriesInput = {
  title: "Clean ice machine",
  instructions: null,
  category: "cleaning",
  priority: "normal",
  assignmentMode: "individual",
  assigneeIds: ["ann"],
  dueTime: "15:00",
  dueWindow: null,
  frequency: "daily",
  weekdays: null,
  dayOfMonth: null,
  startsOn: TODAY,
  endType: "never",
  endsOn: null,
  maxOccurrences: null,
};

function must(state: TasksState, actor: string, command: TaskCommand) {
  const result = applyCommand(state, command, ctxFor(actor, NOW));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("series in the demo engine (TASK-040/043/045)", () => {
  const created = must(emptyTasksState(), "mona", {
    type: "seriesCreate",
    input: series,
  });
  const ruleId = created.rules[0].id;

  it("only managers create series", () => {
    expect(
      applyCommand(
        emptyTasksState(),
        { type: "seriesCreate", input: series },
        ctxFor("ann", NOW),
      ).ok,
    ).toBe(false);
  });

  it("creates independent occurrences for today + 14 days, idempotently", () => {
    expect(created.tasks).toHaveLength(15);
    expect(new Set(created.tasks.map((t) => t.id)).size).toBe(15);
    const again = generateRecurringTasks(created, ctxFor("bea", NOW), TODAY);
    expect(again.tasks).toHaveLength(15);
  });

  it("completing one occurrence leaves the rest and the rule untouched", () => {
    const first = created.tasks.find((t) => t.dueDate === TODAY)!;
    const done = must(created, "ann", { type: "complete", taskId: first.id });
    expect(done.tasks.filter((t) => t.status === "completed")).toHaveLength(1);
    expect(done.rules[0].active).toBe(true);
  });

  it("this-and-future rewrites untouched occurrences but not completed ones", () => {
    const first = created.tasks.find((t) => t.dueDate === TODAY)!;
    let state = must(created, "ann", { type: "complete", taskId: first.id });
    state = must(state, "mona", {
      type: "seriesUpdate",
      ruleId,
      input: { ...series, title: "Descale ice machine", priority: "high" },
    });
    expect(state.tasks.find((t) => t.id === first.id)!.title).toBe(
      "Clean ice machine",
    );
    expect(
      state.tasks.filter((t) => t.title === "Descale ice machine"),
    ).toHaveLength(14);
  });

  it("a pattern change cancels future occurrences it no longer produces", () => {
    const state = must(created, "mona", {
      type: "seriesUpdate",
      ruleId,
      input: { ...series, frequency: "selected_weekdays", weekdays: [1] },
    });
    const cancelled = state.tasks.filter((t) => t.status === "cancelled");
    expect(cancelled.length).toBeGreaterThanOrEqual(10);
    expect(
      state.tasks
        .filter((t) => t.status === "open")
        .every((t) => weekdayOf(t.dueDate!) === 1),
    ).toBe(true);
  });

  it("stopping ends the series and cancels only untouched future work", () => {
    const first = created.tasks.find((t) => t.dueDate === TODAY)!;
    let state = must(created, "ann", { type: "complete", taskId: first.id });
    state = must(state, "mona", { type: "seriesStop", ruleId });
    expect(state.tasks.filter((t) => t.status === "open")).toHaveLength(0);
    expect(state.tasks.filter((t) => t.status === "completed")).toHaveLength(1);
    expect(generateRecurringTasks(state, ctxFor("ann", NOW), TODAY)).toBe(
      state,
    );
  });
});
