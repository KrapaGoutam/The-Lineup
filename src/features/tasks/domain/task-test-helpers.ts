import type { Designation } from "@/features/auth/domain/passcode";

import type { EngineContext } from "./task-engine";
import type { TaskTeamMember, TaskView, TaskViewer } from "./task-types";

export const TEAM: TaskTeamMember[] = [
  { profileId: "mona", name: "Mona", designation: "manager" },
  { profileId: "ann", name: "Ann", designation: "staff" },
  { profileId: "bea", name: "Bea", designation: "staff" },
  { profileId: "cal", name: "Cal", designation: "staff" },
  { profileId: "asa", name: "Asa", designation: "assistant_manager" },
];

export function viewer(profileId: string): TaskViewer {
  const member = TEAM.find((m) => m.profileId === profileId)!;
  return {
    profileId,
    name: member.name,
    designation: member.designation as Designation,
  };
}

export function ctxFor(
  profileId: string,
  now = new Date("2026-10-30T18:00:00Z"),
): EngineContext {
  return {
    actor: viewer(profileId),
    team: TEAM,
    timeZone: "America/Chicago",
    now,
  };
}

export function makeTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "t1",
    kind: "task",
    title: "Task",
    instructions: null,
    category: "other",
    priority: "normal",
    status: "open",
    assignmentMode: "anyone",
    assignees: [],
    startDate: null,
    dueDate: null,
    dueTime: null,
    dueWindow: null,
    dueAt: null,
    blockedReason: null,
    completedBy: null,
    completedAt: null,
    completionNote: null,
    cancelledAt: null,
    groupId: null,
    recurrenceRuleId: null,
    checklistInstanceId: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: "2026-10-30T00:00:00Z",
    ...overrides,
  };
}
