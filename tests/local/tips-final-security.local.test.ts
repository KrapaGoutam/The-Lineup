import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  createTipsFixture,
  must,
  type TipsFixture,
} from "./support/tips-fixture";
import { classifyTipsReadError } from "@/features/tips/domain/tips-read-model";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * V2-005.003 final security corrections, exercised with REAL Supabase Auth
 * sessions against the disposable local database (never mocked authorization):
 * the actual Tips page loader, direct PostgREST attempts as real users, and the
 * shared audit_events boundary.
 */

let fx: TipsFixture;
const request = vi.hoisted(() => ({
  client: null as unknown,
  location: null as null | { id: string; time_zone: string },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  locationForLoader: async () => request.location,
}));
// If the loader ever fell back to the organization-wide roster this would be
// reached; it must stay untouched.
const orgRoster = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: async () => {
    orgRoster.calls += 1;
    return [];
  },
}));

import { getTipsContext } from "@/features/tips/data/tips-data";

const CHI = "America/Chicago";
const today = (zone = CHI) => zonedWallTimeFromInstant(new Date(), zone).date;

function loaderAs(
  user: { client: unknown },
  location: { id: string; time_zone: string },
) {
  request.client = user.client;
  request.location = location;
}

beforeAll(async () => {
  fx = await createTipsFixture();
  // History at A: manager adds an interval for staff + dual (through the RPC).
  const add = await fx.manager.client.rpc("tips_add_interval", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: today(),
    p_starts_at: new Date().toISOString(),
    p_ends_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    p_amount_cents: 10001,
    p_participant_ids: [fx.staff.id, fx.dual.id],
  });
  expect(add.error).toBeNull();
});

afterAll(async () => {
  if (fx) await fx.teardown();
});

it("loader (manager): current workforce selectable, no foreign/unassigned people, no org-wide fallback", async () => {
  loaderAs(fx.manager, { id: fx.a, time_zone: CHI });
  const ctx = await getTipsContext(fx.org.id);
  expect(ctx?.unavailable).toBeUndefined();
  expect(ctx?.intervals).toHaveLength(1);
  expect(ctx?.intervals[0].amountCents).toBe(10001);
  expect(ctx?.selectableIds).toEqual(
    expect.arrayContaining([fx.staff.id, fx.dual.id]),
  );
  const directory = ctx!.team.map((m) => m.id);
  expect(directory).not.toContain(fx.foreign.id);
  expect(directory).not.toContain(fx.unassigned.id);
  expect(orgRoster.calls).toBe(0);
});

it("loader: a person who left the location stays in the name directory but is no longer selectable", async () => {
  must(
    await fx.admin
      .from("location_memberships")
      .delete()
      .eq("location_id", fx.a)
      .eq("profile_id", fx.dual.id),
  );
  try {
    loaderAs(fx.manager, { id: fx.a, time_zone: CHI });
    const ctx = await getTipsContext(fx.org.id);
    expect(ctx!.team.map((m) => m.id)).toContain(fx.dual.id); // history readable
    expect(ctx!.selectableIds).not.toContain(fx.dual.id); // not offered again
    expect(ctx!.selectableIds).toContain(fx.staff.id);
    expect(ctx!.intervals[0].participantIds).toContain(fx.dual.id); // frozen history
  } finally {
    must(
      await fx.admin.from("location_memberships").insert({
        location_id: fx.a,
        profile_id: fx.dual.id,
        role: "staff",
      }),
    );
  }
});

it("loader (staff): only their own row in the directory, their own interval, no audit log", async () => {
  loaderAs(fx.staff, { id: fx.a, time_zone: CHI });
  const ctx = await getTipsContext(fx.org.id);
  expect(ctx?.unavailable).toBeUndefined();
  expect(ctx!.team.map((m) => m.id)).toEqual([fx.staff.id]);
  expect(ctx!.intervals).toHaveLength(1);
  expect(ctx!.auditLog).toEqual([]);
});

it("loader fails closed for a location the user does not belong to (no data, no org roster)", async () => {
  loaderAs(fx.staff, { id: fx.b, time_zone: "America/New_York" });
  const denied = await getTipsContext(fx.org.id);
  expect(denied?.unavailable).toBe("access_denied");
  expect(denied?.team).toEqual([]);
  expect(denied?.intervals).toEqual([]);

  loaderAs(fx.unassigned, { id: fx.a, time_zone: CHI });
  const unassigned = await getTipsContext(fx.org.id);
  expect(unassigned?.unavailable).toBe("access_denied");

  loaderAs(fx.foreign, { id: fx.a, time_zone: CHI });
  const foreign = await getTipsContext(fx.org.id);
  expect(foreign?.unavailable).toBe("access_denied");
  expect(orgRoster.calls).toBe(0);
});

it("a missing RPC (old schema) is classified backend_not_ready by the real PostgREST error", async () => {
  const { error } = await (
    fx.manager.client as unknown as {
      rpc: (
        name: string,
        args: object,
      ) => Promise<{ error: { code?: string } | null }>;
    }
  ).rpc("tips_function_that_does_not_exist", {});
  expect(error?.code).toBe("PGRST202");
  expect(classifyTipsReadError(error!)).toBe("backend_not_ready");
});

it("staff can read their own allocations (RLS helper is executable) and nobody else's", async () => {
  const own = await fx.staff.client
    .from("tip_allocations")
    .select("profile_id, amount_cents");
  expect(own.error).toBeNull();
  expect(own.data!.length).toBeGreaterThan(0);
  expect(own.data!.every((row) => row.profile_id === fx.staff.id)).toBe(true);
  // $100.01 split two ways: the extra cent goes to the lowest profile id.
  expect(own.data!.reduce((sum, row) => sum + row.amount_cents, 0)).toBeOneOf([
    5000, 5001,
  ]);
});

it("direct PostgREST writes cannot change a finalized pool; unauthorized callers change nothing", async () => {
  const pool = must(
    await fx.admin
      .from("tip_pools")
      .select("id")
      .eq("location_id", fx.a)
      .eq("service_date", today())
      .single(),
  )!;
  const fin = await fx.manager.client.rpc("tips_finalize_pool", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_tip_pool_id: pool.id,
  });
  expect(fin.error).toBeNull();

  const snapshot = async () => ({
    intervals: must(
      await fx.admin
        .from("tip_intervals")
        .select("id, amount_cents")
        .eq("tip_pool_id", pool.id)
        .order("id"),
    ),
    allocations: must(
      await fx.admin
        .from("tip_allocations")
        .select("profile_id, amount_cents")
        .eq("tip_pool_id", pool.id)
        .order("profile_id"),
    ),
    participants: must(
      await fx.admin
        .from("tip_interval_participants")
        .select("tip_interval_id, profile_id")
        .order("profile_id"),
    ),
  });
  const before = await snapshot();
  const intervalId = before.intervals![0].id;

  // Authorized manager, finalized pool.
  const m = fx.manager.client;
  const insInterval = await m.from("tip_intervals").insert({
    organization_id: fx.org.id,
    tip_pool_id: pool.id,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 3600_000).toISOString(),
    amount_cents: 999,
  });
  expect(insInterval.error?.code).toBe("42501");
  const updInterval = await m
    .from("tip_intervals")
    .update({ amount_cents: 1 })
    .eq("tip_pool_id", pool.id)
    .select();
  expect(updInterval.error).toBeNull();
  expect(updInterval.data).toEqual([]);
  const delInterval = await m
    .from("tip_intervals")
    .delete()
    .eq("tip_pool_id", pool.id)
    .select();
  expect(delInterval.data).toEqual([]);
  const insPart = await m.from("tip_interval_participants").insert({
    organization_id: fx.org.id,
    tip_interval_id: intervalId,
    profile_id: fx.manager.id,
  });
  expect(insPart.error?.code).toBe("42501");
  const updAlloc = await m
    .from("tip_allocations")
    .update({ amount_cents: 1 })
    .eq("tip_pool_id", pool.id)
    .select();
  expect(updAlloc.data).toEqual([]);
  const insAlloc = await m.from("tip_allocations").insert({
    organization_id: fx.org.id,
    tip_pool_id: pool.id,
    profile_id: fx.staff.id,
    amount_cents: 99999,
  });
  expect(insAlloc.error?.code).toBe("42501");

  // Unauthorized callers (staff at A, a manager from another org's perspective).
  const staffUpd = await fx.staff.client
    .from("tip_pools")
    .update({ status: "draft", finalized_at: null, finalized_by: null })
    .eq("id", pool.id)
    .select();
  expect(staffUpd.data ?? []).toEqual([]);
  const rpcAdd = await fx.staff.client.rpc("tips_add_interval", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: today(),
    p_starts_at: new Date().toISOString(),
    p_ends_at: new Date(Date.now() + 3600_000).toISOString(),
    p_amount_cents: 1,
    p_participant_ids: [fx.staff.id],
  });
  expect(rpcAdd.error?.code).toBe("42501");
  const forged = await fx.foreign.client.rpc("tips_reopen_pool", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_tip_pool_id: pool.id,
    p_reason: "forged reopen",
  });
  expect(forged.error?.code).toBe("42501");

  expect(await snapshot()).toEqual(before);
  const status = must(
    await fx.admin
      .from("tip_pools")
      .select("status")
      .eq("id", pool.id)
      .single(),
  );
  expect(status!.status).toBe("finalized");
});

it("shared audit_events: Tips authority covers tip_pool events at the managed location only", async () => {
  // A PURE location manager: org-level role is only "server", so the baseline
  // org-role branch of the policy does not apply and only Tips authority can.
  const locMgr = await fx.makeUser("loc-manager");
  must(
    await fx.admin.from("memberships").insert({
      organization_id: fx.org.id,
      profile_id: locMgr.id,
      roles: ["server"],
      active: true,
    }),
  );
  must(
    await fx.admin.from("location_memberships").insert({
      location_id: fx.a,
      profile_id: locMgr.id,
      role: "manager",
    }),
  );
  const base = {
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: locMgr.id,
    entity_id: "1",
  };
  const tip = await locMgr.client
    .from("audit_events")
    .insert({ ...base, action: "finalized", entity_type: "tip_pool" });
  expect(tip.error?.code).toBe("42501");

  const other = await locMgr.client
    .from("audit_events")
    .insert({ ...base, action: "finalized", entity_type: "payroll_entry" });
  expect(other.error?.code).toBe("42501");
  const wrongAction = await locMgr.client
    .from("audit_events")
    .insert({ ...base, action: "purged", entity_type: "tip_pool" });
  expect(wrongAction.error?.code).toBe("42501");
  const atB = await locMgr.client.from("audit_events").insert({
    ...base,
    location_id: fx.b,
    action: "finalized",
    entity_type: "tip_pool",
  });
  expect(atB.error?.code).toBe("42501");

  // Someone with no role at the location at all.
  const unassigned = await fx.unassigned.client.from("audit_events").insert({
    ...base,
    actor_profile_id: fx.unassigned.id,
    action: "finalized",
    entity_type: "tip_pool",
  });
  expect(unassigned.error).not.toBeNull();

  // Other modules' events are invisible to a Tips-only manager.
  must(
    await fx.admin.from("audit_events").insert({
      ...base,
      action: "published",
      entity_type: "payroll_entry",
    }),
  );
  const seen = await locMgr.client
    .from("audit_events")
    .select("entity_type")
    .eq("location_id", fx.a);
  expect(seen.error).toBeNull();
  expect(seen.data!.every((row) => row.entity_type === "tip_pool")).toBe(true);
});

it("Overall administrator: real attribution without a membership row, and no blanket audit_events access", async () => {
  must(
    await fx.admin
      .from("overall_roles")
      .upsert(
        { profile_id: fx.overall.id, role: "owner" },
        { onConflict: "profile_id" },
      ),
  );
  const tip = await fx.overall.client.from("audit_events").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: fx.overall.id,
    action: "reopened",
    entity_type: "tip_pool",
    entity_id: "1",
    reason: "overall correction",
  });
  expect(tip.error?.code).toBe("42501");

  const other = await fx.overall.client.from("audit_events").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: fx.overall.id,
    action: "finalized",
    entity_type: "payroll_entry",
    entity_id: "1",
  });
  expect(other.error?.code).toBe("42501");

  // Trigger: a non-member, non-Overall actor cannot be recorded for any module.
  const unattributable = await fx.admin.from("audit_events").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: fx.foreign.id,
    action: "published",
    entity_type: "schedule_period",
    entity_id: "1",
  });
  expect(unattributable.error?.code).toBe("23503");
});

it("direct pool PATCH cannot attribute a finalization to someone else, and allocations cannot be written directly", async () => {
  const day = (await import("@/lib/timezone")).zonedWallTimeFromInstant(
    new Date(Date.now() + 24 * 3600_000),
    CHI,
  ).date;
  const add = await fx.manager.client.rpc("tips_add_interval", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: day,
    p_starts_at: new Date().toISOString(),
    p_ends_at: new Date(Date.now() + 3600_000).toISOString(),
    p_amount_cents: 700,
    p_participant_ids: [fx.staff.id],
  });
  expect(add.error).toBeNull();
  const poolId = add.data!.tip_pool_id;

  const forged = await fx.manager.client
    .from("tip_pools")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: fx.staff.id,
    })
    .eq("id", poolId)
    .select();
  expect(forged.error?.code).toBe("42501");
  expect(
    must(
      await fx.admin
        .from("tip_pools")
        .select("status")
        .eq("id", poolId)
        .single(),
    )!.status,
  ).toBe("draft");

  // Direct finalize attributed to caller is also refused (must use tips_finalize_pool RPC)
  const selfFinalize = await fx.manager.client
    .from("tip_pools")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: fx.manager.id,
    })
    .eq("id", poolId)
    .select();
  expect(selfFinalize.error?.code).toBe("42501");

  // Finalize via RPC so we can test direct reopen
  const finRpc = await fx.manager.client.rpc("tips_finalize_pool", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_tip_pool_id: poolId,
  });
  expect(finRpc.error).toBeNull();

  // Direct reopen on finalized pool affects 0 rows (reopen policy dropped)
  const directReopen = await fx.manager.client
    .from("tip_pools")
    .update({
      status: "draft",
      finalized_at: null,
      finalized_by: null,
    })
    .eq("id", poolId)
    .select();
  expect(directReopen.data).toHaveLength(0);
  expect(
    must(
      await fx.admin
        .from("tip_pools")
        .select("status")
        .eq("id", poolId)
        .single(),
    )!.status,
  ).toBe("finalized");

  // Allocations are derived: no direct writes, even on a draft pool.
  const direct = await fx.manager.client.from("tip_allocations").insert({
    organization_id: fx.org.id,
    tip_pool_id: poolId,
    profile_id: fx.dual.id,
    amount_cents: 99999,
  });
  expect(direct.error?.code).toBe("42501");

  // The RPC recalculation still produced the right allocation.
  const rows = must(
    await fx.admin
      .from("tip_allocations")
      .select("profile_id, amount_cents")
      .eq("tip_pool_id", poolId),
  )!;
  expect(rows).toEqual([{ profile_id: fx.staff.id, amount_cents: 700 }]);
});
