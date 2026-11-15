import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CONFIGURABLE_MODULE_KEYS } from "@/features/modules/domain/module-registry";
import {
  createTipsFixture,
  must,
  type TipsFixture,
  type TipsTestUser,
} from "./support/tips-fixture";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

let fx: TipsFixture;
const request = vi.hoisted(() => ({
  client: null as unknown,
  actor: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));

vi.mock("@/features/tips/data/tips-actor", () => ({
  getTipsActor: async () => request.actor,
}));

import {
  addTipIntervalAction,
  finalizeTipsAction,
  reopenTipsAction,
} from "@/features/tips/actions/tips-actions";

const today = (zone = "America/Chicago") =>
  zonedWallTimeFromInstant(new Date(), zone).date;

function bind(user: TipsTestUser, location: string, designation = "manager") {
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

beforeAll(async () => {
  fx = await createTipsFixture();
});

afterAll(async () => {
  if (fx) await fx.teardown();
});

it("Staff at Location A can view own intervals in Loc A, but is denied Loc B and cannot mutate", async () => {
  // First, manager creates an interval at Loc A with staff and dual
  const expA = bind(fx.manager, fx.a, "manager");
  const addResult = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    start: "11:00",
    end: "14:00",
    amountCents: 6000,
    participantIds: [fx.staff.id, fx.dual.id],
  });
  expect(addResult.ok).toBe(true);

  // Staff A reads day data at Loc A directly via client RPC
  const staffClient = fx.staff.client;
  const staffDayData = must(
    await staffClient.rpc("tips_get_day_data", {
      p_organization_id: fx.org.id,
      p_location_id: fx.a,
      p_service_date: today("America/Chicago"),
    }),
  );

  expect(staffDayData).not.toBeNull();
  expect(staffDayData!.intervals).toHaveLength(1);

  // Staff A attempts to read day data at Loc B (denied)
  const staffLocB = await staffClient.rpc("tips_get_day_data", {
    p_organization_id: fx.org.id,
    p_location_id: fx.b,
    p_service_date: today("America/New_York"),
  });
  expect(staffLocB.error).not.toBeNull();
  expect(staffLocB.error?.code).toBe("42501");

  // Staff A cannot mutate / add interval
  bind(fx.staff, fx.a, "staff");
  const mutateAttempt = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: {
      profileId: fx.staff.id,
      organizationId: fx.org.id,
      locationId: fx.a,
    },
    start: "15:00",
    end: "18:00",
    amountCents: 2000,
    participantIds: [fx.staff.id],
  });
  expect(mutateAttempt.ok).toBe(false);
  if (!mutateAttempt.ok) {
    expect(mutateAttempt.error).toContain("Only an owner, manager");
  }
});

it("Dual assigned staff has separate visibility in Location A and Location B", async () => {
  // Manager adds interval in Loc B with dual
  const expB = bind(fx.manager, fx.b, "manager");
  const addB = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expB,
    start: "12:00",
    end: "16:00",
    amountCents: 5000,
    participantIds: [fx.dual.id],
  });
  expect(addB.ok).toBe(true);

  const dualClient = fx.dual.client;
  // Dual can access Loc A
  const dualA = must(
    await dualClient.rpc("tips_get_day_data", {
      p_organization_id: fx.org.id,
      p_location_id: fx.a,
      p_service_date: today("America/Chicago"),
    }),
  );
  expect(dualA).not.toBeNull();
  expect(dualA!.intervals).toHaveLength(1);

  // Dual can access Loc B
  const dualB = must(
    await dualClient.rpc("tips_get_day_data", {
      p_organization_id: fx.org.id,
      p_location_id: fx.b,
      p_service_date: today("America/New_York"),
    }),
  );
  expect(dualB).not.toBeNull();
  expect(dualB!.intervals).toHaveLength(1);
});

it("Manager cannot add participants who are not workforce-eligible at the target location", async () => {
  const expA = bind(fx.manager, fx.a, "manager");
  // fx.foreign is in other org, not eligible at Loc A
  const addForeign = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    start: "18:00",
    end: "20:00",
    amountCents: 3000,
    participantIds: [fx.foreign.id],
  });
  expect(addForeign.ok).toBe(false);
  if (!addForeign.ok) {
    expect(addForeign.error).toContain("not eligible");
  }
});

it("Manager can finalize and reopen a tip pool with authentic audit logging", async () => {
  const expA = bind(fx.manager, fx.a, "manager");
  const pools = must(
    await fx.admin
      .from("tip_pools")
      .select("id, status")
      .eq("location_id", fx.a)
      .eq("service_date", today("America/Chicago")),
  );
  expect(pools).not.toBeNull();
  const poolId = pools![0].id;

  // Finalize
  const finResult = await finalizeTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    tipPoolId: poolId,
  });
  expect(finResult.ok).toBe(true);

  // Verify finalized in DB
  const finalizedPool = must(
    await fx.admin
      .from("tip_pools")
      .select("status, finalized_at, finalized_by")
      .eq("id", poolId)
      .single(),
  );
  expect(finalizedPool).not.toBeNull();
  expect(finalizedPool!.status).toBe("finalized");
  expect(finalizedPool!.finalized_by).toBe(fx.manager.id);
  expect(finalizedPool!.finalized_at).not.toBeNull();

  // Verify cannot add interval while finalized
  const addWhileFinal = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    start: "20:00",
    end: "22:00",
    amountCents: 2000,
    participantIds: [fx.staff.id],
  });
  expect(addWhileFinal.ok).toBe(false);
  if (!addWhileFinal.ok) {
    expect(addWhileFinal.error).toContain("finalized");
  }

  // Reopen with too-short reason fails
  const shortReopen = await reopenTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    tipPoolId: poolId,
    reason: "no",
  });
  expect(shortReopen.ok).toBe(false);

  // Reopen with valid reason succeeds
  const reopenResult = await reopenTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    tipPoolId: poolId,
    reason: "Late cash tip adjustment",
  });
  expect(reopenResult.ok).toBe(true);

  const reopenedPool = must(
    await fx.admin
      .from("tip_pools")
      .select("status, finalized_at, finalized_by")
      .eq("id", poolId)
      .single(),
  );
  expect(reopenedPool).not.toBeNull();
  expect(reopenedPool!.status).toBe("draft");
  expect(reopenedPool!.finalized_at).toBeNull();
  expect(reopenedPool!.finalized_by).toBeNull();

  // Audit events recorded
  const auditEvents = must(
    await fx.admin
      .from("audit_events")
      .select("action, reason, actor_profile_id")
      .eq("entity_id", String(poolId)),
  );
  expect(auditEvents).not.toBeNull();
  expect(auditEvents!.map((e) => e.action)).toContain("finalized");
  expect(auditEvents!.map((e) => e.action)).toContain("reopened");
  expect(auditEvents!.find((e) => e.action === "reopened")?.reason).toBe(
    "Late cash tip adjustment",
  );
});

it("Overall administrator can operate Tips without local tenant membership", async () => {
  // Give fx.overall an overall 'owner' role
  must(
    await fx.admin.from("overall_roles").upsert(
      {
        profile_id: fx.overall.id,
        role: "owner",
      },
      { onConflict: "profile_id" },
    ),
  );

  request.client = fx.overall.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: {
      organizationId: fx.org.id,
      locationId: fx.a,
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: fx.overall.id,
      name: fx.overall.name,
      designation: "owner",
    },
  };

  const expA = {
    profileId: fx.overall.id,
    organizationId: fx.org.id,
    locationId: fx.a,
  };

  // Overall owner adds interval at Loc A
  const addResult = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    start: "21:00",
    end: "23:00",
    amountCents: 4500,
    participantIds: [fx.staff.id],
  });
  expect(addResult.ok).toBe(true);

  const pools = must(
    await fx.admin
      .from("tip_pools")
      .select("id")
      .eq("location_id", fx.a)
      .eq("service_date", today("America/Chicago")),
  );
  expect(pools).not.toBeNull();
  const poolId = pools![0].id;

  // Overall owner finalizes pool
  const finResult = await finalizeTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    tipPoolId: poolId,
  });
  expect(finResult.ok).toBe(true);

  // Attribution verifies real profile ID without fake membership row
  const pool = must(
    await fx.admin
      .from("tip_pools")
      .select("finalized_by")
      .eq("id", poolId)
      .single(),
  );
  expect(pool).not.toBeNull();
  expect(pool!.finalized_by).toBe(fx.overall.id);

  // Overall owner reopens pool
  const reopenResult = await reopenTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    tipPoolId: poolId,
    reason: "Overall audit correction",
  });
  expect(reopenResult.ok).toBe(true);
});

it("Stale workspace expectation is refused before mutation", async () => {
  bind(fx.manager, fx.a, "manager");
  // Client claims Loc B while actor is at Loc A
  const staleExp = {
    profileId: fx.manager.id,
    organizationId: fx.org.id,
    locationId: fx.b,
  };

  const result = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: staleExp,
    start: "10:00",
    end: "11:00",
    amountCents: 1000,
    participantIds: [fx.staff.id],
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.contextStale).toBe(true);
  }
});

it("Revoked location assignment immediately denies access", async () => {
  // Revoke staff's assignment at Loc A
  must(
    await fx.admin
      .from("location_memberships")
      .delete()
      .eq("location_id", fx.a)
      .eq("profile_id", fx.staff.id),
  );

  const staffClient = fx.staff.client;
  const result = await staffClient.rpc("tips_get_day_data", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: today("America/Chicago"),
  });
  expect(result.error).not.toBeNull();
  expect(result.error?.code).toBe("42501");

  // Restore assignment
  must(
    await fx.admin.from("location_memberships").insert({
      location_id: fx.a,
      profile_id: fx.staff.id,
      role: "staff",
    }),
  );
});

it("ACTIVE Enabled/Disabled applies to Tips module and restores STAGED", async () => {
  const expA = bind(fx.manager, fx.a, "manager");

  // Populate explicit configuration for all locations & modules before switching to ACTIVE
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

  // Enable ACTIVE enforcement
  must(
    await fx.admin
      .from("module_enforcement_settings")
      .update({
        mode: "active",
        activation_reference: "disposable-tips-acceptance",
      })
      .eq("singleton", true),
  );

  // Disable Tips at Loc A
  must(
    await fx.admin
      .from("location_module_configs")
      .update({ is_enabled: false })
      .eq("location_id", fx.a)
      .eq("module_key", "tips"),
  );

  const result = await addTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: expA,
    start: "08:00",
    end: "10:00",
    amountCents: 2000,
    participantIds: [fx.staff.id],
  });
  expect(result.ok).toBe(false);
  expect((result as { moduleUnavailable?: boolean }).moduleUnavailable).toBe(
    true,
  );

  // Restore STAGED
  must(
    await fx.admin
      .from("module_enforcement_settings")
      .update({ mode: "staged", activation_reference: null })
      .eq("singleton", true),
  );
  must(
    await fx.admin
      .from("location_module_configs")
      .delete()
      .in("location_id", [fx.a, fx.b, fx.c]),
  );
});
