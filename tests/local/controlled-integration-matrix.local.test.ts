import { afterAll, beforeAll, expect, it } from "vitest";
import {
  Board,
  createFixture,
  todayInChicago,
  type Fixture,
  type TestUser,
} from "../real/support/harness";
import { CONFIGURABLE_MODULE_KEYS } from "@/features/modules/domain/module-registry";

let fx: Fixture;
let missingLocation: string;
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
        .eq("organization_id", fx.orgId)
        .order("id");
      expect(result.error).toBeNull();
      return result.data;
    }),
  );
}
async function attempt(actor: TestUser, location: string) {
  return actor.client.rpc("board_add_column", {
    p_organization_id: fx.orgId,
    p_location_id: location,
    p_service_date: todayInChicago(),
    p_server_profile_id: fx.server2.id,
  });
}
beforeAll(async () => {
  if (process.env.LINEUP_REAL_LOCAL !== "1")
    throw Error("Disposable local integration only");
  fx = await createFixture();
  const location = await fx.admin
    .from("locations")
    .insert({
      organization_id: fx.orgId,
      name: "Integration missing configuration",
      time_zone: "America/Chicago",
      address: {},
    })
    .select("id")
    .single();
  expect(location.error).toBeNull();
  missingLocation = location.data!.id;
  const assigned = await fx.admin.from("location_memberships").insert(
    [fx.locB, missingLocation].map((location_id) => ({
      location_id,
      profile_id: fx.server2.id,
      role: "staff",
    })),
  );
  expect(assigned.error).toBeNull();
  expect(
    (await fx.admin.from("module_enforcement_settings").select("mode").single())
      .data?.mode,
  ).toBe("staged");
});
afterAll(async () => {
  if (!fx) return;
  expect(
    (
      await fx.admin
        .from("module_enforcement_settings")
        .update({ mode: "staged", activation_reference: null })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("overall_roles")
        .delete()
        .eq("profile_id", fx.outsider.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("location_id", missingLocation)
    ).error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("location_module_configs")
        .delete()
        .in("location_id", [fx.locA, fx.locB, fx.otherLoc, missingLocation])
    ).error,
  ).toBeNull();
  await fx.teardown();
});
it("STAGED permits missing configuration without granting unassigned callers authority", async () => {
  const allowed = await attempt(fx.owner, fx.locB);
  expect(allowed.error).toBeNull();
  const before = await snapshot();
  expect((await attempt(fx.server1, fx.locB)).error?.code).toBe("42501");
  expect(await snapshot()).toEqual(before);
  await new Board(fx, fx.locB).reset();
});
it("ACTIVE has A Enabled, B Disabled, C Missing with no guessed defaults", async () => {
  expect(
    (
      await fx.admin.from("location_module_configs").insert(
        [fx.locA, fx.locB, fx.otherLoc, missingLocation].flatMap(
          (location_id) =>
            CONFIGURABLE_MODULE_KEYS.map((module_key) => ({
              location_id,
              module_key,
              is_enabled:
                location_id === fx.locA && module_key === "table_allocation",
            })),
        ),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("module_enforcement_settings")
        .update({
          mode: "active",
          activation_reference:
            "owner-authorized-isolated-integration-validation",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  expect(
    (
      await fx.admin
        .from("location_module_configs")
        .delete()
        .eq("location_id", missingLocation)
    ).error,
  ).toBeNull();
});
const scenarios = [
  "Overall Owner",
  "Overall Manager",
  "Overall Assistant Manager",
  "Organization Owner",
  "Organization GM",
  "Location Manager",
  "Location Assistant Manager",
  "Location Staff",
  "Unassigned employee",
  "Revoked employee",
  "Foreign-organization employee",
] as const;
for (const scenario of scenarios) {
  it(`${scenario}: role authority AND module availability; denied graph is unchanged`, async () => {
    const board = new Board(fx, fx.locA);
    await board.reset();
    // Staff operate an existing floor; opening the first floor retains its separate role rule.
    await board.addServer(fx.owner, fx.server3);
    expect(
      (
        await fx.admin
          .from("overall_roles")
          .delete()
          .eq("profile_id", fx.outsider.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await fx.admin.from("location_memberships").upsert(
          {
            active: true,
            role: "staff",
            profile_id: fx.server1.id,
            location_id: fx.locA,
          },
          { onConflict: "location_id,profile_id" },
        )
      ).error,
    ).toBeNull();
    let actor: TestUser;
    let allowed = true;
    if (scenario.startsWith("Overall")) {
      const role =
        scenario === "Overall Owner"
          ? "owner"
          : scenario === "Overall Manager"
            ? "manager"
            : "assistant_manager";
      expect(
        (
          await fx.admin
            .from("overall_roles")
            .insert({ profile_id: fx.outsider.id, role })
        ).error,
      ).toBeNull();
      actor = fx.outsider;
    } else if (scenario === "Organization Owner") actor = fx.owner;
    else if (scenario === "Organization GM") actor = fx.manager;
    else if (scenario === "Foreign-organization employee") {
      actor = fx.outsider;
      allowed = false;
    } else {
      actor = fx.server1;
      const inactive =
        scenario === "Unassigned employee" || scenario === "Revoked employee";
      allowed = !inactive;
      if (scenario === "Unassigned employee") {
        expect(
          (
            await fx.admin
              .from("location_memberships")
              .delete()
              .eq("profile_id", actor.id)
              .eq("location_id", fx.locA)
          ).error,
        ).toBeNull();
      }
      const role =
        scenario === "Location Manager"
          ? "manager"
          : scenario === "Location Assistant Manager"
            ? "assistant_manager"
            : "staff";
      expect(
        (
          await fx.admin
            .from("location_memberships")
            .update({ active: !inactive, role })
            .eq("profile_id", actor.id)
            .eq("location_id", fx.locA)
        ).error,
      ).toBeNull();
    }
    const before = await snapshot();
    const enabled = await attempt(actor, fx.locA);
    if (allowed) {
      expect(enabled.error).toBeNull();
      const events = await fx.admin
        .from("board_events")
        .select("actor_profile_id")
        .eq("organization_id", fx.orgId)
        .order("id", { ascending: false })
        .limit(1);
      expect(events.error).toBeNull();
      expect(events.data!.length).toBeGreaterThan(0);
      expect(
        events.data!.every((row) => row.actor_profile_id === actor.id),
      ).toBe(true);
    } else {
      expect(enabled.error?.code).toBe("42501");
      expect(await snapshot()).toEqual(before);
    }
    for (const location of [fx.locB, missingLocation]) {
      const unchanged = await snapshot();
      expect((await attempt(actor, location)).error?.code).toBe("42501");
      expect(await snapshot()).toEqual(unchanged);
    }
  });
}
