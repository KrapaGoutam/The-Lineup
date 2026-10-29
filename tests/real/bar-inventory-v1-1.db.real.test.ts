import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { createFixture, type Fixture, type TestUser } from "./support/harness";
import {
  assertInventoryDev,
  inventoryBase,
  inventoryProduct,
  inventoryRpc,
  seedInventory,
  verifyInventoryCleanup,
} from "./support/inventory-v1-1";
let fx: Fixture;
let seed: Awaited<ReturnType<typeof seedInventory>>;
beforeAll(async () => {
  assertInventoryDev();
  fx = await createFixture();
  seed = await seedInventory(fx);
});
afterAll(async () => {
  if (!fx) return;
  await fx.teardown();
  const counts = await verifyInventoryCleanup(fx);
  fs.mkdirSync("artifacts/bar-inventory-v1-1", { recursive: true });
  fs.writeFileSync(
    "artifacts/bar-inventory-v1-1/hosted-db-cleanup.json",
    JSON.stringify(counts, null, 2),
  );
});
const lot = (user: TestUser, id: string, over: Record<string, unknown> = {}) =>
  inventoryRpc(user, "inventory_date_lot_save", {
    ...inventoryBase(fx),
    p_id: null,
    p_product_id: id,
    p_quantity: 1,
    p_manufacture_date: "2026-01-01",
    p_manufacture_precision: "month",
    p_expiration_date: "2026-10-29",
    p_expiration_precision: "day",
    p_notes: null,
    p_active: true,
    p_expected_version: null,
    ...over,
  });
const batch = (user: TestUser, rows: Record<string, unknown>[]) =>
  inventoryRpc(user, "inventory_bulk_count", {
    ...inventoryBase(fx),
    p_rows: rows,
    p_reason: "stock_count",
    p_note: "V1.1 synthetic count",
  });
async function stock(id: string) {
  const r = await fx.admin
    .from("inventory_stock")
    .select("on_hand,backup,version")
    .eq("product_id", id)
    .eq("location_id", fx.locA)
    .single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const view = (user: TestUser, over: Record<string, unknown> = {}) =>
  inventoryRpc(user, "inventory_saved_view_save", {
    ...inventoryBase(fx),
    p_id: null,
    p_name: "Weekly",
    p_payload: { version: 1, owns: ["search"], state: { search: "Beer" } },
    p_is_default: false,
    p_expected_version: null,
    ...over,
  });
describe("V1.1 hosted DEV real JWT", () => {
  it("manager creates multiple precise dates, updates, archives and audits", async () => {
    const p = await inventoryProduct(fx, seed, "Dates lifecycle");
    const first = await lot(fx.manager, p);
    expect(first.error).toBeNull();
    expect(
      (
        await lot(fx.owner, p, {
          p_quantity: 5,
          p_expiration_date: "2026-11-30",
          p_expiration_precision: "month",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await lot(fx.manager, p, {
          p_id: first.data,
          p_quantity: 2,
          p_expected_version: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await lot(fx.manager, p, {
          p_id: first.data,
          p_quantity: 2,
          p_expected_version: 2,
          p_active: false,
        })
      ).error,
    ).toBeNull();
    const audit = await fx.manager.client
      .from("inventory_change_log")
      .select("action,actor_profile_id,diff")
      .order("id", { ascending: true })
      .eq("entity_id", first.data);
    expect(audit.error).toBeNull();
    expect(audit.data?.map((r) => r.action)).toEqual([
      "create",
      "update",
      "archive",
    ]);
    expect(audit.data?.every((r) => r.actor_profile_id === fx.manager.id)).toBe(
      true,
    );
  });
  it("staff and foreign manager cannot read or mutate dates/rules", async () => {
    const p = await inventoryProduct(fx, seed, "Access denied");
    for (const user of [fx.server1, fx.outsider]) {
      expect((await lot(user, p)).error?.code).toBe("42501");
      for (const table of [
        "inventory_date_lots",
        "inventory_freshness_rules",
        "inventory_saved_views",
      ]) {
        const r = await user.client
          .from(table)
          .select("id")
          .eq("organization_id", fx.orgId);
        expect(r.error).toBeNull();
        expect(r.data).toEqual([]);
      }
      expect(
        (
          await inventoryRpc(user, "inventory_freshness_rule_save", {
            ...inventoryBase(fx),
            p_id: null,
            p_subcategory_id: seed.subcategoryId,
            p_tracking_enabled: true,
            p_maximum_months: 9,
            p_warning_months: 1,
            p_active: true,
            p_expected_version: null,
          })
        ).error?.code,
      ).toBe("42501");
    }
  });
  it("date versions and location boundaries are authoritative", async () => {
    const p = await inventoryProduct(fx, seed, "Stale dates");
    const first = await lot(fx.manager, p);
    expect(first.error).toBeNull();
    expect(
      (await lot(fx.manager, p, { p_id: first.data, p_expected_version: 99 }))
        .error?.code,
    ).toBe("PT409");
    expect(
      (
        await lot(fx.manager, p, {
          p_id: first.data,
          p_expected_version: 1,
          p_location_id: fx.locB,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (await lot(fx.manager, p, { p_location_id: fx.otherLoc })).error?.code,
    ).toBe("42501");
  });
  it("invalid dates and quantities fail; clients cannot write directly", async () => {
    const p = await inventoryProduct(fx, seed, "Invalid dates");
    for (const over of [
      { p_quantity: -1 },
      { p_quantity: 0.001 },
      { p_expiration_date: "2025-02-29" },
      { p_expiration_date: "2026-11-01", p_expiration_precision: "month" },
    ])
      expect((await lot(fx.manager, p, over)).error).not.toBeNull();
    expect(
      (
        await fx.manager.client
          .from("inventory_date_lots")
          .insert({ organization_id: fx.orgId })
      ).error?.code,
    ).toBe("42501");
  });
  it("freshness configuration updates/deactivates with version and audit", async () => {
    const args = {
      ...inventoryBase(fx),
      p_id: null,
      p_subcategory_id: seed.subcategoryId,
      p_tracking_enabled: true,
      p_maximum_months: 6,
      p_warning_months: 1,
      p_active: true,
      p_expected_version: null,
    };
    const r = await inventoryRpc(
      fx.owner,
      "inventory_freshness_rule_save",
      args,
    );
    expect(r.error).toBeNull();
    expect(
      (
        await inventoryRpc(fx.manager, "inventory_freshness_rule_save", {
          ...args,
          p_id: r.data,
          p_expected_version: 1,
          p_active: false,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await inventoryRpc(fx.manager, "inventory_freshness_rule_save", {
          ...args,
          p_id: r.data,
          p_expected_version: 1,
        })
      ).error?.code,
    ).toBe("PT409");
  });
  it("multi-item count creates one normal ledger entry per changed product", async () => {
    const a = await inventoryProduct(fx, seed, "Bulk A"),
      b = await inventoryProduct(fx, seed, "Bulk B");
    expect(
      (
        await batch(fx.manager, [
          { productId: a, expectedVersion: 1, onHand: 5.25, backup: null },
          { productId: b, expectedVersion: 1, onHand: 0, backup: 2 },
        ])
      ).error,
    ).toBeNull();
    expect(await stock(a)).toMatchObject({
      on_hand: 5.25,
      backup: 0,
      version: 2,
    });
    expect(await stock(b)).toMatchObject({ on_hand: 0, backup: 2, version: 2 });
    const ledger = await fx.admin
      .from("inventory_adjustments")
      .select("actor_profile_id,source,reason,note")
      .in("product_id", [a, b]);
    expect(ledger.data).toHaveLength(2);
    expect(
      ledger.data?.every(
        (r) =>
          r.actor_profile_id === fx.manager.id &&
          r.source === "count" &&
          r.reason === "stock_count" &&
          r.note === "V1.1 synthetic count",
      ),
    ).toBe(true);
    expect(
      (
        await batch(fx.manager, [
          { productId: a, expectedVersion: 2, onHand: 5.25, backup: null },
        ])
      ).error,
    ).toBeNull();
    const unchanged = await fx.admin
      .from("inventory_adjustments")
      .select("id", { count: "exact" })
      .eq("product_id", a);
    expect(unchanged.count).toBe(1);
  });
  it("one stale or invalid row applies zero rows", async () => {
    const a = await inventoryProduct(fx, seed, "Atomic A"),
      b = await inventoryProduct(fx, seed, "Atomic B");
    const rows = [
      { productId: a, expectedVersion: 1, onHand: 10, backup: null },
      { productId: b, expectedVersion: 99, onHand: 20, backup: null },
    ];
    expect((await batch(fx.manager, rows)).error?.code).toBe("PT409");
    expect(await stock(a)).toMatchObject({ on_hand: 0, version: 1 });
    expect(
      (
        await batch(fx.manager, [
          rows[0],
          { ...rows[1], expectedVersion: 1, onHand: -1 },
        ])
      ).error?.code,
    ).toBe("22023");
    expect(await stock(a)).toMatchObject({ on_hand: 0, version: 1 });
  });
  it("two simultaneous managers produce exactly one whole-batch winner", async () => {
    const a = await inventoryProduct(fx, seed, "Race A"),
      b = await inventoryProduct(fx, seed, "Race B");
    const rows = (n: number) =>
      [a, b].map((productId) => ({
        productId,
        expectedVersion: 1,
        onHand: n,
        backup: null,
      }));
    const results = await Promise.all([
      batch(fx.owner, rows(11)),
      batch(fx.manager, rows(22)),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe("PT409");
    const sa = await stock(a),
      sb = await stock(b);
    expect(sa.on_hand).toBe(sb.on_hand);
    expect([11, 22]).toContain(sa.on_hand);
    const ledger = await fx.admin
      .from("inventory_adjustments")
      .select("id", { count: "exact" })
      .in("product_id", [a, b]);
    expect(ledger.count).toBe(2);
  });
  it("staff and foreign org cannot bulk count", async () => {
    const p = await inventoryProduct(fx, seed, "Denied bulk");
    for (const user of [fx.server1, fx.outsider])
      expect(
        (
          await batch(user, [
            { productId: p, expectedVersion: 1, onHand: 5, backup: null },
          ])
        ).error?.code,
      ).toBe("42501");
  });
  it("personal views isolate profiles, enforce duplicates, defaults and stale edits", async () => {
    const a = await view(fx.manager, { p_is_default: true });
    expect(a.error).toBeNull();
    expect((await view(fx.manager)).error?.code).toBe("22023");
    const b = await view(fx.manager, { p_name: "Second", p_is_default: true });
    expect(b.error).toBeNull();
    const own = await fx.manager.client
      .from("inventory_saved_views")
      .select("id,is_default");
    expect(own.data?.filter((v) => v.is_default)).toHaveLength(1);
    const other = await fx.owner.client
      .from("inventory_saved_views")
      .select("id");
    expect(other.data).toEqual([]);
    expect(
      (await view(fx.owner, { p_id: a.data, p_expected_version: 2 })).error
        ?.code,
    ).toBe("42501");
    expect(
      (
        await view(fx.manager, {
          p_id: a.data,
          p_expected_version: 1,
          p_name: "Updated",
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      (
        await inventoryRpc(fx.manager, "inventory_saved_view_delete", {
          ...inventoryBase(fx),
          p_id: a.data,
          p_expected_version: 2,
        })
      ).error,
    ).toBeNull();
  });
});
