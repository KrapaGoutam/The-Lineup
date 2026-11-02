import { describe, expect, it } from "vitest";

import {
  collectHistoryProfileIds,
  mapHistoryRow,
  type TaskHistoryRow,
} from "./task-history-mapper";

const row: TaskHistoryRow & { completed_at: string } = {
  id: "t1",
  kind: "closing",
  title: "Restock tequila shelf",
  assignment_mode: "multiple",
  completed_by: "mona",
  completed_at: "2026-11-02T03:42:00Z",
  task_assignments: [
    { profile_id: "bea", assigned_at: "2026-11-02T01:10:00Z" },
    { profile_id: "ann", assigned_at: "2026-11-01T22:00:00Z" },
  ],
};
const names = new Map([
  ["ann", "Ann"],
  ["bea", "Bea"],
  ["mona", "Mona"],
]);

describe("mapHistoryRow", () => {
  it("keeps assigned-to and completed-by as separate stored facts", () => {
    const entry = mapHistoryRow(row, names);
    expect(entry.assignees.map((a) => a.name)).toEqual(["Ann", "Bea"]);
    expect(entry.completedBy).toEqual({ profileId: "mona", name: "Mona" });
    expect(entry.kind).toBe("closing");
    expect(entry.completedAt).toBe("2026-11-02T03:42:00Z");
  });

  it("uses the earliest stored assignment time", () => {
    expect(mapHistoryRow(row, names).assignedAt).toBe("2026-11-01T22:00:00Z");
  });

  it("leaves assignedAt and assignees empty when nobody was named", () => {
    const entry = mapHistoryRow(
      { ...row, assignment_mode: "all_team", task_assignments: [] },
      names,
    );
    expect(entry.assignees).toEqual([]);
    expect(entry.assignedAt).toBeNull();
  });

  it("does not substitute the assignee when completed_by is missing", () => {
    const entry = mapHistoryRow({ ...row, completed_by: null }, names);
    expect(entry.completedBy).toBeNull();
  });

  it("names a removed member without hiding the record", () => {
    expect(mapHistoryRow(row, new Map()).completedBy?.name).toBe(
      "Former team member",
    );
  });

  it("collects every profile id once", () => {
    expect(collectHistoryProfileIds([row, row]).sort()).toEqual([
      "ann",
      "bea",
      "mona",
    ]);
  });
});
