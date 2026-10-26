import type { TaskCommand, TaskCreateInput } from "./task-commands";
import {
  applyCommand,
  emptyTasksState,
  type EngineContext,
  type TasksState,
} from "./task-engine";
import { generateDailyChecklists } from "./checklist-engine";
import { addDaysToDate } from "./task-rules";
import { zonedWallTimeFromInstant } from "@/lib/timezone";
import type {
  AssignmentMode,
  ChecklistKind,
  TaskTeamMember,
} from "./task-types";

const MANAGER_ID = "manager-maya";

const base: Omit<TaskCreateInput, "title" | "assignmentMode" | "assigneeIds"> =
  {
    instructions: null,
    category: "cleaning",
    priority: "normal",
    startDate: null,
    dueDate: null,
    dueTime: null,
    dueWindow: null,
    eachPerson: false,
  };

/**
 * Demo-mode starting point: a handful of realistic tasks relative to "today"
 * in the demo time zone, created through the same engine the UI uses so the
 * seeded state is always internally consistent. Seeds are skipped silently if
 * a referenced teammate is missing (e.g. a trimmed demo roster).
 */
export function createDemoTasksState(
  now: Date,
  timeZone: string,
  team: readonly TaskTeamMember[],
): TasksState {
  const manager = team.find((m) => m.profileId === MANAGER_ID);
  if (!manager) return emptyTasksState();

  const today = zonedWallTimeFromInstant(now, timeZone).date;
  const ctxFor = (profileId: string): EngineContext | null => {
    const member = team.find((m) => m.profileId === profileId);
    if (!member) return null;
    return {
      actor: {
        profileId: member.profileId,
        name: member.name,
        designation: member.designation,
      },
      team,
      timeZone,
      now,
    };
  };

  let state = emptyTasksState();
  const run = (actor: string, command: TaskCommand) => {
    const ctx = ctxFor(actor);
    if (!ctx) return;
    const result = applyCommand(state, command, ctx);
    if (result.ok) state = result.value;
  };
  const create = (
    input: Partial<TaskCreateInput> &
      Pick<TaskCreateInput, "title" | "assignmentMode" | "assigneeIds">,
  ) => run(MANAGER_ID, { type: "create", input: { ...base, ...input } });

  create({
    title: "Refill ice bins",
    category: "kitchen",
    priority: "high",
    assignmentMode: "individual",
    assigneeIds: ["mia"],
    dueDate: today,
    dueTime: "23:00",
  });
  create({
    title: "Clean patio heaters",
    instructions: "Wipe top and sides.\nDo not move gas connections.",
    assignmentMode: "individual",
    assigneeIds: ["leo"],
    dueDate: today,
    dueWindow: "closing",
  });
  create({
    title: "Take trash outside",
    assignmentMode: "multiple",
    assigneeIds: ["mia", "leo", "ava"],
    dueDate: today,
    dueWindow: "during_shift",
  });
  create({
    title: "Restock server station",
    category: "inventory",
    priority: "urgent",
    assignmentMode: "individual",
    assigneeIds: ["ava"],
    dueDate: addDaysToDate(today, -1),
    dueTime: "16:00",
  });
  create({
    title: "Read the new allergy policy",
    category: "safety",
    assignmentMode: "all_team",
    assigneeIds: [],
    dueDate: addDaysToDate(today, 1),
  });
  create({
    title: "Check restroom",
    assignmentMode: "anyone",
    assigneeIds: [],
    dueDate: today,
    dueWindow: "during_shift",
  });
  const item = (
    title: string,
    assignmentMode: AssignmentMode,
    assigneeIds: string[] = [],
    category = "other",
  ) => ({
    title,
    instructions: null,
    category,
    priority: "normal" as const,
    assignmentMode,
    assigneeIds,
    dueWindow: null,
    dueTime: null,
  });
  const template = (
    kind: ChecklistKind,
    name: string,
    items: ReturnType<typeof item>[],
  ) =>
    run(MANAGER_ID, {
      type: "templateSave",
      templateId: null,
      input: {
        kind,
        name,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        items,
      },
    });
  template("opening", "Weekday Opening", [
    item("Unlock entrance", "anyone", [], "opening"),
    item("Turn on TVs", "all_team", [], "opening"),
    item("Check bathrooms", "anyone", [], "cleaning"),
    item("Set patio", "individual", ["mia"], "opening"),
    item("Count register", "individual", ["leo"], "opening"),
    item("Check reservations", "individual", ["ava"], "opening"),
  ]);
  template("closing", "Weekday Closing", [
    item("Turn off TVs", "anyone", [], "closing"),
    item("Lock patio", "anyone", [], "closing"),
    item("Close register", "individual", ["leo"], "closing"),
    item("Clean bar station", "individual", ["mia"], "closing"),
  ]);

  // Yesterday's opening, partly done: shows "Previous days" and proves a
  // finished day never bleeds into today's fresh checklist.
  const yesterday = addDaysToDate(today, -1);
  const manager2 = ctxFor(MANAGER_ID);
  if (manager2) {
    state = generateDailyChecklists(
      state,
      manager2,
      yesterday,
      yesterday,
      "opening",
    );
    for (const title of ["Unlock entrance", "Turn on TVs", "Check bathrooms"]) {
      const done = state.tasks.find(
        (t) => t.title === title && t.dueDate === yesterday,
      );
      if (done) run("mia", { type: "complete", taskId: done.id });
    }
  }

  const restroom = state.tasks.find((t) => t.title === "Check restroom");
  if (restroom) run("mia", { type: "complete", taskId: restroom.id });

  return state;
}
