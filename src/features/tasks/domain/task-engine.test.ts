import { describe, expect, it } from "vitest";

import type { TaskCommand, TaskCreateInput } from "./task-commands";
import {
  applyCommand,
  buildSnapshot,
  computeDueAt,
  emptyTasksState,
  type TasksState,
} from "./task-engine";
import { ctxFor } from "./task-test-helpers";

const base: TaskCreateInput = {
  title: "Clean patio",
  instructions: null,
  category: "cleaning",
  priority: "normal",
  startDate: null,
  dueDate: "2026-10-30",
  dueTime: "15:00",
  dueWindow: null,
  assignmentMode: "individual",
  assigneeIds: ["ann"],
  eachPerson: false,
};

function run(state: TasksState, actor: string, command: TaskCommand) {
  return applyCommand(state, command, ctxFor(actor));
}

function must(state: TasksState, actor: string, command: TaskCommand) {
  const result = run(state, actor, command);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("computeDueAt", () => {
  it("honours the location time zone (TASK-010)", () => {
    expect(
      computeDueAt(
        { dueDate: "2026-10-30", dueTime: "15:00" },
        "America/Chicago",
      ),
    ).toBe("2026-10-30T20:00:00.000Z");
    expect(
      computeDueAt({ dueDate: "2026-10-30", dueTime: null }, "America/Chicago"),
    ).toBe("2026-10-31T05:00:00.000Z");
    expect(
      computeDueAt({ dueDate: null, dueTime: null }, "America/Chicago"),
    ).toBeNull();
  });
});

describe("creation permissions (TASK-001/002)", () => {
  it("staff cannot create; manager and assistant manager can", () => {
    expect(
      run(emptyTasksState(), "ann", { type: "create", input: base }).ok,
    ).toBe(false);
    expect(
      run(emptyTasksState(), "mona", { type: "create", input: base }).ok,
    ).toBe(true);
    expect(
      run(emptyTasksState(), "asa", { type: "create", input: base }).ok,
    ).toBe(true);
  });

  it("validates assignees and fields (TASK-071)", () => {
    const bad = (patch: Partial<TaskCreateInput>) =>
      run(emptyTasksState(), "mona", {
        type: "create",
        input: { ...base, ...patch },
      });
    expect(bad({ assigneeIds: ["ann", "bea"] }).ok).toBe(false);
    expect(bad({ assigneeIds: ["ghost"] }).ok).toBe(false);
    expect(bad({ assignmentMode: "all_team", assigneeIds: ["ann"] }).ok).toBe(
      false,
    );
    expect(bad({ assignmentMode: "multiple", assigneeIds: ["ann"] }).ok).toBe(
      false,
    );
    expect(bad({ category: "nope" }).ok).toBe(false);
    expect(bad({ dueDate: null, dueTime: "09:00" }).ok).toBe(false);
    expect(bad({ startDate: "2026-11-02" }).ok).toBe(false);
  });

  it("fans out each-person tasks into independent individual tasks (TASK-004)", () => {
    const state = must(emptyTasksState(), "mona", {
      type: "create",
      input: {
        ...base,
        assignmentMode: "multiple",
        assigneeIds: ["ann", "bea", "cal"],
        eachPerson: true,
      },
    });
    expect(state.tasks).toHaveLength(3);
    expect(new Set(state.tasks.map((t) => t.groupId)).size).toBe(1);
    expect(
      state.tasks.every(
        (t) => t.assignees.length === 1 && t.assignmentMode === "individual",
      ),
    ).toBe(true);
  });
});

describe("completion (TASK-005/006/007)", () => {
  const created = must(emptyTasksState(), "mona", {
    type: "create",
    input: base,
  });
  const id = created.tasks[0].id;

  it("the assignee completes with a note", () => {
    const state = must(created, "ann", {
      type: "complete",
      taskId: id,
      note: "wiped",
    });
    expect(state.tasks[0]).toMatchObject({
      status: "completed",
      completionNote: "wiped",
      completedBy: { profileId: "ann" },
    });
  });

  it("unrelated staff cannot complete", () => {
    expect(run(created, "bea", { type: "complete", taskId: id }).ok).toBe(
      false,
    );
  });

  it("a manager completes on behalf and the assignee never changes", () => {
    const state = must(created, "mona", { type: "complete", taskId: id });
    expect(state.tasks[0].completedBy?.profileId).toBe("mona");
    expect(state.tasks[0].assignees.map((a) => a.profileId)).toEqual(["ann"]);
    expect(state.events.at(-1)?.payload.on_behalf).toBe(true);
  });

  it("first completer wins; a second completion is a no-op", () => {
    const first = must(created, "ann", { type: "complete", taskId: id });
    const second = must(first, "mona", { type: "complete", taskId: id });
    expect(second.tasks[0].completedBy?.profileId).toBe("ann");
  });

  it("only the completer or a manager can reopen", () => {
    const done = must(created, "mona", { type: "complete", taskId: id });
    expect(run(done, "ann", { type: "reopen", taskId: id }).ok).toBe(false);
    const reopened = must(done, "mona", { type: "reopen", taskId: id });
    expect(reopened.tasks[0]).toMatchObject({
      status: "open",
      completedBy: null,
    });

    const shared = must(emptyTasksState(), "mona", {
      type: "create",
      input: { ...base, assignmentMode: "anyone", assigneeIds: [] },
    });
    const sharedId = shared.tasks[0].id;
    const sharedDone = must(shared, "mona", {
      type: "complete",
      taskId: sharedId,
    });
    expect(
      run(sharedDone, "cal", { type: "reopen", taskId: sharedId }).ok,
    ).toBe(false);
  });
});

describe("status, reassignment, cancel, carry forward", () => {
  const created = must(emptyTasksState(), "mona", {
    type: "create",
    input: base,
  });
  const id = created.tasks[0].id;

  it("blocking needs a reason and unblocking returns to open (TASK-009)", () => {
    expect(
      run(created, "ann", { type: "setStatus", taskId: id, status: "blocked" })
        .ok,
    ).toBe(false);
    const blocked = must(created, "ann", {
      type: "setStatus",
      taskId: id,
      status: "blocked",
      reason: "no scoop",
    });
    expect(blocked.tasks[0]).toMatchObject({
      status: "blocked",
      blockedReason: "no scoop",
    });
    const open = must(blocked, "ann", {
      type: "setStatus",
      taskId: id,
      status: "open",
    });
    expect(open.tasks[0].blockedReason).toBeNull();
  });

  it("only managers reassign, cancel and carry forward (TASK-008)", () => {
    expect(
      run(created, "ann", {
        type: "assign",
        taskId: id,
        assignmentMode: "individual",
        assigneeIds: ["bea"],
      }).ok,
    ).toBe(false);
    expect(run(created, "ann", { type: "cancel", taskId: id }).ok).toBe(false);
    expect(
      run(created, "ann", {
        type: "carryForward",
        taskIds: [id],
        newDueDate: "2026-11-02",
      }).ok,
    ).toBe(false);

    const re = must(created, "mona", {
      type: "assign",
      taskId: id,
      assignmentMode: "individual",
      assigneeIds: ["bea"],
    });
    expect(re.tasks[0].assignees.map((a) => a.profileId)).toEqual(["bea"]);

    const moved = must(created, "mona", {
      type: "carryForward",
      taskIds: [id],
      newDueDate: "2026-11-02",
    });
    expect(moved.tasks[0].dueDate).toBe("2026-11-02");

    const cancelled = must(created, "mona", { type: "cancel", taskId: id });
    expect(run(cancelled, "mona", { type: "complete", taskId: id }).ok).toBe(
      false,
    );
  });
});

describe("snapshot privacy (TASK-060/061)", () => {
  const state = must(
    must(emptyTasksState(), "mona", { type: "create", input: base }),
    "mona",
    {
      type: "create",
      input: {
        ...base,
        title: "Team brief",
        assignmentMode: "all_team",
        assigneeIds: [],
      },
    },
  );
  const snap = (actor: string) =>
    buildSnapshot(state, {
      ...ctxFor(actor),
      organizationId: "org",
      locationId: "loc",
      today: "2026-10-30",
    });

  it("staff see only their tasks and no history", () => {
    expect(snap("ann").tasks).toHaveLength(2);
    expect(snap("bea").tasks.map((t) => t.title)).toEqual(["Team brief"]);
    expect(snap("bea").events).toEqual([]);
    expect(snap("bea").team).toEqual([]);
  });

  it("managers see everything including history", () => {
    expect(snap("asa").tasks).toHaveLength(2);
    expect(snap("asa").events.length).toBeGreaterThan(0);
  });
});
