import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  createTasksFixture,
  must,
  type TasksFixture,
  type TasksTestUser,
} from "./support/tasks-fixture";

// V2.0.13 Batch A against the DISPOSABLE local stack with real GoTrue session
// clients: the real server actions, the real snapshot loader (PostgREST embed
// of the checklist steps) and the real RPCs. Only the Next request/cookie
// adapter is supplied, exactly like tasks-location.local.test.ts.
let fx: TasksFixture;
const request = vi.hoisted(() => ({
  client: null as unknown,
  actor: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));
vi.mock("@/features/tasks/data/tasks-actor", () => ({
  getTasksActor: async () => request.actor,
}));
import {
  getTasksSnapshotAction,
  runTaskCommandAction,
} from "@/features/tasks/actions/tasks-actions";
import type { TaskCommand } from "@/features/tasks/domain/task-commands";
import type { TaskView } from "@/features/tasks/domain/task-types";

function bind(user: TasksTestUser, location: string, designation: string) {
  request.client = user.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: {
      organizationId: fx.org.id,
      locationId: location,
      timeZone: location === fx.b ? "America/New_York" : "America/Chicago",
    },
    viewer: { profileId: user.id, name: user.name, designation },
  };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId: location,
  };
}
async function run(
  user: TasksTestUser,
  location: string,
  designation: string,
  command: TaskCommand,
) {
  const expectedContext = bind(user, location, designation);
  return runTaskCommandAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    command,
  });
}
async function snapshot(
  user: TasksTestUser,
  location: string,
  designation: string,
) {
  const expectedContext = bind(user, location, designation);
  const result = await getTasksSnapshotAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
  });
  if (!result.ok) throw Error(result.error);
  return result.data;
}
const mgr = (command: TaskCommand, location = fx.a) =>
  run(fx.manager, location, "manager", command);
const staffRun = (command: TaskCommand) =>
  run(fx.staff, fx.a, "staff", command);
const find = (tasks: TaskView[], title: string) =>
  tasks.find((t) => t.title === title);
const fields = (title: string) => ({
  title,
  instructions: null,
  category: "kitchen",
  priority: "normal" as const,
  startDate: null,
  dueDate: null,
  dueTime: null,
  dueWindow: null,
});
const createInput = (
  title: string,
  assignee: string,
  steps: string[] = [],
) => ({
  ...fields(title),
  assignmentMode: "individual" as const,
  assigneeIds: [assignee],
  eachPerson: false,
  checklist: steps.map((s) => ({ title: s })),
});

beforeAll(async () => {
  fx = await createTasksFixture();
});
afterAll(async () => {
  await fx?.teardown();
});

it("creates a task with a checklist and the snapshot returns ordered steps with version tokens", async () => {
  const result = await mgr({
    type: "create",
    input: createInput("Opening Kitchen", fx.staff.id, [
      "Check fridge temps",
      "Refill lassi",
      "Prep chutney",
    ]),
  });
  expect(result.ok).toBe(true);
  const snap = await snapshot(fx.manager, fx.a, "manager");
  const task = find(snap.tasks, "Opening Kitchen")!;
  expect(task.steps.map((s) => [s.title, s.sortOrder, s.done])).toEqual([
    ["Check fridge temps", 1, false],
    ["Refill lassi", 2, false],
    ["Prep chutney", 3, false],
  ]);
  expect(task.checklistRev).toBe(0);
  expect(typeof task.updatedAt).toBe("string");
});

it("the assignee ticks steps through the action; parent task status is untouched; progress survives a reload", async () => {
  let snap = await snapshot(fx.staff, fx.a, "staff");
  const task = find(snap.tasks, "Opening Kitchen")!;
  for (const step of task.steps) {
    const r = await staffRun({
      type: "stepSet",
      taskId: task.id,
      stepId: step.id,
      done: true,
    });
    expect(r.ok).toBe(true);
  }
  snap = await snapshot(fx.staff, fx.a, "staff");
  const after = find(snap.tasks, "Opening Kitchen")!;
  expect(after.steps.every((s) => s.done)).toBe(true);
  expect(after.steps[0].completedBy?.profileId).toBe(fx.staff.id);
  expect(after.status).toBe("open");
});

it("staff cannot edit, restructure, delete or reassign; a different staff member cannot tick", async () => {
  const snap = await snapshot(fx.staff, fx.a, "staff");
  const task = find(snap.tasks, "Opening Kitchen")!;
  const attempts: TaskCommand[] = [
    {
      type: "update",
      taskId: task.id,
      input: fields("Hacked"),
      checklist: [{ title: "mine" }],
    },
    { type: "delete", taskId: task.id },
    {
      type: "assign",
      taskId: task.id,
      assignmentMode: "individual",
      assigneeIds: [fx.dual.id],
    },
  ];
  for (const command of attempts) {
    expect((await staffRun(command)).ok).toBe(false);
  }
  // dual is not an assignee of this individual task: no steps are even visible
  const dualSnap = await snapshot(fx.dual, fx.a, "staff");
  expect(find(dualSnap.tasks, "Opening Kitchen")).toBeUndefined();
  const direct = await fx.dual.client.rpc("task_checklist_step_set", {
    p_task_id: task.id,
    p_step_id: task.steps[0].id,
    p_done: false,
  });
  expect(direct.error).not.toBeNull();
  const after = await snapshot(fx.manager, fx.a, "manager");
  expect(find(after.tasks, "Opening Kitchen")!.steps.every((s) => s.done)).toBe(
    true,
  );
});

it("a manager restructures the checklist; completion survives; a stale editor is refused with a clear conflict", async () => {
  const before = find(
    (await snapshot(fx.manager, fx.a, "manager")).tasks,
    "Opening Kitchen",
  )!;
  const [s1, , s3] = before.steps;
  // The version token is passed back exactly as the database sent it.
  const ok = await mgr({
    type: "update",
    taskId: before.id,
    input: fields("Opening Kitchen"),
    expectedUpdatedAt: before.updatedAt,
    expectedChecklistRev: before.checklistRev,
    checklist: [
      { id: s3.id, title: "Prep mint chutney" },
      { id: s1.id, title: s1.title },
      { id: null, title: "Sanitize counters" },
    ],
  });
  expect(ok.ok).toBe(true);
  const after = find(
    (await snapshot(fx.manager, fx.a, "manager")).tasks,
    "Opening Kitchen",
  )!;
  expect(after.steps.map((s) => s.title)).toEqual([
    "Prep mint chutney",
    "Check fridge temps",
    "Sanitize counters",
  ]);
  expect(after.steps[1].done).toBe(true);
  expect(after.steps[2].done).toBe(false);
  expect(after.checklistRev).toBe(1);
  // The removed step is archived, not gone.
  const archived = must(
    await fx.admin
      .from("task_checklist_items")
      .select("title, archived_at")
      .eq("task_id", before.id)
      .not("archived_at", "is", null),
  );
  expect(archived?.map((r) => r.title)).toEqual(["Refill lassi"]);

  const stale = await mgr({
    type: "update",
    taskId: before.id,
    input: fields("Opening Kitchen 2"),
    expectedUpdatedAt: before.updatedAt,
    expectedChecklistRev: before.checklistRev,
  });
  expect(stale).toMatchObject({ ok: false });
  if (!stale.ok) expect(stale.error).toMatch(/Someone else changed this task/);
  const staleSteps = await mgr({
    type: "update",
    taskId: before.id,
    input: fields("Opening Kitchen"),
    expectedChecklistRev: 0,
    checklist: [{ title: "x" }],
  });
  expect(staleSteps.ok).toBe(false);
});

it("status transitions through the real RPCs, with the earlier completion kept in the audit trail", async () => {
  const task = find(
    (await snapshot(fx.manager, fx.a, "manager")).tasks,
    "Opening Kitchen",
  )!;
  const steps = [
    { type: "setStatus", taskId: task.id, status: "in_progress" },
    { type: "setStatus", taskId: task.id, status: "open" },
    { type: "complete", taskId: task.id },
    { type: "setStatus", taskId: task.id, status: "in_progress" },
  ] as const;
  const seen: string[] = [];
  for (const command of steps) {
    const r = await staffRun(command);
    expect(r.ok).toBe(true);
    if (r.ok) seen.push(find(r.data.tasks, "Opening Kitchen")!.status);
  }
  expect(seen).toEqual(["in_progress", "open", "completed", "in_progress"]);
  const events = must(
    await fx.admin
      .from("task_events")
      .select("event_type")
      .eq("task_id", task.id),
  )!.map((e) => e.event_type);
  expect(events).toEqual(
    expect.arrayContaining([
      "started",
      "status_changed",
      "completed",
      "reopened",
    ]),
  );
  const live = find(
    (await snapshot(fx.staff, fx.a, "staff")).tasks,
    "Opening Kitchen",
  )!;
  expect(live.completedBy).toBeNull();
});

it("delete removes a history-free task for good and archives one with history", async () => {
  const throwaway = await mgr({
    type: "create",
    input: createInput("Throwaway", fx.staff.id, ["s"]),
  });
  expect(throwaway.ok).toBe(true);
  const t1 = find(
    (await snapshot(fx.manager, fx.a, "manager")).tasks,
    "Throwaway",
  )!;
  const deleted = await mgr({ type: "delete", taskId: t1.id });
  expect(deleted).toMatchObject({ ok: true, outcome: "deleted" });
  const gone = must(await fx.admin.from("tasks").select("id").eq("id", t1.id));
  expect(gone).toHaveLength(0);

  const history = find(
    (await snapshot(fx.manager, fx.a, "manager")).tasks,
    "Opening Kitchen",
  )!;
  const archived = await mgr({ type: "delete", taskId: history.id });
  expect(archived).toMatchObject({ ok: true, outcome: "archived" });
  const snap = await snapshot(fx.manager, fx.a, "manager");
  expect(find(snap.tasks, "Opening Kitchen")).toBeUndefined();
  const row = must(
    await fx.admin
      .from("tasks")
      .select("status, archived_at")
      .eq("id", history.id)
      .single(),
  )!;
  expect(row.archived_at).not.toBeNull();
  const events = must(
    await fx.admin
      .from("task_events")
      .select("event_type")
      .eq("task_id", history.id),
  )!;
  expect(events.some((e) => e.event_type === "archived")).toBe(true);
  expect(events.length).toBeGreaterThan(3); // the audit trail is intact
  // ...and nothing can change it any more.
  const reopen = await mgr({
    type: "setStatus",
    taskId: history.id,
    status: "open",
  });
  expect(reopen.ok).toBe(false);
});

it("a manager of A cannot operate on a task or location they are not authorized for", async () => {
  // fx.manager manages A and B; dual is staff-only. Create at B, act from A.
  const atB = await mgr(
    { type: "create", input: createInput("B only", fx.dual.id, ["b step"]) },
    fx.b,
  );
  expect(atB.ok).toBe(true);
  const taskB = find(
    (await snapshot(fx.manager, fx.b, "manager")).tasks,
    "B only",
  )!;
  // Through the action: the B task is not available in A's verified location.
  const crossAction = await mgr({ type: "delete", taskId: taskB.id }, fx.a);
  expect(crossAction).toMatchObject({ ok: false });
  // Through the RPC directly, as a user with no authority at B at all.
  for (const call of [
    () => fx.staff.client.rpc("task_delete", { p_task_id: taskB.id }),
    () =>
      fx.staff.client.rpc("task_checklist_step_set", {
        p_task_id: taskB.id,
        p_step_id: taskB.steps[0].id,
        p_done: true,
      }),
    () => fx.foreign.client.rpc("task_delete", { p_task_id: taskB.id }),
  ]) {
    expect((await call()).error).not.toBeNull();
  }
  const still = must(
    await fx.admin.from("tasks").select("id").eq("id", taskB.id),
  );
  expect(still).toHaveLength(1);
  // Staff can neither create nor read other-location steps.
  const steps = must(
    await fx.staff.client
      .from("task_checklist_items")
      .select("id")
      .eq("task_id", taskB.id),
  );
  expect(steps).toHaveLength(0);
});
