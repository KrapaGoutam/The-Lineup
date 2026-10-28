/**
 * Tasks V1 -- real-mode database/RPC scenarios (hosted DEV only).
 * Scenario ids (TASK-xxx) match docs/features/tasks-v1/TEST_MATRIX.md. Every
 * call goes through a synthetic user's own JWT, so RLS, grants and the
 * SECURITY DEFINER boundary apply exactly as they do for a browser session.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixture, todayInChicago, type Fixture } from "./support/harness";

let fx: Fixture;
let loc: string;
let org: string;

type Rpc = { data: unknown; error: { message: string; code?: string } | null };

async function create(
  user: Fixture["owner"],
  over: Record<string, unknown> = {},
): Promise<Rpc> {
  return user.client.rpc("task_create", {
    p_organization_id: org,
    p_location_id: loc,
    p_title: "Real task",
    p_instructions: null,
    p_category: "other",
    p_priority: "normal",
    p_assignment_mode: "anyone",
    p_assignee_ids: [],
    p_each_person: false,
    p_start_date: null,
    p_due_date: null,
    p_due_time: null,
    p_due_window: null,
    ...over,
  });
}

async function taskId(title: string): Promise<string> {
  const { data, error } = await fx.admin
    .from("tasks")
    .select("id")
    .eq("organization_id", org)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

beforeAll(async () => {
  fx = await createFixture();
  loc = fx.locA;
  org = fx.orgId;
});

afterAll(async () => {
  if (!fx) return;
  // Tasks hold actor FKs to memberships and append-only events: remove them
  // top-down (cascades are allowed to clear the audit rows) before the
  // generic fixture teardown deletes memberships.
  await fx.admin
    .from("tasks")
    .delete()
    .in("organization_id", [org, fx.otherOrgId]);
  await fx.admin
    .from("checklist_instances")
    .delete()
    .in("organization_id", [org, fx.otherOrgId]);
  await fx.admin
    .from("task_recurrence_rules")
    .delete()
    .in("organization_id", [org, fx.otherOrgId]);
  await fx.admin
    .from("checklist_templates")
    .delete()
    .in("organization_id", [org, fx.otherOrgId]);
  await fx.teardown();
});

describe("permissions and lifecycle", () => {
  it("TASK-002 staff cannot create; TASK-001/003 manager and owner can", async () => {
    expect((await create(fx.server1)).error).not.toBeNull();
    expect(
      (
        await create(fx.manager, {
          p_title: "Patio",
          p_assignment_mode: "individual",
          p_assignee_ids: [fx.server1.id],
          p_due_date: todayInChicago(),
          p_due_time: "23:00",
        })
      ).error,
    ).toBeNull();
    expect(
      (await create(fx.owner, { p_title: "Owner task" })).error,
    ).toBeNull();
  });

  it("TASK-007 unrelated staff cannot complete; TASK-005 assignee can", async () => {
    const id = await taskId("Patio");
    const denied = await fx.server2.client.rpc("task_complete", {
      p_task_id: id,
    });
    expect(denied.error).not.toBeNull();
    const ok = await fx.server1.client.rpc("task_complete", {
      p_task_id: id,
      p_note: "wiped",
    });
    expect(ok.error).toBeNull();
    const row = await fx.admin
      .from("tasks")
      .select("completed_by, status")
      .eq("id", id)
      .single();
    expect(row.data).toMatchObject({
      status: "completed",
      completed_by: fx.server1.id,
    });
  });

  it("TASK-006 manager completes on behalf; the assignee is unchanged", async () => {
    await create(fx.manager, {
      p_title: "Behalf",
      p_assignment_mode: "individual",
      p_assignee_ids: [fx.server2.id],
    });
    const id = await taskId("Behalf");
    expect(
      (await fx.manager.client.rpc("task_complete", { p_task_id: id })).error,
    ).toBeNull();
    const row = await fx.admin
      .from("tasks")
      .select("completed_by")
      .eq("id", id)
      .single();
    const assignees = await fx.admin
      .from("task_assignments")
      .select("profile_id")
      .eq("task_id", id);
    expect(row.data?.completed_by).toBe(fx.manager.id);
    expect(assignees.data?.map((a) => a.profile_id)).toEqual([fx.server2.id]);
  });

  it("TASK-009 block needs a reason; TASK-008 reassignment is manager-only", async () => {
    await create(fx.manager, {
      p_title: "Blockable",
      p_assignment_mode: "individual",
      p_assignee_ids: [fx.server1.id],
    });
    const id = await taskId("Blockable");
    expect(
      (
        await fx.server1.client.rpc("task_set_status", {
          p_task_id: id,
          p_status: "blocked",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await fx.server1.client.rpc("task_set_status", {
          p_task_id: id,
          p_status: "blocked",
          p_reason: "no scoop",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await fx.server1.client.rpc("task_assign", {
          p_task_id: id,
          p_assignment_mode: "individual",
          p_assignee_ids: [fx.server3.id],
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await fx.manager.client.rpc("task_assign", {
          p_task_id: id,
          p_assignment_mode: "individual",
          p_assignee_ids: [fx.server3.id],
        })
      ).error,
    ).toBeNull();
  });
});

describe("privacy and tenant isolation", () => {
  it("TASK-060/061 staff read no audit history; managers do", async () => {
    const staff = await fx.server1.client.from("task_events").select("id");
    expect(staff.data ?? []).toHaveLength(0);
    const manager = await fx.manager.client.from("task_events").select("id");
    expect((manager.data ?? []).length).toBeGreaterThan(0);
  });

  it("individual tasks are invisible to unrelated staff; TASK-072 other orgs see nothing", async () => {
    const id = await taskId("Owner task"); // mode anyone -> visible to staff
    expect(
      (await fx.server3.client.from("tasks").select("id").eq("id", id)).data,
    ).toHaveLength(1);
    const patio = await taskId("Patio");
    expect(
      (await fx.server3.client.from("tasks").select("id").eq("id", patio)).data,
    ).toHaveLength(0);
    expect(
      (await fx.outsider.client.from("tasks").select("id")).data ?? [],
    ).toHaveLength(0);
  });

  it("TASK-015 direct writes and anonymous calls are rejected", async () => {
    const id = await taskId("Owner task");
    const write = await fx.manager.client
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", id);
    expect(write.error).not.toBeNull();
    const anon = await fx.anon.rpc("task_complete", { p_task_id: id });
    expect(anon.error).not.toBeNull();
  });

  it("TASK-070/071 foreign assignees and locations are rejected", async () => {
    expect(
      (
        await create(fx.manager, {
          p_assignment_mode: "individual",
          p_assignee_ids: [fx.outsider.id],
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await create(fx.manager, { p_location_id: fx.otherLoc })).error,
    ).not.toBeNull();
  });
});

describe("daily checklists (Opening)", () => {
  const items = () => [
    { title: "Unlock entrance", assignment_mode: "anyone" },
    {
      title: "Set patio",
      assignment_mode: "individual",
      assignee_ids: [fx.server1.id],
    },
  ];

  it("TASK-035 staff cannot save templates; manager can", async () => {
    const args = {
      p_organization_id: org,
      p_location_id: loc,
      p_template_id: null,
      p_kind: "opening",
      p_name: "Real Opening",
      p_days_of_week: [0, 1, 2, 3, 4, 5, 6],
      p_active: true,
    };
    expect(
      (
        await fx.server1.client.rpc("checklist_template_save", {
          ...args,
          p_items: items(),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await fx.manager.client.rpc("checklist_template_save", {
          ...args,
          p_items: items(),
        })
      ).error,
    ).toBeNull();
  });

  it("TASK-020..026 generation is idempotent and each day is isolated", async () => {
    const today = todayInChicago();
    const tomorrow = todayInChicago(1);
    const gen = (date: string, who = fx.server2) =>
      who.client.rpc("checklist_generate_daily", {
        p_organization_id: org,
        p_location_id: loc,
        p_service_date: date,
        p_kind: "opening",
      });
    expect((await gen(today)).error).toBeNull();
    expect((await gen(today, fx.manager)).error).toBeNull();
    const instances = await fx.admin
      .from("checklist_instances")
      .select("id")
      .eq("organization_id", org)
      .eq("service_date", today);
    expect(instances.data).toHaveLength(1);

    const unlock = await fx.admin
      .from("tasks")
      .select("id")
      .eq("checklist_instance_id", instances.data![0].id)
      .eq("title", "Unlock entrance")
      .single();
    // Unrelated staff completes the shared item; cannot do the person-specific one.
    expect(
      (
        await fx.server3.client.rpc("task_complete", {
          p_task_id: unlock.data!.id,
        })
      ).error,
    ).toBeNull();
    const patio = await fx.admin
      .from("tasks")
      .select("id")
      .eq("checklist_instance_id", instances.data![0].id)
      .eq("title", "Set patio")
      .single();
    expect(
      (
        await fx.server3.client.rpc("task_complete", {
          p_task_id: patio.data!.id,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await fx.manager.client.rpc("task_complete", {
          p_task_id: patio.data!.id,
        })
      ).error,
    ).toBeNull();

    expect((await gen(tomorrow)).error).toBeNull();
    const next = await fx.admin
      .from("tasks")
      .select("status, checklist_instance_id")
      .eq("organization_id", org)
      .eq("kind", "opening");
    const todays = next.data!.filter(
      (t) => t.checklist_instance_id === instances.data![0].id,
    );
    const others = next.data!.filter(
      (t) => t.checklist_instance_id !== instances.data![0].id,
    );
    expect(todays.every((t) => t.status === "completed")).toBe(true);
    expect(others).toHaveLength(2);
    expect(others.every((t) => t.status === "open")).toBe(true);

    // Staff can read the whole checklist, including other people's items.
    const visible = await fx.server3.client
      .from("tasks")
      .select("id")
      .eq("kind", "opening");
    expect((visible.data ?? []).length).toBe(4);
  });
});

describe("recurrence and notifications", () => {
  it("TASK-040/043 a daily series makes independent occurrences; stop keeps history", async () => {
    const today = todayInChicago();
    const created = await fx.manager.client.rpc("task_series_create", {
      p_organization_id: org,
      p_location_id: loc,
      p_title: "Real daily series",
      p_instructions: null,
      p_category: "cleaning",
      p_priority: "normal",
      p_assignment_mode: "individual",
      p_assignee_ids: [fx.server1.id],
      p_due_time: "23:30",
      p_due_window: null,
      p_frequency: "daily",
      p_weekdays: null,
      p_day_of_month: null,
      p_starts_on: today,
      p_end_type: "never",
      p_ends_on: null,
      p_max_occurrences: null,
    });
    expect(created.error).toBeNull();
    const rule = created.data as string;
    const occurrences = await fx.admin
      .from("tasks")
      .select("id, occurrence_date")
      .eq("recurrence_rule_id", rule);
    expect(occurrences.data).toHaveLength(15);

    const first = occurrences.data!.find((o) => o.occurrence_date === today)!;
    expect(
      (await fx.server1.client.rpc("task_complete", { p_task_id: first.id }))
        .error,
    ).toBeNull();
    const after = await fx.admin
      .from("tasks")
      .select("status")
      .eq("recurrence_rule_id", rule);
    expect(after.data!.filter((t) => t.status === "completed")).toHaveLength(1);

    expect(
      (await fx.manager.client.rpc("task_series_stop", { p_rule_id: rule }))
        .error,
    ).toBeNull();
    const stopped = await fx.admin
      .from("tasks")
      .select("status")
      .eq("recurrence_rule_id", rule);
    expect(stopped.data!.filter((t) => t.status === "completed")).toHaveLength(
      1,
    );
    expect(stopped.data!.filter((t) => t.status === "open")).toHaveLength(0);
  });

  it("TASK-050/052/053 operational notifications, sweep and read state", async () => {
    const unread = async () =>
      (
        await fx.server1.client
          .from("task_notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null)
      ).count ?? 0;
    // T-3: only operational notifications remain. The checklist started
    // earlier by another member is announced; the normal-task assignments made
    // by this suite store nothing (their audit rows are asserted elsewhere).
    expect(await unread()).toBeGreaterThan(0);
    const types = await fx.server1.client
      .from("task_notifications")
      .select("type");
    expect(
      (types.data ?? []).every((n) => n.type === "checklist_available"),
    ).toBe(true);
    const sweep = await fx.server2.client.rpc("task_notifications_sweep", {
      p_organization_id: org,
      p_location_id: loc,
    });
    expect(sweep.error).toBeNull();
    const again = await fx.server2.client.rpc("task_notifications_sweep", {
      p_organization_id: org,
      p_location_id: loc,
    });
    expect(again.data).toBe(0); // idempotent
    const read = await fx.server1.client.rpc(
      "task_notifications_mark_read",
      {},
    );
    expect(read.error).toBeNull();
    expect(await unread()).toBe(0);
    // Another person's inbox is untouched and private.
    const peek = await fx.server2.client
      .from("task_notifications")
      .select("recipient_profile_id");
    expect(
      (peek.data ?? []).every((n) => n.recipient_profile_id === fx.server2.id),
    ).toBe(true);
  });
});
