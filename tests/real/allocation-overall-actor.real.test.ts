import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Board,
  createFixture,
  env,
  type Fixture,
  type Rpc,
  type TestUser,
} from "./support/harness";

const roles = ["owner", "manager", "assistant_manager"] as const;
let fx: Fixture;
let a: Board;
let b: Board;
let member: number;
const overall = new Map<(typeof roles)[number], TestUser>();
const graph = [
  "service_sessions",
  "rotation_members",
  "rotation_rounds",
  "table_rotation_entries",
  "section_assignments",
  "board_events",
];
async function snapshot() {
  return Promise.all(
    [...graph, "memberships", "organizations"].map(async (table) => {
      const q = fx.admin.from(table).select("*");
      const r = await (
        table === "organizations"
          ? q.in("id", [fx.orgId, fx.otherOrgId])
          : q.in("organization_id", [fx.orgId, fx.otherOrgId])
      ).order("id");
      expect(r.error).toBeNull();
      return r.data;
    }),
  );
}
async function denied(operation: () => PromiseLike<Rpc>) {
  const before = await snapshot();
  const r = await operation();
  expect(r.error).not.toBeNull();
  expect(r.error?.code).not.toMatch(/^PGRST/);
  expect(await snapshot()).toEqual(before);
}
async function lastEvent() {
  const r = await fx.admin
    .from("board_events")
    .select("*")
    .eq("service_session_id", a.sid)
    .order("id", { ascending: false })
    .limit(1)
    .single();
  expect(r.error).toBeNull();
  return r.data!;
}
async function add(
  user: TestUser,
  org = fx.orgId,
  loc = fx.locA,
  target = fx.server1.id,
) {
  return user.client.rpc("board_add_column", {
    p_organization_id: org,
    p_location_id: loc,
    p_service_date: a.date,
    p_server_profile_id: target,
  });
}
beforeAll(async () => {
  if (process.env.LINEUP_REAL_LOCAL !== "1")
    throw Error("Overall repair acceptance is disposable-local only");
  fx = await createFixture();
  a = new Board(fx, fx.locA);
  b = new Board(fx, fx.locB);
  for (const role of roles) {
    const email = `overall-${crypto.randomUUID()}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const r = await fx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(r.error).toBeNull();
    const id = r.data.user!.id;
    const name = `Overall ${role} acceptance`;
    expect(
      (await fx.admin.from("profiles").insert({ id, display_name: name }))
        .error,
    ).toBeNull();
    expect(
      (await fx.admin.from("overall_roles").insert({ profile_id: id, role }))
        .error,
    ).toBeNull();
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(
      (await client.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    overall.set(role, { id, name, email, password, client });
  }
});
beforeEach(async () => {
  expect(
    (
      await fx.admin
        .from("locations")
        .update({ active: true, archived_at: null })
        .in("id", [fx.locA, fx.locB])
    ).error,
  ).toBeNull();
  await a.reset();
  await b.reset();
  member = (await a.addServer(fx.owner, fx.server1)).memberId;
});
afterAll(async () => {
  if (!fx) return;
  await fx.teardown();
  for (const user of overall.values()) {
    expect(
      (await fx.admin.from("overall_roles").delete().eq("profile_id", user.id))
        .error,
    ).toBeNull();
    expect(
      (await fx.admin.from("profiles").delete().eq("id", user.id)).error,
    ).toBeNull();
    expect((await fx.admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    expect(
      (await fx.admin.auth.admin.getUserById(user.id)).data.user,
    ).toBeNull();
  }
  expect(
    (
      await fx.admin
        .from("organizations")
        .select("id")
        .in("id", [fx.orgId, fx.otherOrgId])
    ).data,
  ).toEqual([]);
});
describe("Overall actor repair through actual Auth JWTs", () => {
  it.each(roles)(
    "OA-01/02/03/04: %s opens floor, assigns and ends with profile attribution and no memberships",
    async (role) => {
      const user = overall.get(role)!;
      expect(
        (
          await fx.admin
            .from("memberships")
            .select("id")
            .eq("profile_id", user.id)
        ).data,
      ).toEqual([]);
      await a.reset();
      member = (await a.addServer(user, fx.server1)).memberId;
      const session = await fx.admin
        .from("service_sessions")
        .select("started_by, organization_id, location_id")
        .eq("id", a.sid)
        .single();
      expect(session.data).toEqual({
        started_by: user.id,
        organization_id: fx.orgId,
        location_id: fx.locA,
      });
      expect((await a.assign(user, member, "10")).error).toBeNull();
      expect((await a.claims()).get("10")).toBe(member);
      const event = await lastEvent();
      expect(event.actor_profile_id).toBe(user.id);
      expect(event.organization_id).toBe(fx.orgId);
      expect(event.event_type).toBe("assign");
      expect(Number.isNaN(Date.parse(event.created_at))).toBe(false);
      expect(event.payload.actor).toEqual({
        profile_id: user.id,
        display_name: user.name,
        overall_role: role,
        organization_roles: [],
        location_role: null,
        effective_role: role,
        location_id: fx.locA,
      });
      expect((await a.entries())[0].assigned_by).toBe(user.id);
      expect(
        (
          await a.rpc(user, "board_end_table", {
            p_service_session_id: a.sid,
            p_round_id: (await a.entries())[0].rotation_round_id,
            p_member_id: member,
          })
        ).error,
      ).toBeNull();
      expect((await a.entries())[0].ended_by).toBe(user.id);
      expect((await a.claims()).size).toBe(0);
      expect(
        (
          await fx.admin
            .from("memberships")
            .select("id")
            .eq("profile_id", user.id)
        ).data,
      ).toEqual([]);
    },
  );
  it("OA-05: undo/redo preserves original actor, attributes reversal and survives role revocation", async () => {
    const user = overall.get("manager")!;
    const assistant = overall.get("assistant_manager")!;
    expect((await a.assign(user, member, "11")).error).toBeNull();
    const original = await lastEvent();
    expect((await a.undo(assistant)).error).toBeNull();
    const undo = await lastEvent();
    expect(undo.actor_profile_id).toBe(assistant.id);
    expect(undo.payload.undone_event_id).toBe(original.id);
    expect((await a.claims()).size).toBe(0);
    expect((await a.redo(assistant)).error).toBeNull();
    const redo = await lastEvent();
    expect(redo.actor_profile_id).toBe(assistant.id);
    expect(redo.payload.redone_event_id).toBe(original.id);
    // Redo is a fresh assignment by its live actor; the original event is immutable.
    expect((await a.entries())[0].assigned_by).toBe(assistant.id);
    expect((await a.claims()).get("11")).toBe(member);
    expect(
      (await fx.admin.from("overall_roles").delete().eq("profile_id", user.id))
        .error,
    ).toBeNull();
    try {
      expect((await a.undo(fx.owner)).error).toBeNull();
      expect((await a.redo(fx.owner)).error).toBeNull();
      const old = await fx.server1.client
        .from("board_events")
        .select("actor_profile_id, payload")
        .eq("id", original.id)
        .single();
      expect(old.error).toBeNull();
      expect(old.data?.actor_profile_id).toBe(user.id);
      expect(old.data?.payload).toEqual(original.payload);
    } finally {
      expect(
        (
          await fx.admin
            .from("overall_roles")
            .insert({ profile_id: user.id, role: "manager" })
        ).error,
      ).toBeNull();
    }
  });
  it.each(roles)(
    "OA-06: %s operates a second organization without membership",
    async (role) => {
      const user = overall.get(role)!;
      expect(
        (
          await fx.admin.from("location_memberships").upsert(
            {
              location_id: fx.otherLoc,
              profile_id: fx.outsider.id,
              role: "staff",
              active: true,
            },
            { onConflict: "location_id,profile_id" },
          )
        ).error,
      ).toBeNull();
      const r = await add(user, fx.otherOrgId, fx.otherLoc, fx.outsider.id);
      expect(r.error).toBeNull();
      const event = await fx.admin
        .from("board_events")
        .select("actor_profile_id, payload")
        .eq("organization_id", fx.otherOrgId)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      expect(event.error).toBeNull();
      expect(event.data?.actor_profile_id).toBe(user.id);
      expect(event.data?.payload.actor.location_id).toBe(fx.otherLoc);
      expect(
        (
          await fx.admin
            .from("memberships")
            .select("id")
            .eq("profile_id", user.id)
        ).data,
      ).toEqual([]);
    },
  );
  it("OA-07/08: member manager and assigned server writes still mutate", async () => {
    expect((await a.assign(fx.manager, member, "10")).error).toBeNull();
    expect((await a.assign(fx.server1, member, "11")).error).toBeNull();
    expect((await a.claims()).size).toBe(2);
    expect((await lastEvent()).actor_profile_id).toBe(fx.server1.id);
  });
  it("OA-09: Overall Assistant Manager cannot manage location assignments", async () => {
    const before = await fx.admin
      .from("location_memberships")
      .select("*")
      .eq("profile_id", fx.server1.id);
    await denied(() =>
      overall
        .get("assistant_manager")!
        .client.rpc("apply_location_assignment_changes", {
          p_target_profile_id: fx.server1.id,
          p_changes: [{ locationId: fx.locA, action: "deactivate" }],
        }),
    );
    expect(
      (
        await fx.admin
          .from("location_memberships")
          .select("*")
          .eq("profile_id", fx.server1.id)
      ).data,
    ).toEqual(before.data);
  });
  it("OA-10: Overall Manager cannot provision an Owner-only organization", async () => {
    await denied(() =>
      overall.get("manager")!.client.rpc("provision_organization", {
        p_name: "Forbidden",
        p_slug: `denied-${crypto.randomUUID()}`,
      }),
    );
  });
  it("OA-11: server cannot forge an Overall role", async () => {
    await denied(() =>
      fx.server1.client
        .from("overall_roles")
        .insert({ profile_id: fx.server1.id, role: "owner" }),
    );
    expect(
      (
        await fx.admin
          .from("overall_roles")
          .select("id")
          .eq("profile_id", fx.server1.id)
      ).data,
    ).toEqual([]);
  });
  it("OA-12/13: unassigned staff and foreign member cannot create B", async () => {
    await denied(() => add(fx.server1, fx.orgId, fx.locB));
    await denied(() => add(fx.outsider));
  });
  it("OA-14: revoked tenant membership denies despite remaining assignment", async () => {
    expect(
      (
        await fx.admin
          .from("memberships")
          .update({ active: false })
          .eq("organization_id", fx.orgId)
          .eq("profile_id", fx.server1.id)
      ).error,
    ).toBeNull();
    try {
      await denied(() => a.assign(fx.server1, member, "10"));
    } finally {
      expect(
        (
          await fx.admin
            .from("memberships")
            .update({ active: true })
            .eq("organization_id", fx.orgId)
            .eq("profile_id", fx.server1.id)
        ).error,
      ).toBeNull();
    }
  });
  it.each([false, true])(
    "OA-15/16: Overall user cannot operate inactive / archived (archived=%s)",
    async (archived) => {
      expect(
        (
          await fx.admin
            .from("locations")
            .update({
              active: false,
              archived_at: archived ? new Date().toISOString() : null,
            })
            .eq("id", fx.locA)
        ).error,
      ).toBeNull();
      await denied(() => a.assign(overall.get("owner")!, member, "10"));
    },
  );
  it("OA-17: forged audit actor through raw event insert is denied", async () => {
    await denied(() =>
      overall.get("owner")!.client.from("board_events").insert({
        organization_id: fx.orgId,
        service_session_id: a.sid,
        actor_profile_id: fx.owner.id,
        event_type: "clear_board",
        payload: {},
      }),
    );
  });
  it("OA-18: forged organization/location and NULL location denied", async () => {
    await denied(() => add(overall.get("owner")!, fx.otherOrgId, fx.locA));
    await denied(() =>
      overall.get("owner")!.client.rpc("board_add_column", {
        p_organization_id: fx.orgId,
        p_location_id: null,
        p_service_date: a.date,
        p_server_profile_id: fx.server1.id,
      }),
    );
  });
  it("OA-19/20: foreign service-session IDs leave the entire graph unchanged", async () => {
    await b.addServer(fx.owner, fx.owner);
    await denied(() =>
      overall.get("owner")!.client.rpc("board_undo", {
        p_organization_id: fx.otherOrgId,
        p_service_session_id: a.sid,
      }),
    );
    const foreignRound = (await b.rounds())[0].id;
    await denied(() =>
      a.assign(overall.get("manager")!, member, "10", {
        roundId: foreignRound,
      }),
    );
  });
  it("OA-22: Overall role revocation immediately denies the same unrefreshed JWT", async () => {
    const user = overall.get("owner")!;
    expect((await a.assign(user, member, "10")).error).toBeNull();
    expect(
      (await fx.admin.from("overall_roles").delete().eq("profile_id", user.id))
        .error,
    ).toBeNull();
    try {
      await denied(() => a.assign(user, member, "11"));
    } finally {
      expect(
        (
          await fx.admin
            .from("overall_roles")
            .insert({ profile_id: user.id, role: "owner" })
        ).error,
      ).toBeNull();
    }
  });
  it("concurrent Overall events serialize and failed transactions produce no events", async () => {
    const before = (
      await fx.admin
        .from("board_events")
        .select("id")
        .eq("service_session_id", a.sid)
    ).data!;
    const results = await Promise.all(
      roles.map((role) =>
        a.rpc(overall.get(role)!, "board_add_row", {
          p_service_session_id: a.sid,
        }),
      ),
    );
    for (const r of results) expect(r.error).toBeNull();
    const events = await fx.admin
      .from("board_events")
      .select("id, actor_profile_id, payload")
      .eq("service_session_id", a.sid)
      .order("id");
    expect(events.data).toHaveLength(before.length + 3);
    expect(
      new Set(events.data!.slice(-3).map((e) => e.actor_profile_id)).size,
    ).toBe(3);
    await denied(() =>
      a.rpc(overall.get("owner")!, "board_clear_cell", {
        p_service_session_id: a.sid,
        p_round_id: -1,
        p_member_id: member,
      }),
    );
  });
  it("location roster exposes eligible participant names, never another location's roster", async () => {
    const r = await overall
      .get("assistant_manager")!
      .client.rpc("board_location_roster", {
        p_organization_id: fx.orgId,
        p_location_id: fx.locA,
      });
    expect(r.error).toBeNull();
    expect(r.data).toContainEqual(
      expect.objectContaining({
        profile_id: fx.server1.id,
        display_name: fx.server1.name,
      }),
    );
    await denied(() =>
      fx.server1.client.rpc("board_location_roster", {
        p_organization_id: fx.orgId,
        p_location_id: fx.locB,
      }),
    );
  });
});

// Historical actors can be outside the current workforce assignment and still need names.
it("legacy actor names remain available after a manager's location assignment is removed", async () => {
  expect(
    (await a.rpc(fx.manager, "board_add_row", { p_service_session_id: a.sid }))
      .error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("profile_id", fx.manager.id)
        .eq("location_id", fx.locA)
    ).error,
  ).toBeNull();
  try {
    const roster = await overall
      .get("owner")!
      .client.rpc("board_location_roster", {
        p_organization_id: fx.orgId,
        p_location_id: fx.locA,
      });
    expect(roster.error).toBeNull();
    expect(roster.data).toContainEqual(
      expect.objectContaining({
        profile_id: fx.manager.id,
        display_name: fx.manager.name,
      }),
    );
  } finally {
    expect(
      (
        await fx.admin.from("location_memberships").insert({
          profile_id: fx.manager.id,
          location_id: fx.locA,
          role: "manager",
          active: true,
        })
      ).error,
    ).toBeNull();
  }
});
