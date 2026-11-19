import { afterAll, beforeAll, expect, it } from "vitest";

import {
  createTipsFixture,
  must,
  type TipsFixture,
} from "./support/tips-fixture";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * Compatibility with older callers after V2.0.8.
 *
 * Production's deployed app reaches Tips only through RPCs, so V2.0.8 closes direct table
 * writes for every authenticated caller (they would bypass void / revision / reconciliation
 * semantics and, with Finalize gone, every day stays a draft). This suite pins both halves:
 * direct writes are refused, and the retained RPC route (`tips_add_interval`,
 * `recalculate_tip_pool`, `tips_finalize_pool`, `tips_reopen_pool`) still works end to end,
 * with `tips_add_interval` now inheriting the new validation and audit.
 */

let fx: TipsFixture;
const today = () =>
  zonedWallTimeFromInstant(new Date(), "America/Chicago").date;

beforeAll(async () => {
  fx = await createTipsFixture();
});
afterAll(async () => {
  if (fx) await fx.teardown();
});

it("direct table writes are refused for a location manager; nothing changes", async () => {
  const m = fx.manager.client;
  const pool = await m.from("tip_pools").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    service_date: today(),
    status: "draft",
  });
  expect(pool.error?.code).toBe("42501");
  expect(
    must(await fx.admin.from("tip_pools").select("id").eq("location_id", fx.a)),
  ).toEqual([]);
});

it("the RPC route still works: add, recalculate, finalize, reopen, with audit and exact money", async () => {
  const m = fx.manager.client;
  const start = new Date();
  const added = await m.rpc("tips_add_interval", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: today(),
    p_starts_at: start.toISOString(),
    p_ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
    p_amount_cents: 10001,
    p_participant_ids: [fx.staff.id, fx.dual.id],
  });
  expect(added.error).toBeNull();
  const poolId = (added.data as { tip_pool_id: number }).tip_pool_id;

  // Delegation: the legacy call is audited like a Save, and the money is exact.
  const revisions = must(
    await fx.admin
      .from("tip_revisions")
      .select("action, source, editor_profile_id")
      .eq("tip_pool_id", poolId),
  )!;
  expect(revisions).toEqual([
    {
      action: "interval_created",
      source: "rpc",
      editor_profile_id: fx.manager.id,
    },
  ]);
  const cents = must(
    await fx.admin
      .from("tip_allocations")
      .select("amount_cents")
      .eq("tip_pool_id", poolId),
  )!
    .map((a) => a.amount_cents)
    .sort();
  expect(cents).toEqual([5000, 5001]);

  // It inherits the new validation: an overlapping interval is refused.
  const overlap = await m.rpc("tips_add_interval", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_service_date: today(),
    p_starts_at: new Date(start.getTime() + 600_000).toISOString(),
    p_ends_at: new Date(start.getTime() + 1_800_000).toISOString(),
    p_amount_cents: 100,
    p_participant_ids: [fx.staff.id],
  });
  expect(overlap.error?.message).toContain("cannot overlap");

  expect(
    (await m.rpc("recalculate_tip_pool", { target_tip_pool_id: poolId })).error,
  ).toBeNull();

  const finalized = await m.rpc("tips_finalize_pool", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_tip_pool_id: poolId,
  });
  expect(finalized.error).toBeNull();
  expect(
    must(
      await fx.admin
        .from("tip_pools")
        .select("status")
        .eq("id", poolId)
        .single(),
    )!.status,
  ).toBe("finalized");

  const reopened = await m.rpc("tips_reopen_pool", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
    p_tip_pool_id: poolId,
    p_reason: "old app reopen",
  });
  expect(reopened.error).toBeNull();
  const events = must(
    await fx.admin
      .from("audit_events")
      .select("action, reason")
      .eq("entity_id", String(poolId)),
  )!;
  expect(events.map((e) => e.action).sort()).toEqual(["finalized", "reopened"]);
});
