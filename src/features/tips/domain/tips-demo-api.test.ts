import { describe, expect, it } from "vitest";

import {
  createDemoTipsApi,
  createDemoTipsStore,
} from "@/features/tips/domain/tips-demo-api";
import { reconcileDay } from "@/features/tips/domain/tips-range-model";

const base = {
  serviceDate: "2026-11-18",
  start: "11:00",
  end: "13:00",
  cashCents: 1001,
  cardCents: 500,
  participantIds: ["a", "b", "c"],
};
const make = (
  isManager = true,
  viewerId = "m",
  store = createDemoTipsStore(),
) =>
  createDemoTipsApi({
    store,
    timeZone: "America/Chicago",
    viewerId,
    isManager,
    pullClockedIn: async () => ["a"],
  });
const day = async (api: ReturnType<typeof make>, rev = true) => {
  const r = await api.loadRange({
    from: "2026-11-18",
    to: "2026-11-18",
    includeRevisions: rev,
  });
  if (!r.ok) throw new Error(r.error);
  return r.data.range.days[0];
};

describe("demo Tips API follows the database rules", () => {
  it("saves, reconciles cash and card, and audits", async () => {
    const api = make();
    const saved = await api.saveInterval(base);
    expect(saved.ok).toBe(true);
    const d = await day(api);
    expect(reconcileDay(d)).toMatchObject({ ok: true });
    expect(d.allocations.map((a) => a.amountCents)).toEqual([501, 500, 500]);
    expect(d.revisions.map((r) => r.action)).toEqual(["interval_created"]);
  });

  it("an update needs a reason and the current revision; a stale one conflicts", async () => {
    const api = make();
    const saved = await api.saveInterval(base);
    if (!saved.ok) throw new Error("save");
    const update = {
      ...base,
      intervalId: String(saved.data.intervalId),
      expectedRevision: 1,
    };
    expect((await api.saveInterval({ ...update, cashCents: 1200 })).ok).toBe(
      false,
    );
    const ok = await api.saveInterval({
      ...update,
      cashCents: 1200,
      reason: "Counted again",
    });
    expect(ok).toMatchObject({ ok: true, data: { revision: 2 } });
    const stale = await api.saveInterval({
      ...update,
      cashCents: 5,
      reason: "stale tab",
    });
    expect(stale).toMatchObject({ ok: false, conflict: true });
    const d = await day(api);
    expect(d.revisions.map((r) => r.action)).toEqual([
      "interval_created",
      "interval_updated",
    ]);
    expect(d.revisions[1].reason).toBe("Counted again");
  });

  it("rejects overlaps, but allows back-to-back and cross-midnight intervals", async () => {
    const api = make();
    await api.saveInterval(base);
    expect(
      await api.saveInterval({ ...base, start: "12:00", end: "14:00" }),
    ).toMatchObject({
      ok: false,
      error: "Tip intervals cannot overlap.",
    });
    expect(
      (await api.saveInterval({ ...base, start: "13:00", end: "15:00" })).ok,
    ).toBe(true);
    expect(
      (await api.saveInterval({ ...base, start: "23:00", end: "01:00" })).ok,
    ).toBe(true);
  });

  it("voids softly: the interval stays, the money leaves the distribution", async () => {
    const api = make();
    const saved = await api.saveInterval(base);
    if (!saved.ok) throw new Error("save");
    expect(
      (
        await api.voidInterval({
          intervalId: String(saved.data.intervalId),
          expectedRevision: 1,
          reason: "",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await api.voidInterval({
          intervalId: String(saved.data.intervalId),
          expectedRevision: 1,
          reason: "Wrong day",
        })
      ).ok,
    ).toBe(true);
    const d = await day(api);
    expect(d.intervals).toHaveLength(1);
    expect(d.intervals[0].voided).toBe(true);
    expect(d.allocations).toEqual([]);
  });

  it("staff see only their own days and shares, with no co-worker identity or totals", async () => {
    const store = createDemoTipsStore();
    await make(true, "m", store).saveInterval(base);
    const staff = make(false, "a", store);
    const mine = await staff.loadRange({
      from: "2026-11-18",
      to: "2026-11-18",
      includeRevisions: true,
    });
    if (!mine.ok) throw new Error("load");
    const d = mine.data.range.days[0];
    expect(d.revisions).toEqual([]);
    expect(d.allocations.map((a) => a.profileId)).toEqual(["a"]);
    expect(d.intervals[0].amountCents).toBeNull();
    expect(d.intervals[0].participantIds).toEqual([]);
    expect(JSON.stringify(mine.data.range)).not.toContain('"b"');
    expect((await staff.saveInterval(base)).ok).toBe(false);
    // a person who did not take part sees nothing at all
    const outsider = await make(false, "z", store).loadRange({
      from: "2026-11-18",
      to: "2026-11-18",
      includeRevisions: false,
    });
    expect(outsider.ok && outsider.data.range.days).toEqual([]);
  });

  it("pulling the clocked-in team is a suggestion only: it never saves anything", async () => {
    const api = make();
    await expect(api.pullClockedIn()).resolves.toEqual({
      ok: true,
      data: ["a"],
    });
    expect(await day(api).catch(() => undefined)).toBeUndefined();
  });
});
