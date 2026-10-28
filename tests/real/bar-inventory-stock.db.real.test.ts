/**
 * Bar Inventory V1 / BI-2 -- real-mode stock and ledger scenarios (hosted DEV
 * only). Scenario ids (BI-xxx) match docs/features/bar-inventory-v1/
 * TEST_MATRIX.md. Every call goes through a synthetic user's own JWT via
 * PostgREST, including the concurrency races (BI-ADJ-006 / 007).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixture, type Fixture } from "./support/harness";

let fx: Fixture;
let org: string;
let loc: string;
let faust: string;

type Rpc = {
  data: unknown;
  error: { message: string; code?: string; details?: string | null } | null;
};
type Who = Fixture["owner"];

const base = () => ({ p_organization_id: org, p_location_id: loc });

async function createProduct(name: string): Promise<string> {
  const res = await fx.manager.client.rpc("inventory_product_create", {
    ...base(),
    p_vendor_id: faust,
    p_name: name,
    p_category_id: null,
    p_subcategory_id: null,
    p_size: "750 mL",
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
  });
  expect(res.error).toBeNull();
  return res.data as string;
}

const adjust = (
  user: Who,
  product: string,
  args: {
    mode: "set" | "delta";
    onHand?: number | null;
    backup?: number | null;
    reason?: string;
    note?: string | null;
    version?: number | null;
  },
): Promise<Rpc> =>
  user.client.rpc("inventory_stock_adjust", {
    ...base(),
    p_product_id: product,
    p_mode: args.mode,
    p_on_hand: args.onHand ?? null,
    p_backup: args.backup ?? null,
    p_reason: args.reason ?? "stock_count",
    p_note: args.note ?? null,
    p_expected_version: args.version ?? null,
  }) as unknown as Promise<Rpc>;

const levels = (
  user: Who,
  product: string,
  cutoff: number | null,
  warning: number | null,
  par: number | null,
  version: number | null,
): Promise<Rpc> =>
  user.client.rpc("inventory_stock_set_levels", {
    ...base(),
    p_product_id: product,
    p_cutoff: cutoff,
    p_warning: warning,
    p_par: par,
    p_expected_version: version,
  }) as unknown as Promise<Rpc>;

async function stockRow(product: string) {
  const { data, error } = await fx.admin
    .from("inventory_stock")
    .select("on_hand, backup, total, version")
    .eq("product_id", product)
    .eq("location_id", loc)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    on_hand: number;
    backup: number;
    total: number;
    version: number;
  };
}

async function ledger(product: string) {
  const { data } = await fx.admin
    .from("inventory_adjustments")
    .select("*")
    .eq("product_id", product)
    .order("id", { ascending: true });
  return (data ?? []) as Record<string, unknown>[];
}

const detailOf = (rpc: Rpc) =>
  rpc.error?.details ? JSON.parse(rpc.error.details) : null;

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
  faust = vendor.data as string;
});

afterAll(async () => {
  if (!fx) return;
  // The ledger and change log are append-only: the harness teardown removes
  // the organizations (cascade) before it deletes memberships.
  await fx.teardown();
});

describe("access (BI-SEC-002)", () => {
  it("staff and other tenants cannot adjust, set levels or read stock", async () => {
    const product = await createProduct("Access vodka");
    for (const user of [fx.server1, fx.outsider]) {
      expect(
        (await adjust(user, product, { mode: "set", onHand: 5, version: 1 }))
          .error?.code,
      ).toBe("42501");
      expect((await levels(user, product, 4, 6, 12, 1)).error?.code).toBe(
        "42501",
      );
    }
    expect(
      (await fx.anon.rpc("inventory_stock_adjust", { ...base() })).error,
    ).not.toBeNull();

    await adjust(fx.manager, product, { mode: "set", onHand: 3, version: 1 });
    const read = async (user: Who) =>
      (await user.client.from("inventory_stock_status").select("product_id"))
        .data ?? [];
    expect((await read(fx.manager)).length).toBeGreaterThan(0);
    expect(await read(fx.server1)).toEqual([]);
    expect(await read(fx.outsider)).toEqual([]);
    const ledgerRead = async (user: Who) =>
      (await user.client.from("inventory_adjustments").select("id")).data ?? [];
    expect((await ledgerRead(fx.owner)).length).toBeGreaterThan(0);
    expect(await ledgerRead(fx.server1)).toEqual([]);
  });

  it("clients cannot write stock or the ledger directly", async () => {
    const product = await createProduct("Direct vodka");
    const upd = await fx.manager.client
      .from("inventory_stock")
      .update({ on_hand: 99 })
      .eq("product_id", product);
    expect(upd.error).not.toBeNull();
    const ins = await fx.manager.client.from("inventory_adjustments").insert({
      organization_id: org,
      location_id: loc,
      product_id: product,
      source: "system",
      reason: "other",
      prev_on_hand: 0,
      new_on_hand: 1,
      prev_backup: 0,
      new_backup: 0,
      status_after: "healthy",
      actor_profile_id: fx.manager.id,
      stock_version_after: 1,
    });
    expect(ins.error).not.toBeNull();
  });
});

describe("ledger and status (BI-ADJ-001..004, BI-CALC-001)", () => {
  it("a count writes stock and one immutable ledger row from the locked values", async () => {
    const product = await createProduct("Ledger vodka");
    const res = await adjust(fx.manager, product, {
      mode: "set",
      onHand: 6,
      backup: 3,
      reason: "stock_count",
      note: "weekly",
      version: 1,
    });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ changed: true, version: 2, total: 9 });

    const rows = await ledger(product);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      prev_on_hand: 0,
      new_on_hand: 6,
      prev_backup: 0,
      new_backup: 3,
      delta_total: 9,
      source: "count",
      reason: "stock_count",
      status_after: "no_cutoff",
      actor_profile_id: fx.manager.id,
      stock_version_after: 2,
    });

    const tamper = await fx.admin
      .from("inventory_adjustments")
      .update({ note: "rewritten" })
      .eq("product_id", product);
    expect(tamper.error?.code).toBe("23514");
  });

  it("the status view matches the golden worked example", async () => {
    const product = await createProduct("Status vodka");
    expect((await levels(fx.manager, product, 4, 6, 12, 1)).data).toBe(2);
    await adjust(fx.manager, product, {
      mode: "set",
      onHand: 2,
      backup: 1,
      version: 2,
    });
    const { data } = await fx.manager.client
      .from("inventory_stock_status")
      .select("total, effective_warning, status, suggested_order, order_needed")
      .eq("product_id", product)
      .eq("location_id", loc)
      .single();
    expect(data).toEqual({
      total: 3,
      effective_warning: 6,
      status: "critical",
      suggested_order: 9,
      order_needed: false,
    });
  });

  it("status_after and cutoff_at_time are frozen on the ledger row", async () => {
    const product = await createProduct("Frozen vodka");
    await levels(fx.manager, product, 4, 6, 12, 1);
    await adjust(fx.manager, product, { mode: "set", onHand: 1, version: 2 });
    await levels(fx.manager, product, 1, 2, 12, 3);
    const rows = await ledger(product);
    expect(rows[0]).toMatchObject({
      status_after: "critical",
      cutoff_at_time: 4,
    });
  });
});

describe("concurrency (BI-ADJ-005..008)", () => {
  it("a stale set is PT409 with the current values; nothing is overwritten", async () => {
    const product = await createProduct("Stale vodka");
    await adjust(fx.manager, product, { mode: "set", onHand: 5, version: 1 });
    const stale = await adjust(fx.owner, product, {
      mode: "set",
      onHand: 9,
      version: 1,
    });
    expect(stale.error?.code).toBe("PT409");
    expect(detailOf(stale)).toMatchObject({
      kind: "stale",
      entity: "stock",
      current_version: 2,
      on_hand: 5,
    });
    expect((await stockRow(product)).on_hand).toBe(5);
  });

  it("an identical set is a no-op and writes nothing (retry / double submit)", async () => {
    const product = await createProduct("Retry vodka");
    await adjust(fx.manager, product, {
      mode: "set",
      onHand: 4,
      backup: 2,
      version: 1,
    });
    const again = await adjust(fx.manager, product, {
      mode: "set",
      onHand: 4,
      backup: 2,
      version: 1,
    });
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ changed: false, version: 2 });
    expect(await ledger(product)).toHaveLength(1);
  });

  it("two managers racing the same version: exactly one set wins", async () => {
    const product = await createProduct("Race set vodka");
    const [a, b] = await Promise.all([
      adjust(fx.owner, product, { mode: "set", onHand: 7, version: 1 }),
      adjust(fx.manager, product, { mode: "set", onHand: 8, version: 1 }),
    ]);
    expect([a, b].map((r) => (r.error ? r.error.code : "ok")).sort()).toEqual([
      "PT409",
      "ok",
    ]);
    expect(await ledger(product)).toHaveLength(1);
  });

  it("parallel deltas both land and the total is exact", async () => {
    const product = await createProduct("Race delta vodka");
    await adjust(fx.manager, product, { mode: "set", onHand: 10, version: 1 });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        adjust(i % 2 ? fx.owner : fx.manager, product, {
          mode: "delta",
          onHand: 1,
          backup: 0.5,
          reason: "delivery_restock",
        }),
      ),
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    const row = await stockRow(product);
    expect(row.on_hand).toBe(16);
    expect(row.backup).toBe(3);
    expect(row.total).toBe(19);
    // initial set + six deltas, each with previous values from the locked row
    const rows = await ledger(product);
    expect(rows).toHaveLength(7);
    const chain = rows.map((r) => [r.prev_on_hand, r.new_on_hand]);
    for (let i = 1; i < chain.length; i++)
      expect(chain[i][0]).toBe(chain[i - 1][1]);
  });

  it("parallel deltas never take a count below zero", async () => {
    const product = await createProduct("Floor vodka");
    await adjust(fx.manager, product, { mode: "set", onHand: 2, version: 1 });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        adjust(fx.manager, product, {
          mode: "delta",
          onHand: -1,
          reason: "usage",
        }),
      ),
    );
    const ok = results.filter((r) => r.error === null).length;
    expect(ok).toBe(2);
    expect(results.filter((r) => r.error?.code === "22023")).toHaveLength(2);
    expect((await stockRow(product)).on_hand).toBe(0);
  });
});

describe("validation (BI-ADJ-009, BI-CALC-003)", () => {
  it("rejects bad reasons, decimals, negatives and bad levels", async () => {
    const product = await createProduct("Validation vodka");
    expect(
      (
        await adjust(fx.manager, product, {
          mode: "delta",
          onHand: 1,
          reason: "sold",
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (await adjust(fx.manager, product, { mode: "delta", onHand: 1.234 }))
        .error?.code,
    ).toBe("22023");
    expect(
      (
        await adjust(fx.manager, product, {
          mode: "set",
          onHand: -1,
          version: 1,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (await adjust(fx.manager, product, { mode: "set", version: 1 })).error
        ?.code,
    ).toBe("22023");
    expect((await levels(fx.manager, product, 6, 4, null, 1)).error?.code).toBe(
      "22023",
    );
    expect(
      (await levels(fx.manager, product, -1, null, null, 1)).error?.code,
    ).toBe("22023");
    expect(await ledger(product)).toHaveLength(0);
  });

  it("archived products cannot be adjusted", async () => {
    const product = await createProduct("Archived vodka");
    await fx.manager.client.rpc("inventory_product_set_active", {
      ...base(),
      p_product_id: product,
      p_active: false,
      p_expected_version: 1,
    });
    expect(
      (
        await adjust(fx.manager, product, {
          mode: "delta",
          onHand: 1,
          reason: "usage",
        })
      ).error?.code,
    ).toBe("22023");
    const { data } = await fx.manager.client
      .from("inventory_stock_status")
      .select("status")
      .eq("product_id", product)
      .eq("location_id", loc)
      .single();
    expect(data?.status).toBe("archived");
  });

  it("level changes are versioned and change-logged; identical levels are a no-op", async () => {
    const product = await createProduct("Levels vodka");
    expect((await levels(fx.manager, product, 4, 6, 12, 1)).data).toBe(2);
    expect((await levels(fx.manager, product, 4, 6, 12, 1)).data).toBe(2);
    expect((await levels(fx.owner, product, 5, 6, 12, 1)).error?.code).toBe(
      "PT409",
    );
    const { data } = await fx.admin
      .from("inventory_change_log")
      .select("action, diff")
      .eq("entity_type", "stock_levels")
      .eq("entity_id", product);
    expect(data).toHaveLength(1);
  });
});
