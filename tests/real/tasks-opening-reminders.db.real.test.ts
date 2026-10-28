/**
 * Tasks V1.1 T-4 -- Opening reminder engine, real-mode (hosted DEV only).
 * Scenario ids (TS-xxx) match docs/features/tasks-v1-1/TEST_MATRIX.md. Every
 * call goes through a synthetic user's own JWT over PostgREST, so grants, RLS and
 * the SECURITY DEFINER boundary apply exactly as they do for a browser session.
 *
 * The fixture location opens at 00:00 local, so the OPEN stage is always due and
 * the +15 / +30 stages are due depending on the real clock; assertions compute
 * which stages must exist from that clock rather than assuming a time of day.
 * Deterministic stage-window, DST and time-zone coverage lives in pgTAP 0042.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createFixture,
  todayInChicago,
  type Fixture,
  type TestUser,
} from "./support/harness";

let fx: Fixture;
let org: string;
let loc: string;

const STAGE_MINUTES: Record<string, number> = {
  open: 0,
  plus_15: 15,
  plus_30: 30,
};

function minutesSinceLocalMidnight(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

const dueStages = (minutes: number) =>
  Object.entries(STAGE_MINUTES)
    .filter(([, offset]) => offset <= minutes)
    .map(([stage]) => stage);

const sweep = (user: TestUser) =>
  user.client.rpc("task_opening_reminders_sweep", {
    p_organization_id: org,
    p_location_id: loc,
  });

type Reminder = {
  recipient_profile_id: string;
  dedupe_key: string;
  task_id: string | null;
  checklist_instance_id: string | null;
  payload: {
    stage: string;
    service_date: string;
    location_id: string;
    incomplete_count: number;
    incomplete_now: number;
  };
};

async function storedReminders(): Promise<Reminder[]> {
  const { data, error } = await fx.admin
    .from("task_notifications")
    .select(
      "recipient_profile_id, dedupe_key, task_id, checklist_instance_id, payload",
    )
    .eq("organization_id", org)
    .eq("type", "opening_reminder");
  if (error) throw new Error(error.message);
  return (data ?? []) as Reminder[];
}

beforeAll(async () => {
  fx = await createFixture();
  org = fx.orgId;
  loc = fx.locA;
  // The location opens at midnight local so OPEN is always due.
  const opened = await fx.admin
    .from("locations")
    .update({ opening_local: "00:00" })
    .eq("id", loc);
  if (opened.error) throw new Error(opened.error.message);
});

afterAll(async () => {
  if (!fx) return;
  // Same top-down teardown as the other Tasks suites (actor FKs, append-only events).
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

describe("Opening reminder engine (hosted)", () => {
  it("TS-038 anon, another organization and a foreign location are rejected", async () => {
    expect(
      (
        await fx.anon.rpc("task_opening_reminders_sweep", {
          p_organization_id: org,
          p_location_id: loc,
        })
      ).error,
    ).not.toBeNull();
    expect((await sweep(fx.outsider)).error).not.toBeNull();
    const foreignLocation = await fx.server1.client.rpc(
      "task_opening_reminders_sweep",
      { p_organization_id: org, p_location_id: fx.otherLoc },
    );
    expect(foreignLocation.error).not.toBeNull();
  });

  it("the clock-injectable evaluator and the writer are not reachable over the API", async () => {
    const run = await fx.manager.client.rpc("tasks_opening_reminders_run", {
      p_organization_id: org,
      p_location_id: loc,
      p_now: new Date().toISOString(),
    });
    expect(run.error).not.toBeNull();
    const forged = await fx.server1.client.from("task_notifications").insert({
      organization_id: org,
      recipient_profile_id: fx.server1.id,
      type: "opening_reminder",
      title: "forged",
    });
    expect(forged.error).not.toBeNull();
  });

  it("TS-021/026/034 five members sweep at the same instant: one reminder per eligible recipient and stage", async () => {
    // Manager starts today's Opening: one shared item and one for server1.
    const saved = await fx.manager.client.rpc("checklist_template_save", {
      p_organization_id: org,
      p_location_id: loc,
      p_template_id: null,
      p_kind: "opening",
      p_name: "Reminder Opening",
      p_days_of_week: [0, 1, 2, 3, 4, 5, 6],
      p_active: true,
      p_items: [
        { title: "Unlock entrance", assignment_mode: "anyone" },
        {
          title: "Set patio",
          assignment_mode: "individual",
          assignee_ids: [fx.server1.id],
        },
      ],
    });
    expect(saved.error).toBeNull();
    const generated = await fx.manager.client.rpc("checklist_generate_daily", {
      p_organization_id: org,
      p_location_id: loc,
      p_service_date: todayInChicago(),
      p_kind: "opening",
    });
    expect(generated.error).toBeNull();

    // server2 finishes the shared item BEFORE anyone sweeps: it was incomplete
    // at every stage instant, but is complete now.
    const { data: unlock } = await fx.admin
      .from("tasks")
      .select("id")
      .eq("organization_id", org)
      .eq("title", "Unlock entrance")
      .single();
    const done = await fx.server2.client.rpc("task_complete", {
      p_task_id: unlock!.id,
      p_note: null,
    });
    expect(done.error).toBeNull();

    const before = dueStages(minutesSinceLocalMidnight());
    const results = await Promise.all(
      [fx.owner, fx.manager, fx.server1, fx.server2, fx.server3].map(sweep),
    );
    const after = dueStages(minutesSinceLocalMidnight());
    for (const r of results) expect(r.error).toBeNull();
    const total = results.reduce((sum, r) => sum + Number(r.data ?? 0), 0);

    const rows = await storedReminders();
    // Every stored row was reported by exactly one caller: no double count.
    expect(rows.length).toBe(total);
    // Recipient-stage uniqueness under real concurrency.
    expect(
      new Set(rows.map((r) => `${r.recipient_profile_id}|${r.dedupe_key}`))
        .size,
    ).toBe(rows.length);

    // Owner, manager and server1 are eligible (server1 still has "Set patio");
    // server2 finished the only item they may work and server3 has none open.
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));
    expect(recipients).toEqual(
      new Set([fx.owner.id, fx.manager.id, fx.server1.id]),
    );
    const stagesFor = (id: string) =>
      rows
        .filter((r) => r.recipient_profile_id === id)
        .map((r) => r.payload.stage);
    for (const id of recipients) {
      const stages = stagesFor(id).sort();
      expect(stages.length).toBeGreaterThanOrEqual(before.length);
      expect(stages.length).toBeLessThanOrEqual(after.length);
      expect(stages).toEqual([...new Set(stages)]);
      expect(stages).toContain("open");
    }
    for (const row of rows) {
      expect(row.payload.service_date).toBe(todayInChicago());
      expect(row.payload.location_id).toBe(loc);
      expect(row.task_id).toBeNull();
      expect(row.checklist_instance_id).toBeNull();
    }
  });

  it("TS-033/039 counts follow each recipient's scope and the completion that happened after the stage", async () => {
    const rows = await storedReminders();
    const own = (id: string) =>
      rows.filter((r) => r.recipient_profile_id === id);
    // Management: both items were open at every stage instant; one is open now.
    for (const id of [fx.owner.id, fx.manager.id]) {
      for (const r of own(id)) {
        expect(r.payload.incomplete_count).toBe(2);
        expect(r.payload.incomplete_now).toBe(1);
      }
    }
    // server1: the shared item and their own patio item, same history.
    for (const r of own(fx.server1.id)) {
      expect(r.payload.incomplete_count).toBe(2);
      expect(r.payload.incomplete_now).toBe(1);
    }
    expect(own(fx.server2.id)).toHaveLength(0);
    expect(own(fx.server3.id)).toHaveLength(0);
  });

  it("TS-033/037 each person reads only their own reminders through RLS; no one sees another person's or organization's", async () => {
    const read = async (user: TestUser) =>
      (
        await user.client
          .from("task_notifications")
          .select("recipient_profile_id, type, title, body, payload")
          .eq("type", "opening_reminder")
      ).data ?? [];

    const ownerRows = await read(fx.owner);
    expect(ownerRows.length).toBeGreaterThan(0);
    expect(ownerRows.every((r) => r.recipient_profile_id === fx.owner.id)).toBe(
      true,
    );

    const server1Rows = await read(fx.server1);
    expect(server1Rows.length).toBeGreaterThan(0);
    expect(
      server1Rows.every((r) => r.recipient_profile_id === fx.server1.id),
    ).toBe(true);
    // Nothing a staff member can read names a coworker or a task title.
    const text = JSON.stringify(server1Rows);
    for (const name of [
      fx.server2.name,
      fx.server3.name,
      fx.owner.name,
      "Unlock",
      "patio",
    ]) {
      expect(text).not.toContain(name);
    }

    expect(await read(fx.server2)).toHaveLength(0);
    expect(await read(fx.server3)).toHaveLength(0);
    expect(await read(fx.outsider)).toHaveLength(0);
  });

  it("TS-026/028 repeated, parallel and cross-member calls store nothing more", async () => {
    const before = (await storedReminders()).length;
    const again = await Promise.all(
      [
        fx.owner,
        fx.manager,
        fx.server1,
        fx.server2,
        fx.server3,
        fx.owner,
        fx.server1,
      ].map(sweep),
    );
    for (const r of again) {
      expect(r.error).toBeNull();
      expect(r.data).toBe(0);
    }
    expect((await storedReminders()).length).toBe(before);
  });

  it("completing the remaining work stops further reminders and leaves the audit trail intact", async () => {
    const { data: patio } = await fx.admin
      .from("tasks")
      .select("id")
      .eq("organization_id", org)
      .eq("title", "Set patio")
      .single();
    const before = (await storedReminders()).length;
    expect(
      (
        await fx.manager.client.rpc("task_complete", {
          p_task_id: patio!.id,
          p_note: null,
        })
      ).error,
    ).toBeNull();
    for (const user of [fx.owner, fx.server1]) {
      const swept = await sweep(user);
      expect(swept.error).toBeNull();
      expect(swept.data).toBe(0);
    }
    expect((await storedReminders()).length).toBe(before);

    // The engine wrote no audit events of its own: only real lifecycle events exist.
    const { data: events } = await fx.admin
      .from("task_events")
      .select("event_type")
      .eq("organization_id", org);
    const kinds = new Set((events ?? []).map((e) => e.event_type as string));
    expect([...kinds].sort()).toEqual(["checklist_generated", "completed"]);
  });
});
