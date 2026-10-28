import { describe, expect, it } from "vitest";

import {
  ALL_STAFF_SCOPE,
  buildTodayGroups,
  canViewTask,
  canWorkTask,
  dueText,
  filterByScope,
  formatClock,
  isOverdue,
  personProgress,
  resolveScope,
  scopeFromValue,
  scopeToValue,
  sortTasks,
  staffLabel,
  summarizeToday,
  taskBucket,
  taskProgress,
  taskTypeLabel,
} from "./task-rules";
import { TEAM, makeTask, viewer } from "./task-test-helpers";
import type { ChecklistInstanceView } from "./task-types";

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

describe("management Today scope (TS-010..TS-016, #169)", () => {
  const mona = viewer("mona");
  const named = (id: string, title: string, who: (typeof ann)[]) =>
    makeTask({
      id,
      title,
      assignmentMode: who.length > 1 ? "multiple" : "individual",
      assignees: who,
    });
  const annTask = named("a", "Ann task", [ann]);
  const beaTask = named("b", "Bea task", [bea]);
  const pairTask = named("p", "Pair task", [ann, bea]);
  const monaTask = named("m", "Mona task", [
    { profileId: "mona", name: "Mona" },
  ]);
  const teamTask = makeTask({
    id: "t",
    title: "Whole team task",
    assignmentMode: "all_team",
  });
  const anyoneTask = makeTask({
    id: "y",
    title: "Anyone task",
    assignmentMode: "anyone",
  });
  const all = [annTask, beaTask, pairTask, monaTask, teamTask, anyoneTask];
  const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

  it("staffLabel: names, Whole team, Anyone; nothing invented (TS-015)", () => {
    expect(staffLabel(annTask)).toBe("Ann");
    expect(staffLabel(pairTask)).toBe("Ann, Bea");
    expect(staffLabel(teamTask)).toBe("Whole team");
    expect(staffLabel(anyoneTask)).toBe("Anyone");
    expect(staffLabel({ assignmentMode: "individual", assignees: [] })).toBe(
      "",
    );
  });

  it("All Staff keeps every row the viewer can already read (TS-010)", () => {
    expect(filterByScope(all, ALL_STAFF_SCOPE, mona)).toHaveLength(6);
  });

  it("My Tasks uses the existing assigned-or-shared rule, not created-by (TS-013)", () => {
    const mine = filterByScope(all, { type: "mine" }, mona);
    expect(titles(mine)).toEqual([
      "Mona task",
      "Whole team task",
      "Anyone task",
    ]);
    // created-by must not leak in
    const createdByMona = {
      ...annTask,
      createdBy: { profileId: "mona", name: "Mona" },
    };
    expect(filterByScope([createdByMona], { type: "mine" }, mona)).toEqual([]);
  });

  it("a person matches named assignees only, by id, never shared work (TS-014)", () => {
    const ann_ = filterByScope(all, { type: "person", profileId: "ann" }, mona);
    expect(titles(ann_)).toEqual(["Ann task", "Pair task"]);
    // display-name equality is irrelevant: a different id with the same name
    const twin = named("tw", "Twin task", [
      { profileId: "other", name: "Ann" },
    ]);
    expect(
      filterByScope([twin], { type: "person", profileId: "ann" }, mona),
    ).toEqual([]);
  });

  it("round-trips the select value and rejects malformed values", () => {
    for (const scope of [
      ALL_STAFF_SCOPE,
      { type: "mine" as const },
      { type: "person" as const, profileId: "ann" },
    ]) {
      expect(scopeFromValue(scopeToValue(scope))).toEqual(scope);
    }
    expect(scopeFromValue("person:")).toEqual(ALL_STAFF_SCOPE);
    expect(scopeFromValue("garbage")).toEqual(ALL_STAFF_SCOPE);
  });

  it("resolveScope: staff are pinned to all; unknown people fall back (TS-016)", () => {
    const person = { type: "person" as const, profileId: "ann" };
    expect(resolveScope(person, viewer("ann"), TEAM)).toEqual(ALL_STAFF_SCOPE);
    expect(resolveScope({ type: "mine" }, viewer("ann"), TEAM)).toEqual(
      ALL_STAFF_SCOPE,
    );
    for (const manager of ["mona", "asa"]) {
      expect(resolveScope(person, viewer(manager), TEAM)).toEqual(person);
    }
    expect(resolveScope(person, mona, [])).toEqual(ALL_STAFF_SCOPE);
  });

  describe("buildTodayGroups", () => {
    const item = (
      id: string,
      title: string,
      overrides: Parameters<typeof makeTask>[0] = {},
    ) =>
      makeTask({
        id,
        title,
        kind: "opening",
        assignmentMode: "anyone",
        checklistInstanceId: "o1",
        ...overrides,
      });
    const instance = (
      kind: "opening" | "closing",
      serviceDate: string,
      items: ReturnType<typeof item>[],
    ): ChecklistInstanceView => ({
      id: `${kind}-${serviceDate}`,
      kind,
      name: kind,
      serviceDate,
      items,
    });
    const input = (
      tasks: ReturnType<typeof makeTask>[],
      checklists: ChecklistInstanceView[],
    ) => ({
      tasks,
      checklists,
      today: TODAY,
      timeZone: "America/Chicago",
      now: NOW,
    });

    it("groups Opening / General / Closing for today's service date only", () => {
      const groups = buildTodayGroups(
        input(
          [annTask],
          [
            instance("opening", TODAY, [item("o1", "Unlock")]),
            instance("opening", "2026-10-29", [item("o0", "Yesterday open")]),
            instance("closing", TODAY, [
              item("c1", "Lock up", { kind: "closing" }),
            ]),
          ],
        ),
        ALL_STAFF_SCOPE,
        viewer("mona"),
      );
      expect(titles(groups.opening)).toEqual(["Unlock"]);
      expect(titles(groups.general)).toEqual(["Ann task"]);
      expect(titles(groups.closing)).toEqual(["Lock up"]);
    });

    it("keeps today's semantics: overdue first, upcoming and cancelled out, finished-today kept", () => {
      const overdue = named("od", "Overdue", [ann]);
      overdue.dueAt = "2026-10-29T15:00:00Z";
      overdue.dueDate = "2026-10-29";
      const upcoming = named("up", "Upcoming", [ann]);
      upcoming.dueDate = "2026-11-02";
      const cancelled = named("cx", "Cancelled", [ann]);
      cancelled.status = "cancelled";
      const doneToday = named("dt", "Done today", [ann]);
      doneToday.status = "completed";
      doneToday.completedAt = "2026-10-30T16:00:00Z";
      const doneOld = named("do", "Done last week", [ann]);
      doneOld.status = "completed";
      doneOld.completedAt = "2026-10-20T16:00:00Z";
      const groups = buildTodayGroups(
        input([annTask, doneToday, upcoming, cancelled, doneOld, overdue], []),
        ALL_STAFF_SCOPE,
        viewer("mona"),
      );
      expect(titles(groups.general)).toEqual([
        "Overdue",
        "Ann task",
        "Done today",
      ]);
    });

    it("applies the scope to checklist items as well as tasks", () => {
      const checklists = [
        instance("opening", TODAY, [
          item("o1", "Unlock"),
          item("o2", "Set patio", {
            assignmentMode: "individual",
            assignees: [ann],
          }),
          item("o3", "Count register", {
            assignmentMode: "individual",
            assignees: [bea],
          }),
          item("o4", "Dropped", { status: "cancelled" }),
        ]),
      ];
      const forAnn = buildTodayGroups(
        input([annTask, beaTask], checklists),
        { type: "person", profileId: "ann" },
        viewer("mona"),
      );
      expect(titles(forAnn.opening)).toEqual(["Set patio"]);
      expect(titles(forAnn.general)).toEqual(["Ann task"]);
      const everyone = buildTodayGroups(
        input([], checklists),
        ALL_STAFF_SCOPE,
        viewer("asa"),
      );
      expect(titles(everyone.opening).sort()).toEqual([
        "Count register",
        "Set patio",
        "Unlock",
      ]);
    });
  });
});
