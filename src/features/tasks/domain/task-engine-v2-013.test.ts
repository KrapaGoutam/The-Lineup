import { describe, expect, it } from "vitest";

import type { TaskCommand, TaskCreateInput } from "./task-commands";
import {
  applyCommand,
  buildSnapshot,
  emptyTasksState,
  type TasksState,
} from "./task-engine";
import { ctxFor } from "./task-test-helpers";

/**
 * V2.0.13 Batch A: the demo engine is the executable twin of the new RPCs
 * (supabase/tests/database/0092_tasks_v2_013_batch_a.test.sql). Same rules,
 * same messages, same audit trail.
 */
const base: TaskCreateInput = {
  title: "Opening Kitchen",
  instructions: null,
  category: "kitchen",
  priority: "normal",
  startDate: null,
  dueDate: null,
  dueTime: null,
  dueWindow: null,
  assignmentMode: "individual",
  assigneeIds: ["ann"],
  eachPerson: false,
  checklist: [
    { title: "Check fridge temps" },
    { title: "Refill lassi" },
    { title: "Prep chutney" },
  ],
};

function run(state: TasksState, actor: string, command: TaskCommand) {
  return applyCommand(state, command, ctxFor(actor));
}
function must(state: TasksState, actor: string, command: TaskCommand) {
  const result = run(state, actor, command);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function seeded(): { state: TasksState; id: string } {
  const state = must(emptyTasksState(), "mona", {
    type: "create",
    input: base,
  });
  return { state, id: state.tasks[0].id };
}
const task = (state: TasksState, id: string) =>
  state.tasks.find((t) => t.id === id)!;
const fields = (t: { title: string }) => ({
  title: t.title,
  instructions: null,
  category: "kitchen",
  priority: "normal" as const,
  startDate: null,
  dueDate: null,
  dueTime: null,
  dueWindow: null,
});

describe("checklist steps on an ordinary task", () => {
  it("creates a task with ordered steps, all unchecked", () => {
    const { state, id } = seeded();
    expect(
      task(state, id).steps.map((s) => [s.title, s.sortOrder, s.done]),
    ).toEqual([
      ["Check fridge temps", 1, false],
      ["Refill lassi", 2, false],
      ["Prep chutney", 3, false],
    ]);
  });

  it("copies the checklist to each fanned-out task", () => {
    const state = must(emptyTasksState(), "mona", {
      type: "create",
      input: {
        ...base,
        assignmentMode: "multiple",
        assigneeIds: ["ann", "bea"],
        eachPerson: true,
      },
    });
    expect(state.tasks).toHaveLength(2);
    for (const t of state.tasks) expect(t.steps).toHaveLength(3);
    expect(
      new Set(state.tasks.flatMap((t) => t.steps.map((s) => s.id))).size,
    ).toBe(6);
  });

  it("refuses a blank step title and more than 50 steps", () => {
    const blank = run(emptyTasksState(), "mona", {
      type: "create",
      input: { ...base, checklist: [{ title: "ok" }, { title: "  " }] },
    });
    // The schema trims in the real action; the engine itself must still refuse.
    expect(blank.ok).toBe(false);
    const many = run(emptyTasksState(), "mona", {
      type: "create",
      input: {
        ...base,
        checklist: Array.from({ length: 51 }, (_, i) => ({ title: `s${i}` })),
      },
    });
    expect(many.ok).toBe(false);
  });

  it("add, rename, reorder and remove in one edit; retained steps keep completion", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    const [s1, , s3] = task(state, id).steps;
    state = must(state, "ann", {
      type: "stepSet",
      taskId: id,
      stepId: s1.id,
      done: true,
    });
    state = must(state, "mona", {
      type: "update",
      taskId: id,
      input: fields(task(state, id)),
      checklist: [
        { id: s3.id, title: "Prep mint chutney" },
        { id: s1.id, title: "Check fridge temps" },
        { id: null, title: "Sanitize counters" },
      ],
    });
    const t = task(state, id);
    expect(t.steps.map((s) => s.title)).toEqual([
      "Prep mint chutney",
      "Check fridge temps",
      "Sanitize counters",
    ]);
    expect(t.steps.map((s) => s.sortOrder)).toEqual([1, 2, 3]);
    expect(t.steps[1].done).toBe(true); // completion survived the reorder
    expect(t.checklistRev).toBe(1);
    expect(
      state.events.filter((e) => e.type === "checklist_edited"),
    ).toHaveLength(1);
  });

  it("an omitted checklist leaves the steps untouched; an identical one changes nothing", () => {
    const { state, id } = seeded();
    const before = task(state, id);
    const same = must(state, "mona", {
      type: "update",
      taskId: id,
      input: fields(before),
      checklist: before.steps.map((s) => ({ id: s.id, title: s.title })),
    });
    expect(same).toBe(state);
    const renamed = must(state, "mona", {
      type: "update",
      taskId: id,
      input: { ...fields(before), title: "Opening Kitchen!" },
    });
    expect(task(renamed, id).steps).toEqual(before.steps);
    expect(task(renamed, id).checklistRev).toBe(0);
  });

  it("a step id from another task cannot be smuggled in", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "mona", {
      type: "create",
      input: { ...base, title: "Other", assigneeIds: ["bea"] },
    });
    const other = state.tasks.find((t) => t.title === "Other")!;
    const result = run(state, "mona", {
      type: "update",
      taskId: id,
      input: fields(task(state, id)),
      checklist: [{ id: other.steps[0].id, title: "x" }],
    });
    expect(result).toEqual({
      ok: false,
      error: "That checklist step is not available.",
    });
  });
});

describe("ticking steps", () => {
  it("the assignee ticks and unticks; the first tick wins; each change is audited", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    const step = task(state, id).steps[0];
    state = must(state, "ann", {
      type: "stepSet",
      taskId: id,
      stepId: step.id,
      done: true,
    });
    const again = must(state, "ann", {
      type: "stepSet",
      taskId: id,
      stepId: step.id,
      done: true,
    });
    expect(again).toBe(state);
    expect(task(state, id).steps[0].completedBy?.profileId).toBe("ann");
    state = must(state, "ann", {
      type: "stepSet",
      taskId: id,
      stepId: step.id,
      done: false,
    });
    expect(task(state, id).steps[0].done).toBe(false);
    expect(
      state.events.filter((e) => e.type.startsWith("checklist_step")),
    ).toHaveLength(2);
  });

  it("a non-assignee staff member cannot tick a step of an individual task", () => {
    const { state, id } = seeded();
    const result = run(state, "bea", {
      type: "stepSet",
      taskId: id,
      stepId: task(state, id).steps[0].id,
      done: true,
    });
    expect(result.ok).toBe(false);
  });

  it("ticking every step does NOT complete the parent task", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    for (const step of task(state, id).steps) {
      state = must(state, "ann", {
        type: "stepSet",
        taskId: id,
        stepId: step.id,
        done: true,
      });
    }
    expect(task(state, id).status).toBe("open");
  });

  it("steps freeze when the task is completed and unfreeze on reopen", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    const stepId = task(state, id).steps[0].id;
    state = must(state, "ann", { type: "complete", taskId: id });
    expect(
      run(state, "ann", { type: "stepSet", taskId: id, stepId, done: true }).ok,
    ).toBe(false);
    state = must(state, "ann", { type: "reopen", taskId: id });
    expect(
      run(state, "ann", { type: "stepSet", taskId: id, stepId, done: true }).ok,
    ).toBe(true);
  });

  it("staff cannot edit the checklist structure", () => {
    const { state, id } = seeded();
    const result = run(state, "ann", {
      type: "update",
      taskId: id,
      input: fields(task(state, id)),
      checklist: [{ title: "mine" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("edit conflicts", () => {
  it("refuses an edit based on a stale updatedAt and a stale checklist revision", () => {
    const { state, id } = seeded();
    const t = task(state, id);
    const stale = run(state, "mona", {
      type: "update",
      taskId: id,
      input: fields(t),
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok)
      expect(stale.error).toMatch(/Someone else changed this task/);
    const staleRev = run(state, "mona", {
      type: "update",
      taskId: id,
      input: fields(t),
      checklist: [{ title: "x" }],
      expectedChecklistRev: 7,
    });
    expect(staleRev.ok).toBe(false);
    const fresh = run(state, "mona", {
      type: "update",
      taskId: id,
      input: { ...fields(t), title: "Renamed" },
      expectedUpdatedAt: t.updatedAt,
      expectedChecklistRev: t.checklistRev,
    });
    expect(fresh.ok).toBe(true);
  });
});

describe("status transitions", () => {
  it("allows every Not Started / In Progress / Completed move", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    const status = () => task(state, id).status;
    state = must(state, "ann", {
      type: "setStatus",
      taskId: id,
      status: "in_progress",
    });
    expect(status()).toBe("in_progress");
    state = must(state, "ann", {
      type: "setStatus",
      taskId: id,
      status: "open",
    });
    expect(status()).toBe("open");
    state = must(state, "ann", { type: "complete", taskId: id });
    expect(status()).toBe("completed");
    state = must(state, "ann", {
      type: "setStatus",
      taskId: id,
      status: "in_progress",
    });
    expect(status()).toBe("in_progress");
    state = must(state, "ann", { type: "complete", taskId: id });
    state = must(state, "mona", {
      type: "setStatus",
      taskId: id,
      status: "open",
    });
    expect(status()).toBe("open");
    // Not Started -> Completed, with steps unticked
    state = must(state, "ann", { type: "complete", taskId: id });
    expect(status()).toBe("completed");
  });

  it("reopening keeps the earlier completion in the audit trail and clears the live one", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "ann", { type: "complete", taskId: id });
    state = must(state, "ann", {
      type: "setStatus",
      taskId: id,
      status: "in_progress",
    });
    const t = task(state, id);
    expect(t.completedBy).toBeNull();
    expect(t.completedAt).toBeNull();
    const types = state.events.map((e) => e.type);
    expect(types).toContain("completed");
    expect(types).toContain("reopened");
  });

  it("only the completer or a manager may reopen a completed task", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "mona", { type: "complete", taskId: id });
    // Ann can work the task (she is the assignee) but did not complete it.
    expect(
      run(state, "ann", { type: "setStatus", taskId: id, status: "open" }).ok,
    ).toBe(false);
    expect(
      run(state, "mona", { type: "setStatus", taskId: id, status: "open" }).ok,
    ).toBe(true);
  });
});

describe("delete versus archive", () => {
  it("permanently deletes a task nobody touched", () => {
    const { state, id } = seeded();
    const result = run(state, "mona", { type: "delete", taskId: id });
    expect(result.ok && result.outcome).toBe("deleted");
    if (result.ok) {
      expect(result.value.tasks).toHaveLength(0);
      expect(result.value.events.filter((e) => e.taskId === id)).toHaveLength(
        0,
      );
    }
  });

  it("archives a task with history: it leaves the register but is kept and audited", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "ann", {
      type: "setStatus",
      taskId: id,
      status: "in_progress",
    });
    const result = run(state, "mona", { type: "delete", taskId: id });
    expect(result.ok && result.outcome).toBe("archived");
    if (!result.ok) return;
    state = result.value;
    expect(task(state, id).status).toBe("cancelled");
    expect(
      state.events.some((e) => e.taskId === id && e.type === "archived"),
    ).toBe(true);
    const snap = buildSnapshot(state, {
      ...ctxFor("mona"),
      organizationId: "o",
      locationId: null,
      today: "2026-10-30",
    });
    expect(snap.tasks.find((t) => t.id === id)).toBeUndefined();
  });

  it("archives a completed task and keeps it Completed; it can no longer be reopened or edited", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "ann", { type: "complete", taskId: id });
    const archived = run(state, "mona", { type: "delete", taskId: id });
    expect(archived.ok && archived.outcome).toBe("archived");
    if (!archived.ok) return;
    state = archived.value;
    expect(task(state, id).status).toBe("completed");
    expect(run(state, "mona", { type: "reopen", taskId: id }).ok).toBe(false);
    expect(
      run(state, "mona", { type: "setStatus", taskId: id, status: "open" }).ok,
    ).toBe(false);
    expect(
      run(state, "mona", {
        type: "update",
        taskId: id,
        input: fields(task(state, id)),
      }).ok,
    ).toBe(false);
  });

  it("is manager-only and refuses another viewer's staff attempt", () => {
    const { state, id } = seeded();
    expect(run(state, "ann", { type: "delete", taskId: id }).ok).toBe(false);
  });

  it("never hard-deletes a task that had a checklist step ticked", () => {
    const { id, state: initial } = seeded();
    let state = initial;
    state = must(state, "ann", {
      type: "stepSet",
      taskId: id,
      stepId: task(state, id).steps[0].id,
      done: true,
    });
    const result = run(state, "mona", { type: "delete", taskId: id });
    expect(result.ok && result.outcome).toBe("archived");
  });
});
