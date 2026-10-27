/**
 * Bar Inventory V1 / BI-8c -- real-mode import batch and commit scenarios
 * (hosted DEV only). Every call goes through a synthetic user's own JWT via
 * PostgREST, so argument handling (every named argument present), RLS and the
 * SECURITY DEFINER boundaries apply exactly as in the app. The cases a single
 * pgTAP connection cannot prove are here: a genuine double-submit race.
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

async function createProduct(name: string, size = "750 mL"): Promise<string> {
  const res = await fx.manager.client.rpc("inventory_product_create", {
    ...base(),
    p_vendor_id: faust,
    p_name: name,
    p_category_id: null,
    p_subcategory_id: null,
    p_size: size,
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
  });
  expect(res.error).toBeNull();
  return res.data as string;
}

async function setCount(product: string, onHand: number, version: number) {
  const res = await fx.manager.client.rpc("inventory_stock_adjust", {
    ...base(),
    p_product_id: product,
    p_mode: "set",
    p_on_hand: onHand,
    p_backup: null,
    p_reason: "stock_count",
    p_note: null,
    p_expected_version: version,
  });
  expect(res.error).toBeNull();
}

const stage = (
  user: Who,
  requestId: string,
  plan: unknown,
  reason = "stock_count",
): Promise<Rpc> =>
  user.client.rpc("inventory_import_stage", {
    ...base(),
    p_request_id: requestId,
    p_filename: "stock.csv",
    p_format: "csv",
    p_sheet: null,
    p_reason: reason,
    p_plan: plan,
  }) as unknown as Promise<Rpc>;

const commit = (user: Who, batch: string): Promise<Rpc> =>
  user.client.rpc("inventory_import_commit", {
    ...base(),
    p_batch_id: batch,
  }) as unknown as Promise<Rpc>;

const uuid = () => crypto.randomUUID();

async function stockRow(product: string) {
  const { data, error } = await fx.admin
    .from("inventory_stock")
    .select("on_hand, backup, version")
    .eq("product_id", product)
    .eq("location_id", loc)
    .single();
  if (error) throw new Error(error.message);
  return data as { on_hand: number; backup: number; version: number };
}

async function ledgerFor(batch: string) {
  const { data } = await fx.admin
    .from("inventory_adjustments")
    .select("source, reason, import_batch_id, product_id, actor_profile_id")
    .eq("import_batch_id", batch);
  return (data ?? []) as Record<string, unknown>[];
}

const updatePlan = (product: string, version: number, onHand: number) => ({
  summary: { rows: 1, created: 0, updated: 1, skipped: 0, errors: 0 },
  rows: [
    {
      row: 2,
      action: "update",
      product_id: product,
      expected_stock_version: version,
      set_product: false,
      on_hand: onHand,
      backup: null,
      cutoff: null,
      warning: null,
      par: null,
    },
  ],
});

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
  // Batches, the ledger and the change log are tied to the organization:
  // teardown removes the organizations (cascade) before the memberships.
  await fx.teardown();
});

describe("access (BI-IMP-AUTH)", () => {
  it("staff and other tenants cannot stage or commit, and see no batches", async () => {
    const product = await createProduct("Access gin");
    const plan = updatePlan(product, 1, 3);
    const batch = (await stage(fx.manager, uuid(), plan)).data as string;
    for (const user of [fx.server1, fx.outsider]) {
      expect((await stage(user, uuid(), plan)).error?.code).toBe("42501");
      expect((await commit(user, batch)).error?.code).toBe("42501");
      const read = await user.client
        .from("inventory_import_batches")
        .select("id");
      expect(read.data ?? []).toEqual([]);
    }
    const mine = await fx.manager.client
      .from("inventory_import_batches")
      .select("id, status")
      .eq("id", batch)
      .single();
    expect(mine.data).toMatchObject({ id: batch, status: "staged" });
  });

  it("clients cannot write batches directly", async () => {
    const write = await fx.manager.client
      .from("inventory_import_batches")
      .insert({ organization_id: org });
    expect(write.error).not.toBeNull();
  });
});

describe("commit (BI-IMP-COM)", () => {
  it("applies the staged plan through the audited path with the batch id", async () => {
    const product = await createProduct("Commit vodka");
    const plan = {
      summary: { rows: 3, created: 1, updated: 1, skipped: 1, errors: 0 },
      vendors: [{ ref: "v1", name: "Hosted Dist" }],
      categories: [{ ref: "c1", name: "Hosted Wine" }],
      subcategories: [
        { ref: "s1", name: "Hosted Red", category: { ref: "c1" } },
      ],
      rows: [
        {
          row: 2,
          action: "create",
          vendor: { ref: "v1" },
          category: { ref: "c1" },
          subcategory: { ref: "s1" },
          name: "Hosted Malbec",
          size: "750 mL",
          unit_type: "bottle",
          unit_label: null,
          sku: "HOSTED-1",
          notes: null,
          on_hand: 6,
          backup: 2,
          cutoff: 3,
          warning: null,
          par: 10,
        },
        {
          row: 3,
          action: "update",
          product_id: product,
          expected_stock_version: (await stockRow(product)).version,
          set_product: false,
          on_hand: 8,
          backup: null,
          cutoff: null,
          warning: null,
          par: null,
        },
      ],
    };
    const staged = await stage(fx.manager, uuid(), plan);
    expect(staged.error).toBeNull();
    const batch = staged.data as string;

    const done = await commit(fx.manager, batch);
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({
      ok: true,
      created: 1,
      updated: 1,
      vendors_created: 1,
      categories_created: 1,
      subcategories_created: 1,
      ledger_rows: 2,
    });
    expect(await stockRow(product)).toMatchObject({ on_hand: 8 });
    const rows = await ledgerFor(batch);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "bulk_import")).toBe(true);
    expect(rows.every((r) => r.reason === "stock_count")).toBe(true);
    expect(rows.every((r) => r.actor_profile_id === fx.manager.id)).toBe(true);

    const read = await fx.manager.client
      .from("inventory_import_batches")
      .select("status, created_count, updated_count")
      .eq("id", batch)
      .single();
    expect(read.data).toMatchObject({
      status: "committed",
      created_count: 1,
      updated_count: 1,
    });
  });

  it("a replayed commit answers 'already' and writes nothing again", async () => {
    const product = await createProduct("Replay rum");
    const batch = (await stage(fx.manager, uuid(), updatePlan(product, 1, 4)))
      .data as string;
    expect((await commit(fx.manager, batch)).error).toBeNull();
    const before = (await ledgerFor(batch)).length;
    const again = await commit(fx.manager, batch);
    expect(again.data).toMatchObject({ ok: true, already: true });
    expect(await ledgerFor(batch)).toHaveLength(before);
  });

  it("staging with the same request id returns the same batch", async () => {
    const product = await createProduct("Idem tequila");
    const request = uuid();
    const first = await stage(fx.manager, request, updatePlan(product, 1, 2));
    const second = await stage(fx.manager, request, updatePlan(product, 1, 2));
    expect(first.error).toBeNull();
    expect(second.data).toBe(first.data);
  });
});

describe("double submit (BI-IMP-IDEM)", () => {
  it("two simultaneous commits of one batch apply it exactly once", async () => {
    const product = await createProduct("Race whisky");
    const batch = (await stage(fx.manager, uuid(), updatePlan(product, 1, 7)))
      .data as string;
    const [a, b] = await Promise.all([
      commit(fx.manager, batch),
      commit(fx.manager, batch),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const answers = [a.data, b.data] as Record<string, unknown>[];
    expect(answers.every((r) => r.ok === true)).toBe(true);
    expect(answers.filter((r) => r.already === true)).toHaveLength(1);
    expect(await ledgerFor(batch)).toHaveLength(1);
    expect(await stockRow(product)).toMatchObject({ on_hand: 7 });
  });

  it("two simultaneous stages with one request id make one batch", async () => {
    const product = await createProduct("Race beer");
    const request = uuid();
    const plan = updatePlan(product, 1, 2);
    const [a, b] = await Promise.all([
      stage(fx.manager, request, plan),
      stage(fx.manager, request, plan),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data).toBe(b.data);
    const { data } = await fx.admin
      .from("inventory_import_batches")
      .select("id")
      .eq("request_id", request);
    expect(data).toHaveLength(1);
  });
});

describe("conflicts and atomicity (BI-IMP-CON, BI-IMP-ATM)", () => {
  it("a count changed after the preview is a conflict: nothing is applied", async () => {
    const product = await createProduct("Conflict cognac");
    const planned = (await stockRow(product)).version;
    const plan = {
      ...updatePlan(product, planned, 1),
      vendors: [{ ref: "v1", name: "Hosted Ghost" }],
    };
    const batch = (await stage(fx.manager, uuid(), plan)).data as string;
    await setCount(product, 12, planned); // someone counts it first

    const result = await commit(fx.manager, batch);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      ok: false,
      conflicts: [{ row: 2, kind: "stock" }],
    });
    expect(await stockRow(product)).toMatchObject({ on_hand: 12 });
    const { data: vendors } = await fx.admin
      .from("inventory_vendors")
      .select("id")
      .eq("organization_id", org)
      .eq("name", "Hosted Ghost");
    expect(vendors).toEqual([]);
    const read = await fx.manager.client
      .from("inventory_import_batches")
      .select("status")
      .eq("id", batch)
      .single();
    expect(read.data).toMatchObject({ status: "staged" });
  });

  it("one refused row rolls the whole import back", async () => {
    await createProduct("Dupe brandy", "1 L");
    const plan = {
      summary: { rows: 2, created: 2, updated: 0, skipped: 0, errors: 0 },
      vendors: [{ ref: "v1", name: "Hosted Rollback" }],
      rows: [
        {
          row: 2,
          action: "create",
          vendor: { ref: "v1" },
          name: "Hosted Fresh",
          size: "1 L",
          unit_type: "bottle",
          unit_label: null,
          sku: null,
          notes: null,
          on_hand: 5,
          backup: null,
          cutoff: null,
          warning: null,
          par: null,
        },
        {
          row: 3,
          action: "create",
          vendor: { id: faust },
          name: "Dupe brandy",
          size: "1 L",
          unit_type: "bottle",
          unit_label: null,
          sku: null,
          notes: null,
          on_hand: 1,
          backup: null,
          cutoff: null,
          warning: null,
          par: null,
        },
      ],
    };
    const batch = (await stage(fx.manager, uuid(), plan)).data as string;
    const result = await commit(fx.manager, batch);
    expect(result.error).not.toBeNull();
    const { data: products } = await fx.admin
      .from("inventory_products")
      .select("id")
      .eq("organization_id", org)
      .eq("name", "Hosted Fresh");
    expect(products).toEqual([]);
    expect(await ledgerFor(batch)).toEqual([]);
  });
});
