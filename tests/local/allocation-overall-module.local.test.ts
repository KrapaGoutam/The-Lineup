import { afterAll, beforeAll, expect, it } from "vitest";
import { Board, createFixture, type Fixture } from "../real/support/harness";
import { CONFIGURABLE_MODULE_KEYS } from "@/features/modules/domain/module-registry";

// Run ONLY in the disposable composition with PR #305 installed. No hosted URL,
// no production activation; every explicit configuration belongs to this fixture.
let fx: Fixture;
let board: Board;
beforeAll(async () => {
  if (process.env.LINEUP_REAL_LOCAL !== "1")
    throw Error("Disposable local integration only");
  fx = await createFixture();
  const mode = await fx.admin
    .from("module_enforcement_settings")
    .select("mode")
    .single();
  expect(mode.error).toBeNull();
  expect(mode.data?.mode).toBe("staged");
  expect(
    (
      await fx.admin.from("location_module_configs").insert(
        [fx.locA, fx.locB, fx.otherLoc].flatMap((location_id) =>
          CONFIGURABLE_MODULE_KEYS.map((module_key) => ({
            location_id,
            module_key,
            is_enabled: module_key === "table_allocation",
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
            "owner-authorized-disposable-overall-contract-test",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  board = new Board(fx, fx.locA);
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
        .from("location_module_configs")
        .delete()
        .in("location_id", [fx.locA, fx.locB, fx.otherLoc])
    ).error,
  ).toBeNull();
  await fx.teardown();
  expect(
    (await fx.admin.from("module_enforcement_settings").select("mode").single())
      .data?.mode,
  ).toBe("staged");
  expect(
    (await fx.admin.from("location_module_configs").select("location_id")).data,
  ).toEqual([]);
  expect(
    (
      await fx.admin
        .from("organizations")
        .select("id")
        .in("id", [fx.orgId, fx.otherOrgId])
    ).data,
  ).toEqual([]);
});
for (const role of ["owner", "manager", "assistant_manager"] as const) {
  it(`Overall ${role}: enabled mutation succeeds; Disabled mutation and roster deny without state changes`, async () => {
    expect(
      (
        await fx.admin
          .from("overall_roles")
          .upsert(
            { profile_id: fx.outsider.id, role },
            { onConflict: "profile_id" },
          )
      ).error,
    ).toBeNull();
    expect(
      (
        await fx.admin
          .from("location_module_configs")
          .update({ is_enabled: true })
          .eq("location_id", fx.locA)
          .eq("module_key", "table_allocation")
      ).error,
    ).toBeNull();
    await board.reset();
    const member = (await board.addServer(fx.outsider, fx.server1)).memberId;
    expect((await board.assign(fx.outsider, member, "10")).error).toBeNull();
    expect((await board.claims()).get("10")).toBe(member);
    expect(
      (
        await fx.admin
          .from("location_module_configs")
          .update({ is_enabled: false })
          .eq("location_id", fx.locA)
          .eq("module_key", "table_allocation")
      ).error,
    ).toBeNull();
    const snapshot = async () =>
      Promise.all(
        [
          "service_sessions",
          "rotation_members",
          "rotation_rounds",
          "table_rotation_entries",
          "section_assignments",
          "board_events",
        ].map(async (table) => {
          const r = await fx.admin
            .from(table)
            .select("*")
            .eq("organization_id", fx.orgId)
            .order("id");
          expect(r.error).toBeNull();
          return r.data;
        }),
      );
    const before = await snapshot();
    const denied = await board.assign(fx.outsider, member, "11");
    expect(denied.error?.code).toBe("42501");
    expect(denied.error?.message).toMatch(/turned off|disabled/i);
    const roster = await fx.outsider.client.rpc("board_location_roster", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
    });
    expect(roster.error?.code).toBe("42501");
    expect(await snapshot()).toEqual(before);
  });
}
