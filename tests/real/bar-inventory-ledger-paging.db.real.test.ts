/**
 * Bar Inventory V1 / BI-11 -- the ledger past the API's response cap (hosted
 * DEV only). A single read asking for 5,001 rows returns 1,000 (PostgREST
 * `max_rows`), which silently truncated History, Analytics and the ledger
 * exports. The paged keyset read (ledger-paging.ts) must return every row
 * exactly once, newest first, including rows that share a timestamp. Rows are
 * seeded with the service role into a synthetic organization that the harness
 * removes (cascade) afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  collectLedger,
  olderThan,
  type LedgerCursor,
} from "@/features/bar-inventory/domain/ledger-paging";

import { createFixture, type Fixture } from "./support/harness";

const TOTAL = 2300;

let fx: Fixture;
let org: string;
let loc: string;
let product: string;

type Row = { id: number; created_at: string };

const COLUMNS = "id, created_at";

/** The same query shape the data layer uses, through the manager's own JWT. */
async function fetchPage(cursor: LedgerCursor | null, size: number) {
  let query = fx.manager.client
    .from("inventory_adjustments")
    .select(COLUMNS)
    .eq("organization_id", org)
    .eq("location_id", loc)
    .eq("product_id", product);
  if (cursor) query = query.or(olderThan(cursor));
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(size);
  if (error) throw new Error(error.message);
  return data as Row[];
}

beforeAll(async () => {
  fx = await createFixture();
  org = fx.orgId;
  loc = fx.locA;
  const base = { p_organization_id: org, p_location_id: loc };
  await fx.manager.client.rpc("inventory_bootstrap", base);
  const vendor = await fx.manager.client.rpc("inventory_vendor_create", {
    ...base,
    p_name: "Faust",
    p_notes: null,
  });
  expect(vendor.error).toBeNull();
  const made = await fx.manager.client.rpc("inventory_product_create", {
    ...base,
    p_vendor_id: vendor.data as string,
    p_name: "Paging Gin",
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

  // 2,300 ledger rows; every third shares a timestamp with its neighbours
  // (so the id tie-break matters) and each has microsecond precision.
  const start = Date.UTC(2026, 0, 1);
  const rows = Array.from({ length: TOTAL }, (_, i) => {
    const at = new Date(start + Math.floor(i / 3) * 1000);
    return {
      organization_id: org,
      location_id: loc,
      product_id: product,
      source: "manual_edit",
      reason: "stock_count",
      prev_on_hand: i,
      new_on_hand: i + 1,
      prev_backup: 0,
      new_backup: 0,
      status_after: "healthy",
      actor_profile_id: fx.manager.id,
      created_at: at.toISOString().replace("Z", "123+00:00"),
      stock_version_after: i + 1,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await fx.admin
      .from("inventory_adjustments")
      .insert(rows.slice(i, i + 500));
    expect(error).toBeNull();
  }
}, 180_000);

afterAll(async () => {
  if (!fx) return;
  await fx.teardown();
});

describe("the ledger past the API cap (BI-HIST, BI-ANL)", () => {
  it("a single read of 5,001 rows is cut to the API cap -- the reason paging exists", async () => {
    const { data, error } = await fx.manager.client
      .from("inventory_adjustments")
      .select(COLUMNS)
      .eq("product_id", product)
      .order("id", { ascending: false })
      .limit(5001);
    expect(error).toBeNull();
    expect(data!.length).toBe(1000);
  });

  it("the paged read returns every row once, newest first, across the cap", async () => {
    const rows = (await collectLedger<Row>(fetchPage, 5001))!;
    expect(rows).toHaveLength(TOTAL);
    expect(new Set(rows.map((r) => r.id)).size).toBe(TOTAL);
    for (let i = 1; i < rows.length; i += 1) {
      const a = rows[i - 1];
      const b = rows[i];
      const ordered =
        a.created_at > b.created_at ||
        (a.created_at === b.created_at && a.id > b.id);
      expect(ordered).toBe(true);
    }
  });

  it("asking for fewer than exist returns the limit plus the probe row", async () => {
    const rows = (await collectLedger<Row>(fetchPage, 1501))!;
    expect(rows).toHaveLength(1501);
  });

  it("a cursor taken from a row with shared timestamps neither repeats nor skips its neighbours", async () => {
    const first = (await fetchPage(null, 1000))[999];
    const next = await fetchPage(
      { createdAt: first.created_at, id: first.id },
      5,
    );
    const direct = await fx.manager.client
      .from("inventory_adjustments")
      .select(COLUMNS)
      .eq("product_id", product)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(1000, 1004);
    expect(next.map((r) => r.id)).toEqual(
      (direct.data as Row[]).map((r) => r.id),
    );
  });
});
