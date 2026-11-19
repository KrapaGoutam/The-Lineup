import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  createTipsFixture,
  must,
  type TipsFixture,
  type TipsTestUser,
} from "./support/tips-fixture";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * V2.0.8 Editable Tips against the REAL local database with REAL Auth JWTs: the actual
 * server actions run unmodified; only the request context (who is signed in) is bound.
 */

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
  getTipsRangeAction,
  recalculateTipsAction,
  saveTipIntervalAction,
  voidTipIntervalAction,
} from "@/features/tips/actions/tips-actions";

const CHI = "America/Chicago";
const today = () => zonedWallTimeFromInstant(new Date(), CHI).date;

function bind(user: TipsTestUser, location: string, designation: string) {
  request.client = user.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: { organizationId: fx.org.id, locationId: location, timeZone: CHI },
    viewer: { profileId: user.id, name: user.name, designation },
  };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId: location,
  };
}

const asManager = () => bind(fx.manager, fx.a, "manager");
const asStaff = () => bind(fx.staff, fx.a, "staff");

function save(
  values: Partial<Parameters<typeof saveTipIntervalAction>[0]> & {
    start: string;
    end: string;
  },
) {
  return saveTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asManager(),
    serviceDate: today(),
    cashCents: 1001,
    cardCents: 500,
    participantIds: [fx.staff.id, fx.dual.id],
    ...values,
  });
}

async function range(date = today(), revisions = true) {
  const result = await getTipsRangeAction({
    restaurantSlug: fx.org.slug,
    from: date,
    to: date,
    includeRevisions: revisions,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.range;
}

beforeAll(async () => {
  fx = await createTipsFixture();
});
afterAll(async () => {
  if (fx) await fx.teardown();
});

it("saves cash + card; allocations reconcile exactly; the audit trail names the editor", async () => {
  const saved = await save({ start: "10:00", end: "11:00" });
  expect(saved.ok).toBe(true);

  asManager();
  const day = (await range()).days[0];
  const sum = (k: "cashCents" | "cardCents" | "amountCents") =>
    day.allocations.reduce((n, a) => n + a[k], 0);
  expect(sum("cashCents")).toBe(1001);
  expect(sum("cardCents")).toBe(500);
  expect(sum("amountCents")).toBe(1501);
  expect(day.revisions).toHaveLength(1);
  expect(day.revisions[0]).toMatchObject({
    action: "interval_created",
    source: "rpc",
    editorProfileId: fx.manager.id,
  });
});

it("an update needs a reason, bumps the revision, keeps before/after, and a stale tab conflicts", async () => {
  asManager();
  const interval = (await range()).days[0].intervals[0];

  const noReason = await save({
    start: "10:00",
    end: "11:00",
    intervalId: interval.id,
    expectedRevision: interval.revision,
  });
  expect(noReason.ok).toBe(false);

  const updated = await save({
    start: "10:00",
    end: "11:00",
    intervalId: interval.id,
    expectedRevision: interval.revision,
    cashCents: 1200,
    cardCents: 300,
    participantIds: [fx.staff.id],
    reason: "Counted the slips again",
  });
  expect(updated).toMatchObject({ ok: true, data: { revision: 2 } });

  const stale = await save({
    start: "10:00",
    end: "11:00",
    intervalId: interval.id,
    expectedRevision: interval.revision, // the old revision
    cashCents: 1,
    cardCents: 1,
    participantIds: [fx.staff.id],
    reason: "stale tab",
  });
  expect(stale).toMatchObject({ ok: false, conflict: true });

  const day = (await range()).days[0];
  const revision = day.revisions.find((r) => r.action === "interval_updated")!;
  expect(revision.reason).toBe("Counted the slips again");
  expect(revision.affectedProfileIds).toContain(fx.dual.id); // removed person is recorded
  expect(day.allocations.map((a) => a.profileId)).toEqual([fx.staff.id]);
  expect(day.allocations[0]).toMatchObject({ cashCents: 1200, cardCents: 300 });
});

it("staff see only their own figures and never the audit trail, even when they ask for it", async () => {
  asStaff();
  const own = await range(today(), true);
  expect(own.isManager).toBe(false);
  const day = own.days[0];
  expect(day.revisions).toEqual([]);
  expect(day.allocations.map((a) => a.profileId)).toEqual([fx.staff.id]);
  expect(day.intervals[0].amountCents).toBeNull();
  expect(day.intervals[0].participantIds).toEqual([]);
  expect(JSON.stringify(own)).not.toContain(fx.dual.id);

  // RLS: the revisions table itself is unreadable to staff.
  const direct = await fx.staff.client.from("tip_revisions").select("id");
  expect(direct.data).toEqual([]);

  // And staff cannot save, void or recalculate.
  const denied = await saveTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asStaff(),
    serviceDate: today(),
    start: "15:00",
    end: "16:00",
    cashCents: 100,
    cardCents: 0,
    participantIds: [fx.staff.id],
  });
  expect(denied).toMatchObject({ ok: false });
});

it("void is an audited soft delete: the row and its participants stay, the money leaves the distribution", async () => {
  const created = await save({
    start: "12:00",
    end: "13:00",
    cashCents: 700,
    cardCents: 0,
    participantIds: [fx.staff.id],
  });
  if (!created.ok) throw new Error(created.error);

  const bad = await voidTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asManager(),
    intervalId: String(created.data.intervalId),
    expectedRevision: created.data.revision,
    reason: "no",
  });
  expect(bad.ok).toBe(false);

  const voided = await voidTipIntervalAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asManager(),
    intervalId: String(created.data.intervalId),
    expectedRevision: created.data.revision,
    reason: "Entered on the wrong day",
  });
  expect(voided.ok).toBe(true);

  const row = must(
    await fx.admin
      .from("tip_intervals")
      .select("voided_at, voided_by, void_reason")
      .eq("id", created.data.intervalId)
      .single(),
  );
  expect(row).toMatchObject({
    voided_by: fx.manager.id,
    void_reason: "Entered on the wrong day",
  });
  expect(row!.voided_at).not.toBeNull();
  const parts = must(
    await fx.admin
      .from("tip_interval_participants")
      .select("profile_id")
      .eq("tip_interval_id", created.data.intervalId),
  );
  expect(parts).toHaveLength(1);

  asManager();
  const day = (await range()).days[0];
  expect(day.allocations.reduce((n, a) => n + a.amountCents, 0)).toBe(1500); // 1200 + 300 only
  expect(day.revisions.map((r) => r.action)).toContain("interval_voided");
});

it("cross-midnight and daylight-saving intervals persist their REAL elapsed time", async () => {
  // 23:00 -> 01:00 over midnight, same service date.
  const cross = await save({
    start: "23:00",
    end: "01:00",
    cashCents: 0,
    cardCents: 600,
  });
  expect(cross.ok).toBe(true);
  asManager();
  const interval = (await range()).days[0].intervals.find(
    (i) => i.start === "23:00",
  )!;
  expect(interval.endsNextDay).toBe(true);
  expect(
    (Date.parse(interval.endsAt) - Date.parse(interval.startsAt)) / 3_600_000,
  ).toBe(2);

  // Spring forward (2026-03-08): 01:00 CST -> 04:00 CDT is two real hours.
  const spring = await save({
    serviceDate: "2026-03-08",
    start: "01:00",
    end: "04:00",
    cashCents: 500,
    cardCents: 0,
    participantIds: [fx.staff.id],
  });
  expect(spring.ok).toBe(true);
  asManager();
  const s = (await range("2026-03-08")).days[0].intervals[0];
  expect((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 3_600_000).toBe(2);

  // Fall back (2026-11-01): the repeated 01:30 hour, first occurrence.
  const fall = await save({
    serviceDate: "2026-11-01",
    start: "01:30",
    end: "02:30",
    cashCents: 0,
    cardCents: 400,
    participantIds: [fx.staff.id],
  });
  expect(fall.ok).toBe(true);
  asManager();
  const f = (await range("2026-11-01")).days[0].intervals[0];
  expect((Date.parse(f.endsAt) - Date.parse(f.startsAt)) / 3_600_000).toBe(2);
});

it("overlap and a locked legacy day are rejected by the database", async () => {
  const overlap = await save({ start: "10:30", end: "11:30" });
  expect(overlap).toMatchObject({
    ok: false,
    error: "Tip intervals cannot overlap.",
  });

  // Lock today's day the way the earlier workflow did, via the retained RPC.
  const pool = must(
    await fx.admin
      .from("tip_pools")
      .select("id")
      .eq("location_id", fx.a)
      .eq("service_date", today())
      .single(),
  )!;
  must(
    await fx.manager.client.rpc("tips_finalize_pool", {
      p_organization_id: fx.org.id,
      p_location_id: fx.a,
      p_tip_pool_id: pool.id,
    }),
  );
  const locked = await save({ start: "17:00", end: "18:00" });
  expect(locked.ok).toBe(false);
  expect(!locked.ok && locked.error).toContain("finalized");

  const recalc = await recalculateTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asManager(),
    tipPoolId: pool.id,
  });
  expect(recalc.ok).toBe(false);

  // Reopen (audited) restores editing, and a recalculation is then a no-op.
  must(
    await fx.manager.client.rpc("tips_reopen_pool", {
      p_organization_id: fx.org.id,
      p_location_id: fx.a,
      p_tip_pool_id: pool.id,
      p_reason: "Correct the split",
    }),
  );
  const again = await recalculateTipsAction({
    restaurantSlug: fx.org.slug,
    expectedContext: asManager(),
    tipPoolId: pool.id,
  });
  expect(again).toMatchObject({ ok: true, data: { changed: false } });
});

it("direct table writes are refused for a manager (RPC-only); a privileged direct write is still captured in the audit", async () => {
  const pool = must(
    await fx.admin
      .from("tip_pools")
      .select("id")
      .eq("location_id", fx.a)
      .eq("service_date", today())
      .single(),
  )!;
  const interval = must(
    await fx.admin
      .from("tip_intervals")
      .select("id, voided_at")
      .eq("tip_pool_id", pool.id)
      .is("voided_at", null)
      .limit(1)
      .single(),
  )!;
  const m = fx.manager.client;

  // A manager cannot bypass void / revision / reconciliation, and cannot delete a day.
  const edit = await m
    .from("tip_intervals")
    .update({ note: "sneaky" })
    .eq("id", interval.id);
  expect(edit.error?.code).toBe("42501");
  const sneakyVoid = await m
    .from("tip_intervals")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: fx.manager.id,
      void_reason: "sneaky void",
    })
    .eq("id", interval.id);
  expect(sneakyVoid.error?.code).toBe("42501");
  const wipe = await m.from("tip_pools").delete().eq("id", pool.id);
  expect(wipe.error?.code).toBe("42501");
  expect(
    must(await fx.admin.from("tip_pools").select("id").eq("id", pool.id)),
  ).toHaveLength(1);

  // A privileged (service-role) write still happens and is never invisible.
  const before = must(
    await fx.admin
      .from("tip_revisions")
      .select("id")
      .eq("source", "direct")
      .eq("tip_pool_id", pool.id),
  )!;
  must(
    await fx.admin
      .from("tip_intervals")
      .update({ note: "maintenance edit" })
      .eq("id", interval.id),
  );
  const after = must(
    await fx.admin
      .from("tip_revisions")
      .select("action, after_state")
      .eq("source", "direct")
      .eq("tip_pool_id", pool.id),
  )!;
  expect(after.length).toBe(before.length + 1);
  expect(after.at(-1)).toMatchObject({ action: "direct_interval_update" });
});

it("tenant and location isolation: a foreign user and staff of another branch see nothing", async () => {
  request.client = fx.foreign.client;
  request.actor = {
    organizationId: fx.org.id,
    scope: { organizationId: fx.org.id, locationId: fx.a, timeZone: CHI },
    viewer: { profileId: fx.foreign.id, name: "x", designation: "staff" },
  };
  const foreign = await getTipsRangeAction({
    restaurantSlug: fx.org.slug,
    from: today(),
    to: today(),
  });
  expect(foreign.ok).toBe(false);

  // Staff assigned only to branch A cannot read branch B, even with a forged actor.
  bind(fx.staff, fx.b, "staff");
  const otherBranch = await getTipsRangeAction({
    restaurantSlug: fx.org.slug,
    from: today(),
    to: today(),
  });
  expect(otherBranch.ok).toBe(false);
  expect(!otherBranch.ok && otherBranch.error).toContain("don't have access");
});
