import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Board,
  createFixture,
  type Fixture,
  type Rpc,
  type TestUser,
} from "./support/harness";

let fx: Fixture;
let a: Board;
let b: Board;
let member: number;
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
    graph.map(async (table) => {
      const result = await fx.admin
        .from(table)
        .select("*")
        .in("organization_id", [fx.orgId, fx.otherOrgId])
        .order("id");
      expect(result.error).toBeNull();
      return result.data;
    }),
  );
}
async function deniedUnchanged(
  operation: () => PromiseLike<Rpc>,
  pattern?: RegExp,
) {
  const before = await snapshot();
  const result = await operation();
  expect(result.error).not.toBeNull();
  // A missing RPC/signature is never evidence of an authorization denial.
  expect(result.error?.code).not.toMatch(/^PGRST/);
  if (pattern) expect(result.error?.message).toMatch(pattern);
  expect(await snapshot()).toEqual(before);
}
async function assignment(user: TestUser, location = fx.locA, active = true) {
  const result = await fx.admin
    .from("location_memberships")
    .upsert(
      { location_id: location, profile_id: user.id, active },
      { onConflict: "location_id,profile_id" },
    );
  expect(result.error).toBeNull();
}
async function removeAssignments() {
  const result = await fx.admin
    .from("location_memberships")
    .delete()
    .in("location_id", [fx.locA, fx.locB]);
  expect(result.error).toBeNull();
}
async function readHidden(user: TestUser, location: string, session: number) {
  for (const table of [
    "service_sessions",
    "dining_tables",
    "dining_areas",
    "section_assignments",
    ...graph.slice(1, 4),
    "board_events",
  ]) {
    const column = [
      "service_sessions",
      "dining_tables",
      "dining_areas",
      "section_assignments",
    ].includes(table)
      ? "location_id"
      : "service_session_id";
    const result = await user.client
      .from(table)
      .select("id")
      .eq(column, column === "location_id" ? location : session);
    expect(result.error, table).toBeNull();
    expect(result.data, table).toEqual([]);
  }
}
async function add(user: TestUser, location: string, target = user.id) {
  return user.client.rpc("board_add_column", {
    p_organization_id: fx.orgId,
    p_location_id: location,
    p_service_date: a.date,
    p_server_profile_id: target,
  });
}

beforeAll(async () => {
  fx = await createFixture();
  a = new Board(fx, fx.locA);
  b = new Board(fx, fx.locB);
});
afterAll(async () => {
  if (!fx) return;
  await fx.teardown();
  for (const table of ["organizations", "profiles"]) {
    const ids =
      table === "organizations"
        ? [fx.orgId, fx.otherOrgId]
        : [
            fx.owner,
            fx.manager,
            fx.server1,
            fx.server2,
            fx.server3,
            fx.outsider,
          ].map((u) => u.id);
    const result = await fx.admin.from(table).select("id").in("id", ids);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  }
  for (const user of [
    fx.owner,
    fx.manager,
    fx.server1,
    fx.server2,
    fx.server3,
    fx.outsider,
  ]) {
    const result = await fx.admin.auth.admin.getUserById(user.id);
    expect(result.data.user).toBeNull();
  }
});
beforeEach(async () => {
  await fx.admin
    .from("locations")
    .update({ active: true, archived_at: null })
    .in("id", [fx.locA, fx.locB]);
  await removeAssignments();
  for (const user of [fx.owner, fx.manager]) {
    await assignment(user);
    await assignment(user, fx.locB);
  }
  await assignment(fx.server1);
  await assignment(fx.server2);
  await assignment(fx.server3);
  await a.reset();
  await b.reset();
  member = (await a.addServer(fx.owner, fx.server1)).memberId;
});

describe("allocation location authorization through real JWTs", () => {
  it("AL-01/02/04: assigned staff can read and assign on A", async () => {
    expect((await a.assign(fx.server1, member, "10")).error).toBeNull();
    const result = await fx.server1.client
      .from("service_sessions")
      .select("location_id")
      .eq("id", a.sid);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ location_id: fx.locA }]);
    expect((await a.claims()).get("10")).toBe(member);
  });
  it("AL-03/28: active org manager can operate B with eligible target", async () => {
    await assignment(fx.server2, fx.locB);
    const other = (await b.addServer(fx.manager, fx.server2)).memberId;
    expect((await b.assign(fx.owner, other, "1")).error).toBeNull();
  });
  it("AL-08: undo/redo remain scoped", async () => {
    expect((await a.assign(fx.server1, member, "15")).error).toBeNull();
    expect((await a.undo(fx.server1)).error).toBeNull();
    expect((await a.claims()).has("15")).toBe(false);
    expect((await a.redo(fx.server1)).error).toBeNull();
    expect((await a.claims()).get("15")).toBe(member);
  });
  it("AL-09: anonymous RPC fails with no mutation", async () => {
    await deniedUnchanged(() =>
      fx.anon.rpc("board_undo", {
        p_organization_id: fx.orgId,
        p_service_session_id: a.sid,
      }),
    );
  });
  it("AL-10: foreign organization cannot read or mutate A", async () => {
    await deniedUnchanged(() => add(fx.outsider, fx.locA), /active floor/);
    await readHidden(fx.outsider, fx.locA, a.sid);
  });
  it("AL-11/23/24/26: A-only staff cannot read or operate B", async () => {
    const other = (await b.addServer(fx.owner, fx.owner)).memberId;
    await deniedUnchanged(
      () => b.assign(fx.server1, other, "1"),
      /active floor/,
    );
    await readHidden(fx.server1, fx.locB, b.sid);
    await deniedUnchanged(() => b.undo(fx.server1), /active floor/);
    await deniedUnchanged(() => b.redo(fx.server1), /active floor/);
  });
  it("AL-12: inactive assignment cannot regain legacy access", async () => {
    await assignment(fx.server1, fx.locA, false);
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "11"),
      /active floor/,
    );
    await readHidden(fx.server1, fx.locA, a.sid);
  });
  it("AL-14: inactive location refuses real board_assign", async () => {
    expect(
      (
        await fx.admin
          .from("locations")
          .update({ active: false })
          .eq("id", fx.locA)
      ).error,
    ).toBeNull();
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "12"),
      /active floor/,
    );
    await readHidden(fx.server1, fx.locA, a.sid);
  });
  it("AL-15: archived location refuses real board_assign", async () => {
    expect(
      (
        await fx.admin
          .from("locations")
          .update({ active: false, archived_at: new Date().toISOString() })
          .eq("id", fx.locA)
      ).error,
    ).toBeNull();
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "12"),
      /active floor/,
    );
  });
  it("AL-16/17: foreign round cannot be assigned through authorized A", async () => {
    await b.addServer(fx.owner, fx.owner);
    const foreignRound = (await b.rounds())[0].id;
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "1", { roundId: foreignRound }),
      /row.*board|round.*session/i,
    );
  });
  it("AL-18: shared labels resolve only to A physical tables", async () => {
    expect((await a.assign(fx.server1, member, "10")).error).toBeNull();
    const result = await fx.admin
      .from("section_assignments")
      .select("dining_table_id, location_id")
      .eq("service_session_id", a.sid)
      .is("released_at", null);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { dining_table_id: fx.tablesA.get("10"), location_id: fx.locA },
    ]);
    expect(result.data?.[0].dining_table_id).not.toBe(fx.tablesB.get("10"));
  });
  it("AL-22: ineligible target does not create a new B session", async () => {
    await deniedUnchanged(
      () => add(fx.owner, fx.locB, fx.server1.id),
      /not assigned/,
    );
  });
  it("AL-25: direct client writes to rotation graph are denied", async () => {
    const before = await snapshot();
    const result = await fx.server1.client.from("rotation_rounds").insert({
      organization_id: fx.orgId,
      service_session_id: a.sid,
      sequence: 90,
    });
    expect(result.error?.code).toBe("42501");
    expect(await snapshot()).toEqual(before);
  });
  it("Audit A: sole active location and zero assignment rows retains bounded compatibility", async () => {
    await removeAssignments();
    expect(
      (
        await fx.admin
          .from("locations")
          .update({ active: false })
          .eq("id", fx.locB)
      ).error,
    ).toBeNull();
    expect((await a.assign(fx.server1, member, "10")).error).toBeNull();
  });
  it("Audit B: two active locations and zero assignments fail closed for reads and RPC", async () => {
    await b.addServer(fx.owner, fx.owner);
    await removeAssignments();
    await readHidden(fx.server1, fx.locA, a.sid);
    await readHidden(fx.server1, fx.locB, b.sid);
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "10"),
      /active floor/,
    );
    await deniedUnchanged(() => add(fx.server1, fx.locB), /active floor/);
    await deniedUnchanged(
      () => add(fx.owner, fx.locB, fx.server1.id),
      /active floor/,
    );
  });
  it("Audit D: revoked row blocks fallback even with a sole active location", async () => {
    await removeAssignments();
    await assignment(fx.server1, fx.locA, false);
    await fx.admin
      .from("locations")
      .update({ active: false })
      .eq("id", fx.locB);
    await deniedUnchanged(
      () => a.assign(fx.server1, member, "10"),
      /active floor/,
    );
  });
  it("Audit E: public operation with NULL location cannot create state", async () => {
    await deniedUnchanged(() =>
      fx.owner.client.rpc("board_add_column", {
        p_organization_id: fx.orgId,
        p_location_id: null,
        p_service_date: a.date,
        p_server_profile_id: fx.owner.id,
      }),
    );
  });
  it("Audit creator: inactive organization creator has no board authority", async () => {
    await fx.admin
      .from("memberships")
      .update({ active: false })
      .eq("organization_id", fx.orgId)
      .eq("profile_id", fx.owner.id);
    try {
      await deniedUnchanged(
        () => a.assign(fx.owner, member, "10"),
        /active floor/,
      );
      await readHidden(fx.owner, fx.locA, a.sid);
    } finally {
      await fx.admin
        .from("memberships")
        .update({ active: true })
        .eq("organization_id", fx.orgId)
        .eq("profile_id", fx.owner.id);
    }
  });
  it.each(["owner", "manager", "assistant_manager"])(
    "known contract limit: Overall %s reads A but actor FK prevents a no-membership write",
    async (role) => {
      expect(
        (
          await fx.admin
            .from("overall_roles")
            .insert({ profile_id: fx.outsider.id, role })
        ).error,
      ).toBeNull();
      try {
        const read = await fx.outsider.client
          .from("service_sessions")
          .select("id")
          .eq("id", a.sid);
        expect(read.error).toBeNull();
        expect(read.data).toEqual([{ id: a.sid }]);
        await deniedUnchanged(async () => {
          const result = await add(fx.outsider, fx.locA, fx.server1.id);
          expect(result.error?.code).toBe("23503");
          return result;
        });
      } finally {
        expect(
          (
            await fx.admin
              .from("overall_roles")
              .delete()
              .eq("profile_id", fx.outsider.id)
          ).error,
        ).toBeNull();
      }
    },
  );
  it.each(["owner", "manager"] as const)(
    "scoped %s has no blanket access to unassigned B",
    async (key) => {
      await assignment(fx.server2, fx.locB);
      await b.addServer(fx.owner, fx.server2);
      const user = fx[key];
      expect(
        (
          await fx.admin
            .from("location_memberships")
            .delete()
            .eq("profile_id", user.id)
            .eq("location_id", fx.locB)
        ).error,
      ).toBeNull();
      await readHidden(user, fx.locB, b.sid);
      await deniedUnchanged(
        () => add(user, fx.locB, fx.server1.id),
        /active floor/,
      );
    },
  );
});
