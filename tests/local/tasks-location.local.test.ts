import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CONFIGURABLE_MODULE_KEYS } from "@/features/modules/domain/module-registry";
import { zonedWallTimeFromInstant } from "@/lib/timezone";
import {
  createTasksFixture,
  must,
  taskArgs,
  type TasksFixture,
  type TasksTestUser,
} from "./support/tasks-fixture";

// The auth and canonical-context boundary is exercised end-to-end in browser
// acceptance. Here real session clients also drive the real loaders/actions;
// only the Next request/cookie adapter is supplied explicitly.
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
  runTaskCommandAction,
  acknowledgeOpeningReminderAction,
  getTasksSnapshotAction,
  getTasksUnreadCountAction,
  getOpeningReminderPromptAction,
  getTaskHistoryAction,
} from "@/features/tasks/actions/tasks-actions";

let taskA: string;
let taskB: string;
let templateB: string;
let ruleB: string;
const today = (zone = "America/Chicago") =>
  zonedWallTimeFromInstant(new Date(), zone).date;
function bind(user: TasksTestUser, location: string, designation = "manager") {
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
async function state() {
  const tables = [
    "tasks",
    "task_assignments",
    "task_events",
    "task_notifications",
    "checklist_templates",
    "checklist_instances",
    "task_recurrence_rules",
    "memberships",
  ] as const;
  return Promise.all(
    tables.map(async (table) => {
      const data = must(
        await fx.admin
          .from(table)
          .select("*")
          .in("organization_id", [fx.org.id, fx.other.id]),
      );
      return (data ?? []).map((row) => JSON.stringify(row)).sort();
    }),
  );
}
async function denied(
  operation: () => PromiseLike<{ error: { message: string } | null }>,
) {
  const before = await state();
  const result = await operation();
  expect(result.error).not.toBeNull();
  expect(await state()).toEqual(before);
}
async function create(user: TasksTestUser, location: string, title: string) {
  return must(
    await user.client.rpc("task_create", taskArgs(fx.org.id, location, title)),
  )![0];
}
async function template(user: TasksTestUser, location: string, name: string) {
  return must(
    await user.client.rpc("checklist_template_save", {
      p_organization_id: fx.org.id,
      p_location_id: location,
      p_template_id: null,
      p_kind: "opening",
      p_name: name,
      p_days_of_week: [0, 1, 2, 3, 4, 5, 6],
      p_active: true,
      p_items: [
        { title: `Shared ${name}`, assignment_mode: "anyone" },
        {
          title: `Assigned ${name}`,
          assignment_mode: "individual",
          assignee_ids: [fx.dual.id],
        },
      ],
    }),
  )!;
}
function seriesArgs(location: string, title: string) {
  return {
    p_organization_id: fx.org.id,
    p_location_id: location,
    p_title: title,
    p_instructions: null,
    p_category: "other",
    p_priority: "normal" as const,
    p_assignment_mode: "individual" as const,
    p_assignee_ids: [fx.dual.id],
    p_due_time: "09:00",
    p_due_window: null,
    p_frequency: "daily" as const,
    p_weekdays: null,
    p_day_of_month: null,
    p_starts_on: today(),
    p_end_type: "after_count" as const,
    p_ends_on: null,
    p_max_occurrences: 2,
  };
}
beforeAll(async () => {
  fx = await createTasksFixture();
  taskA = await create(fx.manager, fx.a, "Location A task");
  taskB = await create(fx.manager, fx.b, "Location B task");
  await template(fx.manager, fx.a, "Opening A");
  templateB = await template(fx.manager, fx.b, "Opening B");
  ruleB = must(
    await fx.manager.client.rpc(
      "task_series_create",
      seriesArgs(fx.b, "Series B"),
    ),
  )!;
});
afterAll(async () => {
  if (fx) await fx.teardown();
});

it("A staff sees A but not B, foreign or unassigned organization members see no tasks", async () => {
  const rows = must(
    await fx.staff.client
      .from("tasks")
      .select("id,location_id")
      .eq("organization_id", fx.org.id),
  )!;
  expect(rows.map((r) => r.id)).toContain(taskA);
  expect(rows.every((r) => r.location_id === fx.a)).toBe(true);
  for (const user of [fx.unassigned, fx.foreign]) {
    expect(
      must(
        await user.client
          .from("tasks")
          .select("id")
          .eq("organization_id", fx.org.id),
      ),
    ).toEqual([]);
    await denied(() =>
      user.client.rpc("task_create", taskArgs(fx.org.id, fx.a, "Denied")),
    );
  }
});
it("dual assigned staff has separate verified snapshots, badge counts, reminder previews and history", async () => {
  for (const location of [fx.a, fx.b]) {
    const expectedContext = bind(fx.dual, location, "staff");
    const result = await getTasksSnapshotAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    expect(result.data.locationId).toBe(location);
    expect(
      result.data.tasks.some(
        (t) => t.id === (location === fx.a ? taskA : taskB),
      ),
    ).toBe(true);
    expect(
      result.data.tasks.some(
        (t) => t.id === (location === fx.a ? taskB : taskA),
      ),
    ).toBe(false);
    const count = await getTasksUnreadCountAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
    });
    expect(count.ok).toBe(true);
    if (count.ok) expect(count.unread).toBe(result.data.unreadCount);
    const reminder = await getOpeningReminderPromptAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
    });
    expect(reminder.ok).toBe(true);
    if (reminder.ok) expect(reminder.data.locationId).toBe(location);
    expect(
      (
        await getTaskHistoryAction({
          restaurantSlug: fx.org.slug,
          expectedContext,
        })
      ).ok,
    ).toBe(true);
  }
});
for (const role of ["owner", "manager", "assistant_manager"] as const) {
  it(`Overall ${role}: Tasks writes, genuine history and participants without fake membership`, async () => {
    must(
      await fx.admin
        .from("overall_roles")
        .upsert(
          { profile_id: fx.overall.id, role },
          { onConflict: "profile_id" },
        ),
    );
    const id = await create(fx.overall, fx.a, `Overall ${role} work`);
    must(
      await fx.overall.client.rpc("task_assign", {
        p_task_id: id,
        p_assignment_mode: "individual",
        p_assignee_ids: [fx.staff.id],
      }),
    );
    must(
      await fx.overall.client.rpc("task_complete", {
        p_task_id: id,
        p_note: "Completed on behalf",
      }),
    );
    const row = must(
      await fx.admin
        .from("tasks")
        .select("created_by,completed_by")
        .eq("id", id)
        .single(),
    )!;
    expect(row).toEqual({
      created_by: fx.overall.id,
      completed_by: fx.overall.id,
    });
    const events = must(
      await fx.overall.client
        .from("task_events")
        .select("actor_profile_id,payload")
        .eq("task_id", id),
    )!;
    expect(events.length).toBeGreaterThan(1);
    for (const event of events) {
      expect(event.actor_profile_id).toBe(fx.overall.id);
      expect(event.payload).toMatchObject({
        actor: {
          profile_id: fx.overall.id,
          location_id: fx.a,
          overall_role: role,
        },
      });
    }
    const tpl = await template(fx.overall, fx.a, `Overall ${role}`);
    must(
      await fx.overall.client.rpc("checklist_template_set_active", {
        p_template_id: tpl,
        p_active: false,
      }),
    );
    const series = must(
      await fx.overall.client.rpc(
        "task_series_create",
        seriesArgs(fx.a, `Overall ${role} series`),
      ),
    )!;
    must(
      await fx.overall.client.rpc("task_series_stop", { p_rule_id: series }),
    );
    const expectedContext = bind(fx.overall, fx.a, role);
    const history = await getTaskHistoryAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
    });
    expect(history.ok).toBe(true);
    if (history.ok)
      expect(
        history.data.entries.some((e) =>
          JSON.stringify(e).includes(fx.overall.name),
        ),
      ).toBe(true);
    expect(
      must(
        await fx.admin
          .from("memberships")
          .select("id")
          .eq("profile_id", fx.overall.id),
      ),
    ).toEqual([]);
    await denied(() =>
      fx.overall.client.rpc("task_assign", {
        p_task_id: id,
        p_assignment_mode: "individual",
        p_assignee_ids: [fx.overall.id],
      }),
    );
  });
}
it("effective branch role is independent of organization designation; Staff cannot manage", async () => {
  must(
    await fx.admin
      .from("location_memberships")
      .update({ role: "staff" })
      .eq("profile_id", fx.manager.id)
      .eq("location_id", fx.b),
  );
  await denied(() =>
    fx.manager.client.rpc(
      "task_create",
      taskArgs(fx.org.id, fx.b, "No B management"),
    ),
  );
  expect(await create(fx.manager, fx.a, "Manager A remains")).toBeTruthy();
  await denied(() =>
    fx.staff.client.rpc(
      "task_create",
      taskArgs(fx.org.id, fx.a, "Staff creation"),
    ),
  );
  must(
    await fx.admin
      .from("location_memberships")
      .update({ role: "manager" })
      .eq("profile_id", fx.manager.id)
      .eq("location_id", fx.b),
  );
});
it("a second authorized location's resource IDs and stale workspace are refused before mutation", async () => {
  const expectedContext = bind(fx.manager, fx.a);
  for (const command of [
    { type: "complete" as const, taskId: taskB },
    { type: "seriesStop" as const, ruleId: ruleB },
    {
      type: "templateSetActive" as const,
      templateId: templateB,
      active: false,
    },
    {
      type: "carryForward" as const,
      taskIds: [taskA, taskB],
      newDueDate: today(),
    },
  ]) {
    const before = await state();
    expect(
      (
        await runTaskCommandAction({
          restaurantSlug: fx.org.slug,
          expectedContext,
          command,
        })
      ).ok,
    ).toBe(false);
    expect(await state()).toEqual(before);
  }
  const before = await state();
  expect(
    await runTaskCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext: { ...expectedContext, locationId: fx.b },
      command: { type: "complete", taskId: taskA },
    }),
  ).toMatchObject({ contextStale: true });
  expect(await state()).toEqual(before);
});
it("foreign IDs, mismatched tenant/location and unauthorized assignment targets change nothing", async () => {
  await denied(() =>
    fx.staff.client.rpc("task_complete", { p_task_id: taskB, p_note: null }),
  );
  await denied(() =>
    fx.staff.client.rpc("checklist_template_set_active", {
      p_template_id: templateB,
      p_active: false,
    }),
  );
  await denied(() =>
    fx.staff.client.rpc("task_series_stop", { p_rule_id: ruleB }),
  );
  await denied(() =>
    fx.manager.client.rpc(
      "task_create",
      taskArgs(fx.other.id, fx.a, "Forged pair"),
    ),
  );
  for (const target of [fx.foreign.id, fx.unassigned.id, fx.overall.id])
    await denied(() =>
      fx.manager.client.rpc("task_assign", {
        p_task_id: taskA,
        p_assignment_mode: "individual",
        p_assignee_ids: [target],
      }),
    );
  await denied(() =>
    fx.staff.client.from("tasks").insert({
      organization_id: fx.org.id,
      location_id: fx.a,
      title: "Forged actor",
      created_by: fx.manager.id,
    }),
  );
});
it("definition children, event history and source-bound notifications do not leak B to A-only users", async () => {
  for (const table of [
    "checklist_templates",
    "checklist_template_items",
    "checklist_template_item_assignees",
    "task_recurrence_rules",
    "task_recurrence_assignees",
    "task_events",
  ] as const) {
    const rows = must(
      await fx.staff.client
        .from(table)
        .select("*")
        .eq("organization_id", fx.org.id),
    );
    expect(rows).toEqual([]);
  }
  const visible = must(
    await fx.staff.client
      .from("task_notifications")
      .select("location_id")
      .eq("organization_id", fx.org.id),
  )!;
  expect(visible.length).toBeGreaterThan(0);
  expect(visible.every((n) => n.location_id === fx.a)).toBe(true);
});
it("revoked assignment, inactive/archived location and inactive membership immediately deny", async () => {
  must(
    await fx.admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", fx.staff.id)
      .eq("location_id", fx.a),
  );
  await denied(() =>
    fx.staff.client.rpc("task_complete", { p_task_id: taskA, p_note: null }),
  );
  expect(
    must(await fx.staff.client.from("task_notifications").select("id")),
  ).toEqual([]);
  must(
    await fx.admin
      .from("location_memberships")
      .update({ active: true })
      .eq("profile_id", fx.staff.id)
      .eq("location_id", fx.a),
  );
  for (const change of [
    { active: false },
    { active: false, archived_at: new Date().toISOString() },
  ]) {
    must(await fx.admin.from("locations").update(change).eq("id", fx.a));
    await denied(() =>
      fx.overall.client.rpc(
        "task_create",
        taskArgs(fx.org.id, fx.a, "Ineligible"),
      ),
    );
    must(
      await fx.admin
        .from("locations")
        .update({ active: true, archived_at: null })
        .eq("id", fx.a),
    );
  }
  must(
    await fx.admin
      .from("memberships")
      .update({ active: false })
      .eq("profile_id", fx.staff.id),
  );
  await denied(() =>
    fx.staff.client.rpc("task_complete", { p_task_id: taskA, p_note: null }),
  );
  must(
    await fx.admin
      .from("memberships")
      .update({ active: true })
      .eq("profile_id", fx.staff.id),
  );
});
it("own-recipient dismissal survives access revocation and foreign IDs modify nothing", async () => {
  const rows = must(
    await fx.admin
      .from("task_notifications")
      .select("id,recipient_profile_id")
      .eq("organization_id", fx.org.id)
      .eq("location_id", fx.a),
  )!;
  const own = rows.find((n) => n.recipient_profile_id === fx.staff.id)!;
  const foreign = rows.find((n) => n.recipient_profile_id === fx.dual.id)!;
  expect(own).toBeTruthy();
  expect(foreign).toBeTruthy();
  must(
    await fx.admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", fx.staff.id)
      .eq("location_id", fx.a),
  );
  const before = must(
    await fx.admin
      .from("task_notifications")
      .select("read_at")
      .eq("id", foreign.id)
      .single(),
  );
  expect(
    must(
      await fx.staff.client.rpc("task_notifications_mark_read", {
        p_ids: [own.id, foreign.id],
      }),
    ),
  ).toBe(1);
  expect(
    must(
      await fx.admin
        .from("task_notifications")
        .select("read_at")
        .eq("id", foreign.id)
        .single(),
    ),
  ).toEqual(before);
  expect(
    must(
      await fx.admin
        .from("task_notifications")
        .select("read_at")
        .eq("id", own.id)
        .single(),
    )!.read_at,
  ).not.toBeNull();
  must(
    await fx.admin
      .from("location_memberships")
      .update({ active: true })
      .eq("profile_id", fx.staff.id)
      .eq("location_id", fx.a),
  );
});
it("a revoked actual Auth session cannot read or mutate using its still-issued JWT", async () => {
  const user = await fx.makeUser("session-revocation");
  must(
    await fx.admin
      .from("overall_roles")
      .insert({ profile_id: user.id, role: "owner" }),
  );
  const session = must(await user.client.auth.getSession()).session!;
  must(await fx.admin.auth.admin.signOut(session.access_token, "global"));
  await denied(() =>
    user.client.rpc(
      "task_create",
      taskArgs(fx.org.id, fx.a, "Revoked session"),
    ),
  );
  expect(
    must(
      await user.client
        .from("tasks")
        .select("id")
        .eq("organization_id", fx.org.id),
    ),
  ).toEqual([]);
});
it("ACTIVE Enabled/Disabled applies to every Overall tier and restores STAGED", async () => {
  must(
    await fx.admin.from("location_module_configs").insert(
      [fx.a, fx.b, fx.c].flatMap((location_id) =>
        CONFIGURABLE_MODULE_KEYS.map((module_key) => ({
          location_id,
          module_key,
          is_enabled: true,
        })),
      ),
    ),
  );
  must(
    await fx.admin
      .from("module_enforcement_settings")
      .update({
        mode: "active",
        activation_reference: "disposable-tasks-acceptance",
      })
      .eq("singleton", true),
  );
  try {
    for (const role of ["owner", "manager", "assistant_manager"] as const) {
      must(
        await fx.admin
          .from("overall_roles")
          .upsert(
            { profile_id: fx.overall.id, role },
            { onConflict: "profile_id" },
          ),
      );
      expect(await create(fx.overall, fx.a, `Enabled ${role}`)).toBeTruthy();
      must(
        await fx.admin
          .from("location_module_configs")
          .update({ is_enabled: false })
          .eq("location_id", fx.a)
          .eq("module_key", "tasks"),
      );
      await denied(() =>
        fx.overall.client.rpc(
          "task_create",
          taskArgs(fx.org.id, fx.a, `Disabled ${role}`),
        ),
      );
      expect(
        must(
          await fx.overall.client
            .from("tasks")
            .select("id")
            .eq("location_id", fx.a),
        ),
      ).toEqual([]);
      expect(
        must(
          await fx.dual.client
            .from("task_notifications")
            .select("id", { count: "exact", head: true })
            .eq("location_id", fx.a),
        ),
      ).toBeNull();
      const hidden = await fx.dual.client
        .from("task_notifications")
        .select("id", { count: "exact" })
        .eq("location_id", fx.a);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
      expect(hidden.count).toBe(0);
      const own = must(
        await fx.admin
          .from("task_notifications")
          .select("id")
          .eq("recipient_profile_id", fx.dual.id)
          .eq("location_id", fx.a)
          .limit(1)
          .single(),
      )!;
      must(
        await fx.admin
          .from("task_notifications")
          .update({ read_at: null })
          .eq("id", own.id),
      );
      bind(fx.dual, fx.a, "staff");
      expect(
        await acknowledgeOpeningReminderAction({
          restaurantSlug: fx.org.slug,
          ids: [own.id],
        }),
      ).toEqual({ ok: true });
      expect(
        must(
          await fx.admin
            .from("task_notifications")
            .select("read_at")
            .eq("id", own.id)
            .single(),
        )!.read_at,
      ).not.toBeNull();
      const expectedContext = bind(fx.overall, fx.a, role);
      expect(
        await runTaskCommandAction({
          restaurantSlug: fx.org.slug,
          expectedContext,
          command: { type: "complete", taskId: taskA },
        }),
      ).toMatchObject({ ok: false, moduleUnavailable: true });
      must(
        await fx.admin
          .from("location_module_configs")
          .update({ is_enabled: true })
          .eq("location_id", fx.a)
          .eq("module_key", "tasks"),
      );
    }
  } finally {
    must(
      await fx.admin
        .from("module_enforcement_settings")
        .update({ mode: "staged", activation_reference: null })
        .eq("singleton", true),
    );
  }
  expect(
    must(
      await fx.admin
        .from("module_enforcement_settings")
        .select("mode")
        .single(),
    )!.mode,
  ).toBe("staged");
});

it("recurrence/checklist generation drops revoked workforce while historical assignments survive", async () => {
  const tpl = await template(fx.manager, fx.a, "Revocation generator");
  const rule = must(
    await fx.admin
      .from("task_recurrence_rules")
      .insert({
        organization_id: fx.org.id,
        location_id: fx.a,
        title: "Revoked future assignee",
        frequency: "daily",
        starts_on: today(),
        assignment_mode: "individual",
        created_by: fx.manager.id,
      })
      .select("id")
      .single(),
  )!;
  must(
    await fx.admin.from("task_recurrence_assignees").insert({
      organization_id: fx.org.id,
      rule_id: rule.id,
      profile_id: fx.dual.id,
    }),
  );
  const historical = must(
    await fx.admin
      .from("task_assignments")
      .select("task_id,profile_id")
      .eq("profile_id", fx.dual.id),
  )!;
  must(
    await fx.admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", fx.dual.id)
      .eq("location_id", fx.a),
  );
  try {
    must(
      await fx.manager.client.rpc("task_recurrence_generate", {
        p_organization_id: fx.org.id,
        p_location_id: fx.a,
      }),
    );
    const generated = must(
      await fx.admin
        .from("tasks")
        .select("id,assignment_mode,task_assignments(profile_id)")
        .eq("recurrence_rule_id", rule.id),
    )!;
    expect(generated.length).toBeGreaterThan(0);
    expect(
      generated.every(
        (t) =>
          t.assignment_mode === "anyone" && t.task_assignments.length === 0,
      ),
    ).toBe(true);
    const tomorrow = new Date(`${today()}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const ids = must(
      await fx.manager.client.rpc("checklist_generate_daily", {
        p_organization_id: fx.org.id,
        p_location_id: fx.a,
        p_service_date: tomorrow.toISOString().slice(0, 10),
        p_kind: "opening",
      }),
    )!;
    const instance = must(
      await fx.admin
        .from("checklist_instances")
        .select("id")
        .eq("template_id", tpl)
        .in("id", ids)
        .single(),
    )!;
    const items = must(
      await fx.admin
        .from("tasks")
        .select("assignment_mode,task_assignments(profile_id)")
        .eq("checklist_instance_id", instance.id),
    )!;
    expect(
      items.every(
        (t) =>
          t.assignment_mode === "anyone" && t.task_assignments.length === 0,
      ),
    ).toBe(true);
    const retained = must(
      await fx.admin
        .from("task_assignments")
        .select("task_id,profile_id")
        .eq("profile_id", fx.dual.id),
    )!;
    for (const row of historical) expect(retained).toContainEqual(row);
  } finally {
    must(
      await fx.admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", fx.dual.id)
        .eq("location_id", fx.a),
    );
  }
});

it("due instants use each location's IANA zone across DST; ordinary-task notifications stay suppressed", async () => {
  for (const [location, expected] of [
    [fx.a, "2027-03-14T14:00:00.000Z"],
    [fx.b, "2027-03-14T13:00:00.000Z"],
  ]) {
    const ids = must(
      await fx.manager.client.rpc("task_create", {
        ...taskArgs(fx.org.id, location, "DST due instant"),
        p_due_date: "2027-03-14",
        p_due_time: "09:00",
      }),
    )!;
    const row = must(
      await fx.admin.from("tasks").select("due_at").eq("id", ids[0]).single(),
    )!;
    expect(new Date(row.due_at!).toISOString()).toBe(expected);
    expect(
      must(
        await fx.manager.client.rpc("task_notifications_sweep", {
          p_organization_id: fx.org.id,
          p_location_id: location,
        }),
      ),
    ).toBe(0);
  }
});

it("Overall capability tiers cannot mint Owner authority or elevate staff from Assistant tier", async () => {
  must(
    await fx.admin
      .from("overall_roles")
      .upsert(
        { profile_id: fx.overall.id, role: "manager" },
        { onConflict: "profile_id" },
      ),
  );
  const before = must(
    await fx.admin.from("overall_roles").select("profile_id,role"),
  );
  expect(
    (
      await fx.overall.client
        .from("overall_roles")
        .insert({ profile_id: fx.unassigned.id, role: "owner" })
    ).error,
  ).not.toBeNull();
  expect(
    must(await fx.admin.from("overall_roles").select("profile_id,role")),
  ).toEqual(before);
  must(
    await fx.admin
      .from("overall_roles")
      .upsert(
        { profile_id: fx.overall.id, role: "assistant_manager" },
        { onConflict: "profile_id" },
      ),
  );
  const assignments = must(
    await fx.admin
      .from("location_memberships")
      .select("*")
      .eq("profile_id", fx.staff.id),
  );
  expect(
    (
      await fx.overall.client.rpc("apply_location_assignment_changes", {
        p_target_profile_id: fx.staff.id,
        p_changes: [{ locationId: fx.a, action: "assign", role: "manager" }],
      })
    ).error,
  ).not.toBeNull();
  expect(
    must(
      await fx.admin
        .from("location_memberships")
        .select("*")
        .eq("profile_id", fx.staff.id),
    ),
  ).toEqual(assignments);
});

it("workspace mark-all atomically clears more than 1000 own A notifications without touching B or another recipient", async () => {
  const notifications = [
    ...Array.from({ length: 1005 }, (_, index) => ({
      organization_id: fx.org.id,
      recipient_profile_id: fx.dual.id,
      type: "assigned" as const,
      task_id: taskA,
      title: `Bulk A ${index}`,
    })),
    {
      organization_id: fx.org.id,
      recipient_profile_id: fx.dual.id,
      type: "assigned" as const,
      task_id: taskB,
      title: "Bulk B stays unread",
    },
    {
      organization_id: fx.org.id,
      recipient_profile_id: fx.staff.id,
      type: "assigned" as const,
      task_id: taskA,
      title: "Other recipient stays unread",
    },
  ];
  must(await fx.admin.from("task_notifications").insert(notifications));
  const expectedContext = bind(fx.dual, fx.a, "staff");
  const result = await runTaskCommandAction({
    restaurantSlug: fx.org.slug,
    expectedContext,
    command: { type: "notificationsRead", ids: null },
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.data.unreadCount).toBe(0);
  const count = await fx.admin
    .from("task_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", fx.dual.id)
    .eq("location_id", fx.a)
    .is("read_at", null);
  expect(count.error).toBeNull();
  expect(count.count).toBe(0);
  const untouched = must(
    await fx.admin
      .from("task_notifications")
      .select("read_at")
      .in("title", ["Bulk B stays unread", "Other recipient stays unread"]),
  )!;
  expect(untouched).toEqual([{ read_at: null }, { read_at: null }]);
  await denied(() =>
    fx.staff.client.rpc("task_notifications_mark_location_read", {
      p_organization_id: fx.org.id,
      p_location_id: fx.b,
      p_ids: null,
    }),
  );
});
