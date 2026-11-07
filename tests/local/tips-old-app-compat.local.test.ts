import { afterAll, beforeAll, expect, it } from "vitest";

import {
  createTipsFixture,
  must,
  type TipsFixture,
} from "./support/tips-fixture";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * The previously deployed (pre-V2-005.003) app on `development` talks to Tips with
 * DIRECT table writes and `recalculate_tip_pool`, not the new RPCs. This replays that
 * exact sequence as real signed-in users against the NEW schema, so the migration can be
 * applied to hosted DEV before the new application code reaches it.
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

it("old app write sequence still works for a location manager: pool, interval, participants, recalculate, finalize, audit, reopen", async () => {
  const m = fx.manager.client;

  // getOrCreate pool
  const created = await m
    .from("tip_pools")
    .insert({
      organization_id: fx.org.id,
      location_id: fx.a,
      service_date: today(),
      status: "draft",
    })
    .select("id, status")
    .single();
  expect(created.error).toBeNull();
  const poolId = created.data!.id;

  // interval + participants (eligible workforce)
  const interval = await m
    .from("tip_intervals")
    .insert({
      organization_id: fx.org.id,
      tip_pool_id: poolId,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      amount_cents: 10001,
    })
    .select("id")
    .single();
  expect(interval.error).toBeNull();
  const parts = await m.from("tip_interval_participants").insert(
    [fx.staff.id, fx.dual.id].map((profile_id) => ({
      organization_id: fx.org.id,
      tip_interval_id: interval.data!.id,
      profile_id,
    })),
  );
  expect(parts.error).toBeNull();

  const recalc = await m.rpc("recalculate_tip_pool", {
    target_tip_pool_id: poolId,
  });
  expect(recalc.error).toBeNull();
  const cents = must(
    await fx.admin
      .from("tip_allocations")
      .select("amount_cents")
      .eq("tip_pool_id", poolId),
  )!
    .map((a) => a.amount_cents)
    .sort();
  expect(cents).toEqual([5000, 5001]);

  // finalize (direct update with the raw auth user id) + audit event
  const user = must(await m.auth.getUser())!.user!;
  const fin = await m
    .from("tip_pools")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: user.id,
    })
    .eq("id", poolId);
  expect(fin.error).toBeNull();
  const auditFin = await m.from("audit_events").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: user.id,
    action: "finalized",
    entity_type: "tip_pool",
    entity_id: String(poolId),
  });
  expect(auditFin.error).toBeNull();
  expect(
    must(
      await fx.admin
        .from("tip_pools")
        .select("status")
        .eq("id", poolId)
        .single(),
    )!.status,
  ).toBe("finalized");

  // reopen + audit
  const reopen = await m
    .from("tip_pools")
    .update({ status: "draft", finalized_at: null, finalized_by: null })
    .eq("id", poolId);
  expect(reopen.error).toBeNull();
  const auditReopen = await m.from("audit_events").insert({
    organization_id: fx.org.id,
    location_id: fx.a,
    actor_profile_id: user.id,
    action: "reopened",
    entity_type: "tip_pool",
    entity_id: String(poolId),
    reason: "old app reopen",
  });
  expect(auditReopen.error).toBeNull();

  // old loader reads (manager)
  const readPool = await m
    .from("tip_pools")
    .select("id, status")
    .eq("location_id", fx.a)
    .eq("service_date", today())
    .maybeSingle();
  expect(readPool.data?.id).toBe(poolId);
  const readIntervals = await m
    .from("tip_intervals")
    .select("id, tip_interval_participants(profile_id)")
    .eq("tip_pool_id", poolId);
  expect(readIntervals.data).toHaveLength(1);
  const readAudit = await m
    .from("audit_events")
    .select("action")
    .eq("entity_type", "tip_pool")
    .eq("entity_id", String(poolId));
  expect(readAudit.data!.map((r) => r.action).sort()).toEqual([
    "finalized",
    "reopened",
  ]);
});

it("old app staff view is unchanged: staff still read nothing directly from the manager-only tables", async () => {
  const s = fx.staff.client;
  expect((await s.from("tip_pools").select("id")).data).toEqual([]);
  expect((await s.from("tip_intervals").select("id")).data).toEqual([]);
  expect((await s.from("audit_events").select("id")).data).toEqual([]);
});
