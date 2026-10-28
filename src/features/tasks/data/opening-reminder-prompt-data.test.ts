import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewer } from "../domain/task-test-helpers";

const calls = vi.hoisted(() => ({
  rpc: [] as { name: string; args: unknown }[],
  filters: [] as { table: string; column: string; value: unknown }[],
  tables: {} as Record<string, unknown[]>,
}));

vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: async () => ({
    id: "loc-1",
    time_zone: "America/Chicago",
  }),
}));

function query(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.in = chain;
  builder.overrideTypes = chain;
  builder.eq = (column: string, value: unknown) => {
    calls.filters.push({ table, column, value });
    return builder;
  };
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: calls.tables[table] ?? [], error: null });
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      calls.rpc.push({ name, args });
      return { data: 0, error: null };
    },
    from: (table: string) => query(table),
  }),
}));

import { getOpeningReminderPrompt } from "./opening-reminder-prompt-data";

const taskRow = (id: string, mode: string, assignees: string[] = []) => ({
  id,
  kind: "opening",
  title: id,
  instructions: null,
  category: "other",
  priority: "normal",
  status: "open",
  assignment_mode: mode,
  start_date: null,
  due_date: null,
  due_time: null,
  due_window: null,
  due_at: null,
  blocked_reason: null,
  completed_by: null,
  completed_at: null,
  completion_note: null,
  cancelled_at: null,
  group_id: null,
  recurrence_rule_id: null,
  checklist_instance_id: "inst-1",
  sort_order: 0,
  created_by: null,
  created_at: "2026-10-30T00:00:00Z",
  task_assignments: assignees.map((profile_id) => ({ profile_id })),
});

beforeEach(() => {
  calls.rpc.length = 0;
  calls.filters.length = 0;
  calls.tables = {
    checklist_instances: [{ id: "inst-1" }],
    task_notifications: [],
    tasks: [
      taskRow("a", "anyone"),
      taskRow("b", "individual", ["ann"]),
      taskRow("c", "individual", ["bea"]),
    ],
  };
});

describe("getOpeningReminderPrompt", () => {
  it("wakes the sweep with the tenant only: no stage, recipient or time", async () => {
    await getOpeningReminderPrompt("org-1", viewer("ann"));
    const sweep = calls.rpc.find(
      (c) => c.name === "task_opening_reminders_sweep",
    );
    expect(sweep?.args).toEqual({
      p_organization_id: "org-1",
      p_location_id: "loc-1",
    });
  });

  it("reads only the caller's own opening_reminder rows", async () => {
    await getOpeningReminderPrompt("org-1", viewer("ann"));
    const reminderFilters = calls.filters.filter(
      (f) => f.table === "task_notifications",
    );
    expect(reminderFilters).toContainEqual({
      table: "task_notifications",
      column: "recipient_profile_id",
      value: "ann",
    });
    expect(reminderFilters).toContainEqual({
      table: "task_notifications",
      column: "type",
      value: "opening_reminder",
    });
  });

  it("counts only the work in the caller's own scope", async () => {
    const asStaff = await getOpeningReminderPrompt("org-1", viewer("cal"));
    expect(asStaff?.currentIncomplete).toBe(1);
    const asAnn = await getOpeningReminderPrompt("org-1", viewer("ann"));
    expect(asAnn?.currentIncomplete).toBe(2);
    const asManager = await getOpeningReminderPrompt("org-1", viewer("mona"));
    expect(asManager?.currentIncomplete).toBe(3);
    // The payload is a number and the caller's own rows: nothing else.
    expect(Object.keys(asStaff ?? {}).sort()).toEqual([
      "currentIncomplete",
      "locationId",
      "reminders",
      "today",
    ]);
  });

  it("reports no incomplete work when today has no Opening checklist", async () => {
    calls.tables.checklist_instances = [];
    const data = await getOpeningReminderPrompt("org-1", viewer("mona"));
    expect(data?.currentIncomplete).toBe(0);
  });
});
