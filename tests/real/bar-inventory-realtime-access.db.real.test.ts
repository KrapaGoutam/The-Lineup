/**
 * Bar Inventory V1 / BI-9 + BI-10 -- who is TOLD about a change (hosted DEV
 * only). Realtime applies each table's SELECT policy per subscriber, so a
 * manager of the location is notified, while a server (staff) of the same
 * organization and a manager of ANOTHER organization receive nothing -- even
 * subscribed to the very same location filter. Synthetic organizations only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixture, type Fixture } from "./support/harness";

let fx: Fixture;
let org: string;
let loc: string;
let product: string;
let subcategory: string;

const base = () => ({ p_organization_id: org, p_location_id: loc });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Who = Fixture["manager"];

/** Joins one channel on both published tables, as `user`, and counts events. */
async function listen(user: Who) {
  const seen: { table: string; type: string }[] = [];
  const { data } = await user.client.auth.getSession();
  user.client.realtime.setAuth(data.session!.access_token);
  const channel = user.client.channel(`rt-access-${user.id}-${Date.now()}`);
  for (const table of [
    "inventory_stock",
    "inventory_adjustments",
    "inventory_date_lots",
    "inventory_freshness_rules",
  ]) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `location_id=eq.${loc}` },
      (payload) => seen.push({ table, type: payload.eventType }),
    );
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("channel did not join")),
      15_000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { seen, stop: () => user.client.removeChannel(channel) };
}

beforeAll(async () => {
  fx = await createFixture();
  org = fx.orgId;
  loc = fx.locA;
  await fx.manager.client.rpc("inventory_bootstrap", base());
  const vendor = await fx.manager.client.rpc("inventory_vendor_create", {
    ...base(),
    p_name: "Faust",
    p_notes: null,
  });
  expect(vendor.error).toBeNull();
  const made = await fx.manager.client.rpc("inventory_product_create", {
    ...base(),
    p_vendor_id: vendor.data as string,
    p_name: "Realtime Gin",
    p_category_id: null,
    p_subcategory_id: null,
    p_size: "750 mL",
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
  });
  expect(made.error).toBeNull();
  product = made.data as string;
  const category = await fx.manager.client.rpc("inventory_category_create", {
    ...base(),
    p_name: "Realtime dates",
  });
  expect(category.error).toBeNull();
  const sub = await fx.manager.client.rpc("inventory_subcategory_create", {
    ...base(),
    p_category_id: category.data,
    p_name: "Realtime IPA",
  });
  expect(sub.error).toBeNull();
  subcategory = sub.data as string;
}, 120_000);

afterAll(async () => {
  if (!fx) return;
  await fx.teardown();
});

describe("Realtime tells only the people who may read the data (BI-RT, BI-SEC)", () => {
  it("a manager of the location is notified; staff and another tenant's manager hear nothing", async () => {
    const manager = await listen(fx.manager);
    const staff = await listen(fx.server1);
    const outsider = await listen(fx.outsider);

    const counted = await fx.manager.client.rpc("inventory_stock_adjust", {
      ...base(),
      p_product_id: product,
      p_mode: "delta",
      p_on_hand: 7,
      p_backup: null,
      p_reason: "delivery_restock",
      p_note: null,
      p_expected_version: null,
    });
    expect(counted.error).toBeNull();
    const date = await fx.manager.client.rpc("inventory_date_lot_save", {
      ...base(),
      p_id: null,
      p_product_id: product,
      p_quantity: 1,
      p_manufacture_date: null,
      p_manufacture_precision: null,
      p_expiration_date: "2026-12-31",
      p_expiration_precision: "month",
      p_notes: null,
      p_active: true,
      p_expected_version: null,
    });
    expect(date.error).toBeNull();
    const rule = await fx.manager.client.rpc("inventory_freshness_rule_save", {
      ...base(),
      p_id: null,
      p_subcategory_id: subcategory,
      p_tracking_enabled: true,
      p_maximum_months: 9,
      p_warning_months: 1,
      p_active: true,
      p_expected_version: null,
    });
    expect(rule.error).toBeNull();

    // Give every subscriber the same generous window.
    await wait(6000);

    const tables = new Set(manager.seen.map((e) => e.table));
    expect(tables.has("inventory_stock")).toBe(true);
    expect(tables.has("inventory_adjustments")).toBe(true);
    expect(tables.has("inventory_date_lots")).toBe(true);
    expect(tables.has("inventory_freshness_rules")).toBe(true);
    expect(staff.seen).toEqual([]);
    expect(outsider.seen).toEqual([]);

    await manager.stop();
    await staff.stop();
    await outsider.stop();
  }, 90_000);
});
