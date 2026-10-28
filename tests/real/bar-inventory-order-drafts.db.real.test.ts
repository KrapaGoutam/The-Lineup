/**
 * Vendor Order Drafts V1 / VOD-4 -- real-mode scenarios (hosted DEV only).
 * Scenario ids (VOD-xxx) match docs/features/bar-inventory-vendor-order-drafts-v1/
 * TEST_MATRIX.md. Every call goes through a synthetic user's own JWT via
 * PostgREST (real RLS, grants and SECURITY DEFINER boundaries); the service
 * role is used only to arrange fixtures and to read the truth back. Everything
 * lives in the harness's own throwaway organization, removed by cascade.
 *
 * The Sent-history reads run the REAL data layer (getSentOrderDraftsPage /
 * getActiveOrderDrafts / getOrderDraftById) with the manager's JWT client, so
 * the app's paging query is proven against the real database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createFixture, env, type Fixture } from "./support/harness";

const ctx = vi.hoisted(() => ({
  client: null as unknown,
  roster: [] as { id: string; name: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ctx.client,
}));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: async () => ctx.roster,
}));

import {
  getActiveOrderDrafts,
  getOrderDraftById,
  getSentOrderDraftsPage,
} from "@/features/bar-inventory/data/order-draft-data";
import { SENT_PAGE_SIZE } from "@/features/bar-inventory/domain/order-draft-sent";

type Who = Fixture["owner"];
type Rpc = {
  data: unknown;
  error: { message: string; code?: string; details?: string | null } | null;
};

let fx: Fixture;
let org: string;
let loc: string;
let unassigned: string;
let assistant: Who;
let staff: Who;

const base = () => ({ p_organization_id: org, p_location_id: loc });
const detailOf = (rpc: Rpc) =>
  rpc.error?.details ? JSON.parse(rpc.error.details) : null;
const asJson = (rpc: Rpc) => rpc.data as Record<string, unknown>;

type Line = {
  product_id: string;
  order_qty: number | null;
  item_note: string | null;
  included: boolean;
};
const line = (
  product: string,
  qty: number | null,
  note: string | null = null,
  included = true,
): Line => ({
  product_id: product,
  order_qty: qty,
  item_note: note,
  included,
});

const call = (user: Who, name: string, args: Record<string, unknown>) =>
  user.client.rpc(name, { ...base(), ...args }) as unknown as Promise<Rpc>;
const open = (user: Who, vendor: string) =>
  call(user, "inventory_order_draft_open", { p_vendor_id: vendor });
const save = (
  user: Who,
  draft: string,
  version: number,
  lines: Line[],
  vendorNote: string | null = null,
) =>
  call(user, "inventory_order_draft_save", {
    p_draft_id: draft,
    p_expected_version: version,
    p_vendor_note: vendorNote,
    p_lines: lines,
  });
const fill = (user: Who, draft: string, version: number, mode: string) =>
  call(user, "inventory_order_draft_fill", {
    p_draft_id: draft,
    p_expected_version: version,
    p_mode: mode,
  });
const clear = (user: Who, draft: string, version: number) =>
  call(user, "inventory_order_draft_clear", {
    p_draft_id: draft,
    p_expected_version: version,
  });
const sync = (user: Who, draft: string, version: number) =>
  call(user, "inventory_order_draft_sync", {
    p_draft_id: draft,
    p_expected_version: version,
  });
const markSent = (user: Who, draft: string, version: number) =>
  call(user, "inventory_order_draft_mark_sent", {
    p_draft_id: draft,
    p_expected_version: version,
  });

/** PostgREST with a hand-written body, so `6.00` reaches the database as 6.00. */
async function rawSave(
  user: Who,
  draft: string,
  version: number,
  body: string,
) {
  const session = (await user.client.auth.getSession()).data.session!;
  const res = await fetch(`${env.url}/rest/v1/rpc/inventory_order_draft_save`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: `{"p_organization_id":"${org}","p_location_id":"${loc}","p_draft_id":"${draft}","p_expected_version":${version},"p_vendor_note":null,"p_lines":${body}}`,
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

async function draftRow(id: string) {
  const { data, error } = await fx.admin
    .from("inventory_order_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> & { version: number; status: string };
}
async function itemRow(draft: string, product: string) {
  const { data, error } = await fx.admin
    .from("inventory_order_draft_items")
    .select("*")
    .eq("draft_id", draft)
    .eq("product_id", product)
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}
async function items(draft: string) {
  const { data } = await fx.admin
    .from("inventory_order_draft_items")
    .select("*")
    .eq("draft_id", draft);
  return (data ?? []) as Record<string, unknown>[];
}
const qtyOf = async (draft: string, product: string) => {
  const q = (await itemRow(draft, product)).order_qty;
  return q === null ? null : Number(q);
};

async function createVendor(name: string): Promise<string> {
  const res = await fx.manager.client.rpc("inventory_vendor_create", {
    ...base(),
    p_name: name,
    p_notes: null,
  });
  expect(res.error).toBeNull();
  return res.data as string;
}

async function createProduct(
  vendor: string,
  name: string,
  opts: {
    cutoff: number;
    warning: number;
    par: number | null;
    onHand: number;
    backup?: number;
    size?: string;
  },
): Promise<string> {
  const created = await fx.manager.client.rpc("inventory_product_create", {
    ...base(),
    p_vendor_id: vendor,
    p_name: name,
    p_category_id: null,
    p_subcategory_id: null,
    p_size: opts.size ?? "750 mL",
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
  });
  expect(created.error).toBeNull();
  const id = created.data as string;
  const lv = await fx.manager.client.rpc("inventory_stock_set_levels", {
    ...base(),
    p_product_id: id,
    p_cutoff: opts.cutoff,
    p_warning: opts.warning,
    p_par: opts.par,
    p_expected_version: 1,
  });
  expect(lv.error).toBeNull();
  const adj = await fx.manager.client.rpc("inventory_stock_adjust", {
    ...base(),
    p_product_id: id,
    p_mode: "set",
    p_on_hand: opts.onHand,
    p_backup: opts.backup ?? 0,
    p_reason: "stock_count",
    p_note: null,
    p_expected_version: lv.data as number,
  });
  expect(adj.error).toBeNull();
  return id;
}

/** Everything Mark Sent must leave alone. */
async function inventoryState() {
  const stock = await fx.admin
    .from("inventory_stock")
    .select(
      "product_id, location_id, on_hand, backup, total, version, last_adjusted_at, updated_at",
    )
    .eq("organization_id", org)
    .order("product_id")
    .order("location_id");
  const ledger = await fx.admin
    .from("inventory_adjustments")
    .select("id")
    .eq("organization_id", org)
    .order("id", { ascending: false });
  const changeLog = await fx.admin
    .from("inventory_change_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org);
  const products = await fx.admin
    .from("inventory_products")
    .select("id, name, version, active")
    .eq("organization_id", org)
    .order("id");
  return {
    stock: stock.data,
    ledgerCount: ledger.data?.length ?? 0,
    ledgerMaxId: ledger.data?.[0]?.id ?? null,
    changeLogCount: changeLog.count,
    products: products.data,
  };
}

type StockRows = Record<string, unknown>[] | null;
/** Readable differences between two stock snapshots (empty when identical). */
function stockDiff(after: StockRows, before: StockRows): string[] {
  const byId = (rows: StockRows) =>
    new Map((rows ?? []).map((r) => [`${r.product_id}@${r.location_id}`, r]));
  const a = byId(after);
  const b = byId(before);
  const out: string[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id);
    const y = b.get(id);
    if (!x || !y) {
      out.push(`${id}: ${x ? "appeared" : "disappeared"}`);
      continue;
    }
    for (const key of Object.keys(y)) {
      if (JSON.stringify(x[key]) !== JSON.stringify(y[key])) {
        out.push(`${id}.${key}: ${String(y[key])} -> ${String(x[key])}`);
      }
    }
  }
  return out;
}

// Main-flow catalog.
let vMain: string;
let pA: string; // critical, par 12 -> suggested 9
let pB: string; // critical, NO par -> "order needed"
let pC: string; // healthy -> not seeded
let pD: string; // low, par 10 -> suggested 5, formula-leading name
let mainDraft: string;
let mainVersion = 1;

beforeAll(async () => {
  fx = await createFixture();
  org = fx.orgId;
  loc = fx.locA;
  staff = fx.server1;
  // server3 plays the Assistant Manager (shift_manager); everyone else keeps
  // the harness roles (owner / general_manager / server).
  assistant = fx.server3;
  const roleUpdate = await fx.admin
    .from("memberships")
    .update({ roles: ["shift_manager"] })
    .eq("organization_id", org)
    .eq("profile_id", assistant.id);
  expect(roleUpdate.error).toBeNull();

  const boot = await fx.manager.client.rpc("inventory_bootstrap", base());
  expect(boot.error).toBeNull();
  unassigned = boot.data as string;

  ctx.roster = [fx.owner, fx.manager, assistant].map((u) => ({
    id: u.id,
    name: u.name,
  }));

  vMain = await createVendor("VOD4 Main Vendor");
  pA = await createProduct(vMain, "VOD4 Alpha Vodka", {
    cutoff: 4,
    warning: 6,
    par: 12,
    onHand: 2,
    backup: 1,
  });
  pB = await createProduct(vMain, "VOD4 Beta Gin", {
    cutoff: 4,
    warning: 6,
    par: null,
    onHand: 3,
    size: "1 L",
  });
  pC = await createProduct(vMain, "VOD4 Gamma Rum", {
    cutoff: 2,
    warning: 4,
    par: 10,
    onHand: 9,
  });
  pD = await createProduct(vMain, "=VOD4 Delta Whisky", {
    cutoff: 2,
    warning: 6,
    par: 10,
    onHand: 4,
    backup: 1,
  });
});

afterAll(async () => {
  if (!fx) return;
  // Sent history and the ledger clear only by cascade from the organization;
  // the harness removes organizations before memberships.
  await fx.teardown();
});

// ---------------------------------------------------------------------
describe("access matrix (VOD-091/093/094)", () => {
  it("Owner, Manager and Assistant Manager each create -> edit -> send on their own vendor", async () => {
    for (const [who, label] of [
      [fx.owner, "Owner"],
      [fx.manager, "Manager"],
      [assistant, "Assistant"],
    ] as const) {
      const vendor = await createVendor(`VOD4 ${label} Vendor`);
      const product = await createProduct(vendor, `VOD4 ${label} Item`, {
        cutoff: 2,
        warning: 4,
        par: 8,
        onHand: 1,
      });
      const opened = await open(who, vendor);
      expect(opened.error, `${label} open`).toBeNull();
      const draft = opened.data as string;
      const saved = await save(
        who,
        draft,
        1,
        [line(product, 3, `${label} note`)],
        `${label} vendor note`,
      );
      expect(saved.error, `${label} save`).toBeNull();
      expect(asJson(saved)).toMatchObject({ changed: true, version: 2 });
      const sent = await markSent(who, draft, 2);
      expect(sent.error, `${label} mark sent`).toBeNull();
      expect(asJson(sent)).toMatchObject({
        status: "sent",
        changed: true,
        version: 3,
      });
      const row = await draftRow(draft);
      expect(row).toMatchObject({ status: "sent", sent_by: who.id });
    }
  });

  it("Staff are denied by every RPC and read nothing (server-authoritative, not UI)", async () => {
    // Needs a real draft id; use a throwaway vendor/draft.
    const vendor = await createVendor("VOD4 Staff Probe Vendor");
    const product = await createProduct(vendor, "VOD4 Probe Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const draft = (await open(fx.manager, vendor)).data as string;
    for (const user of [staff, fx.server2]) {
      expect((await open(user, vendor)).error?.code).toBe("42501");
      expect((await save(user, draft, 1, [line(product, 1)])).error?.code).toBe(
        "42501",
      );
      expect((await fill(user, draft, 1, "empty_only")).error?.code).toBe(
        "42501",
      );
      expect((await clear(user, draft, 1)).error?.code).toBe("42501");
      expect((await sync(user, draft, 1)).error?.code).toBe("42501");
      expect((await markSent(user, draft, 1)).error?.code).toBe("42501");
      const drafts = await user.client
        .from("inventory_order_drafts")
        .select("id");
      const rows = await user.client
        .from("inventory_order_draft_items")
        .select("id");
      expect(drafts.data ?? []).toEqual([]);
      expect(rows.data ?? []).toEqual([]);
    }
    // Anonymous callers get nothing either.
    expect(
      (
        await fx.anon.rpc("inventory_order_draft_open", {
          ...base(),
          p_vendor_id: vendor,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await fx.anon.from("inventory_order_drafts").select("id")).data ?? [],
    ).toEqual([]);
    // Nothing changed.
    expect((await draftRow(draft)).version).toBe(1);
    // Staff cannot see Sent history either.
    const sentRead = await staff.client
      .from("inventory_order_drafts")
      .select("id")
      .eq("status", "sent");
    expect(sentRead.data ?? []).toEqual([]);
  });

  it("clients cannot write the tables directly, even as a manager (no grant)", async () => {
    const vendor = await createVendor("VOD4 Direct Vendor");
    const draft = (await open(fx.manager, vendor)).data as string;
    for (const user of [fx.manager, fx.owner]) {
      expect(
        (
          await user.client
            .from("inventory_order_drafts")
            .update({ vendor_note: "x" })
            .eq("id", draft)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await user.client
            .from("inventory_order_drafts")
            .delete()
            .eq("id", draft)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await user.client
            .from("inventory_order_draft_items")
            .insert({ draft_id: draft })
        ).error,
      ).not.toBeNull();
    }
    expect((await draftRow(draft)).vendor_note).toBeNull();
  });

  it("Suggested Order is not writable through the save RPC", async () => {
    const vendor = await createVendor("VOD4 Suggested Vendor");
    const product = await createProduct(vendor, "VOD4 Suggested Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const draft = (await open(fx.manager, vendor)).data as string;
    const forged = await call(fx.manager, "inventory_order_draft_save", {
      p_draft_id: draft,
      p_expected_version: 1,
      p_vendor_note: null,
      p_lines: [{ ...line(product, 1), suggested_qty: 999 }],
    });
    expect(forged.error?.code).toBe("22023");
    expect((await itemRow(draft, product)).suggested_qty).not.toBe(999);
  });
});

// ---------------------------------------------------------------------
describe("tenant and location isolation (VOD-090/092)", () => {
  it("another organization's manager can read and mutate nothing", async () => {
    const vendor = await createVendor("VOD4 Iso Vendor");
    const product = await createProduct(vendor, "VOD4 Iso Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const draft = (await open(fx.manager, vendor)).data as string;

    const outsider = fx.outsider;
    // Org A ids with an outsider JWT: refused at the access seam.
    expect((await open(outsider, vendor)).error?.code).toBe("42501");
    expect(
      (await save(outsider, draft, 1, [line(product, 5)])).error?.code,
    ).toBe("42501");
    expect((await markSent(outsider, draft, 1)).error?.code).toBe("42501");
    // The outsider's OWN org/location but A's draft id: not available.
    const own = {
      p_organization_id: fx.otherOrgId,
      p_location_id: fx.otherLoc,
    };
    for (const [name, args] of [
      [
        "inventory_order_draft_save",
        {
          p_draft_id: draft,
          p_expected_version: 1,
          p_vendor_note: null,
          p_lines: [line(product, 5)],
        },
      ],
      [
        "inventory_order_draft_fill",
        { p_draft_id: draft, p_expected_version: 1, p_mode: "replace_all" },
      ],
      [
        "inventory_order_draft_clear",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
      [
        "inventory_order_draft_sync",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
      [
        "inventory_order_draft_mark_sent",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
    ] as const) {
      const res = (await outsider.client.rpc(name, {
        ...own,
        ...args,
      })) as unknown as Rpc;
      expect(res.error?.code, name).toBe("22023");
    }
    // A forged vendor id from org A under the outsider's own org.
    const forgedVendor = (await outsider.client.rpc(
      "inventory_order_draft_open",
      { ...own, p_vendor_id: vendor },
    )) as unknown as Rpc;
    expect(forgedVendor.error?.code).toBe("22023");
    // RLS: zero rows for the foreign tenant.
    expect(
      (await outsider.client.from("inventory_order_drafts").select("id"))
        .data ?? [],
    ).toEqual([]);
    expect(
      (await outsider.client.from("inventory_order_draft_items").select("id"))
        .data ?? [],
    ).toEqual([]);
    expect(await draftRow(draft)).toMatchObject({
      version: 1,
      status: "draft",
    });
  });

  it("a draft is bound to one location: org A's second location cannot touch it", async () => {
    const vendor = await createVendor("VOD4 Loc Vendor");
    const product = await createProduct(vendor, "VOD4 Loc Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const draft = (await open(fx.manager, vendor)).data as string;
    const otherLocArgs = { p_organization_id: org, p_location_id: fx.locB };
    for (const [name, args] of [
      [
        "inventory_order_draft_save",
        {
          p_draft_id: draft,
          p_expected_version: 1,
          p_vendor_note: null,
          p_lines: [line(product, 5)],
        },
      ],
      [
        "inventory_order_draft_fill",
        { p_draft_id: draft, p_expected_version: 1, p_mode: "replace_all" },
      ],
      [
        "inventory_order_draft_clear",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
      [
        "inventory_order_draft_sync",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
      [
        "inventory_order_draft_mark_sent",
        { p_draft_id: draft, p_expected_version: 1 },
      ],
    ] as const) {
      const res = (await fx.manager.client.rpc(name, {
        ...otherLocArgs,
        ...args,
      })) as unknown as Rpc;
      expect(res.error?.code, name).toBe("22023");
    }
    // A foreign location id (another org's) is refused at the access seam.
    const foreign = (await fx.manager.client.rpc("inventory_order_draft_open", {
      p_organization_id: org,
      p_location_id: fx.otherLoc,
      p_vendor_id: vendor,
    })) as unknown as Rpc;
    expect(foreign.error).not.toBeNull();
    expect(await draftRow(draft)).toMatchObject({
      version: 1,
      status: "draft",
    });
    // Location B has no draft for this vendor: opening there is a separate draft.
    const bOpen = (await fx.manager.client.rpc("inventory_order_draft_open", {
      p_organization_id: org,
      p_location_id: fx.locB,
      p_vendor_id: vendor,
    })) as unknown as Rpc;
    expect(bOpen.error).toBeNull();
    expect(bOpen.data).not.toBe(draft);
  });
});

// ---------------------------------------------------------------------
describe("create / open (VOD-001/002/003/004/006)", () => {
  it("seeds only the vendor's Critical/Low items; reopen returns the same draft", async () => {
    const opened = await open(fx.manager, vMain);
    expect(opened.error).toBeNull();
    mainDraft = opened.data as string;
    const rows = await items(mainDraft);
    expect(rows.map((r) => r.product_id).sort()).toEqual([pA, pB, pD].sort());
    expect(rows.find((r) => r.product_id === pC)).toBeUndefined();
    const a = await itemRow(mainDraft, pA);
    expect(a).toMatchObject({
      status_at_snapshot: "critical",
      product_name: "VOD4 Alpha Vodka",
    });
    expect(Number(a.suggested_qty)).toBe(9);
    const b = await itemRow(mainDraft, pB);
    expect(b.suggested_qty).toBeNull(); // no Par -> "Order needed", never a number
    expect(b.order_qty).toBeNull();
    expect(Number((await itemRow(mainDraft, pD)).suggested_qty)).toBe(5);
    // Order Qty starts blank everywhere.
    expect(rows.every((r) => r.order_qty === null)).toBe(true);

    expect((await open(fx.manager, vMain)).data).toBe(mainDraft);
    expect((await open(fx.owner, vMain)).data).toBe(mainDraft);
    expect((await draftRow(mainDraft)).version).toBe(1);
  });

  it("many simultaneous opens by three managers converge on one active DRAFT", async () => {
    const vendor = await createVendor("VOD4 Race Vendor");
    await createProduct(vendor, "VOD4 Race Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const results = await Promise.all(
      [fx.owner, fx.manager, assistant, fx.owner, fx.manager, assistant].map(
        (u) => open(u, vendor),
      ),
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(new Set(results.map((r) => r.data)).size).toBe(1);
    const active = await fx.admin
      .from("inventory_order_drafts")
      .select("id", { count: "exact" })
      .eq("vendor_id", vendor)
      .eq("status", "draft");
    expect(active.count).toBe(1);
    const lines = await items(results[0].data as string);
    expect(lines).toHaveLength(1); // seeded once, not once per racer
  });

  it("the database refuses a second active DRAFT by direct insert", async () => {
    const dup = await fx.admin.from("inventory_order_drafts").insert({
      organization_id: org,
      location_id: loc,
      vendor_id: vMain,
      vendor_name: "VOD4 Main Vendor",
      created_by: fx.manager.id,
      updated_by: fx.manager.id,
    });
    expect(dup.error?.code).toBe("23505");
  });

  it("Unassigned and other-tenant vendors cannot have a draft", async () => {
    const un = await open(fx.manager, unassigned);
    expect(un.error?.code).toBe("22023");
    expect(un.error?.message).toMatch(/Assign a vendor/);
    const foreignVendor = await fx.outsider.client.rpc(
      "inventory_vendor_create",
      {
        p_organization_id: fx.otherOrgId,
        p_location_id: fx.otherLoc,
        p_name: "VOD4 Foreign",
        p_notes: null,
      },
    );
    expect(
      (await open(fx.manager, foreignVendor.data as string)).error?.code,
    ).toBe("22023");
  });
});

// ---------------------------------------------------------------------
describe("Order Qty persistence -- VOD-1.1 regression (VOD-013/043/046)", () => {
  const step = async (qty: number | null, expectChanged: boolean) => {
    const res = await save(fx.manager, mainDraft, mainVersion, [line(pA, qty)]);
    expect(res.error).toBeNull();
    const body = asJson(res);
    expect(body.changed).toBe(expectChanged);
    if (expectChanged) mainVersion += 1;
    expect(body.version).toBe(mainVersion);
    expect(await qtyOf(mainDraft, pA)).toBe(qty);
    expect((await draftRow(mainDraft)).version).toBe(mainVersion);
  };

  it("blank -> 5 persists, bumps the version and stamps the actor", async () => {
    const before = await draftRow(mainDraft);
    await step(5, true);
    const after = await draftRow(mainDraft);
    expect(after.updated_by).toBe(fx.manager.id);
    expect(
      new Date(after.updated_at as string).getTime(),
    ).toBeGreaterThanOrEqual(new Date(before.updated_at as string).getTime());
  });

  it("5 -> 5 is a true no-op (no version bump, no error)", async () => {
    await step(5, false);
  });

  it("5 -> 6 persists", async () => {
    await step(6, true);
  });

  it("6 vs 6.00 is the same number: no-op, even when the JSON carries 6.00", async () => {
    const raw = await rawSave(
      fx.manager,
      mainDraft,
      mainVersion,
      JSON.stringify([line(pA, 6)]).replace(
        '"order_qty":6',
        '"order_qty":6.00',
      ),
    );
    expect(raw.status).toBe(200);
    expect(raw.body).toMatchObject({ changed: false, version: mainVersion });
    expect(await qtyOf(mainDraft, pA)).toBe(6);
  });

  it("blank -> 0 persists as 0 (not null)", async () => {
    const res = await save(fx.manager, mainDraft, mainVersion, [line(pB, 0)]);
    expect(res.error).toBeNull();
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pB)).toBe(0);
  });

  it("6 -> blank persists as null", async () => {
    await step(null, true);
    // And back, so later tests start from a known value.
    await step(5, true);
  });

  it("equal quantities on different lines are judged per line", async () => {
    // A = D = 7, then change ONLY D: the change must persist (the VOD-1.1 defect
    // compared against the last parsed value).
    let res = await save(fx.manager, mainDraft, mainVersion, [
      line(pA, 7),
      line(pD, 7),
    ]);
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    res = await save(fx.manager, mainDraft, mainVersion, [
      line(pA, 7),
      line(pD, 8),
    ]);
    expect(res.error).toBeNull();
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pA)).toBe(7);
    expect(await qtyOf(mainDraft, pD)).toBe(8);
    // Now change only A (first line).
    res = await save(fx.manager, mainDraft, mainVersion, [
      line(pA, 8),
      line(pD, 8),
    ]);
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pA)).toBe(8);
    expect(await qtyOf(mainDraft, pD)).toBe(8);
  });

  it("invalid quantities are refused with the item name; nothing is applied", async () => {
    // 10,000,000,000 is past the 9,999,999,999.99 cap.
    for (const bad of [-1, 1.234, 1e10]) {
      const res = await save(fx.manager, mainDraft, mainVersion, [
        line(pA, bad),
      ]);
      expect(res.error?.code, String(bad)).toBe("22023");
      expect(res.error?.message).toContain("VOD4 Alpha Vodka");
    }
    const text = await call(fx.manager, "inventory_order_draft_save", {
      p_draft_id: mainDraft,
      p_expected_version: mainVersion,
      p_vendor_note: null,
      p_lines: [{ ...line(pA, null), order_qty: "abc" }],
    });
    expect(text.error?.code).toBe("22023");
    expect(await qtyOf(mainDraft, pA)).toBe(8);
    expect((await draftRow(mainDraft)).version).toBe(mainVersion);
  });

  it("the value survives a reload (fresh read through the manager's own RLS)", async () => {
    const read = await fx.manager.client
      .from("inventory_order_draft_items")
      .select("order_qty")
      .eq("draft_id", mainDraft)
      .eq("product_id", pA)
      .single();
    expect(Number(read.data?.order_qty)).toBe(8);
  });
});

// ---------------------------------------------------------------------
describe("notes and Include/Exclude (VOD-014/015)", () => {
  it("item and vendor notes: trim edges, keep newlines, empty -> null, limits refuse", async () => {
    const note = '  first line\nsecond "quoted" line, ok  ';
    let res = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 8, note)],
      "  Dock B\nCall on arrival 🙂  ",
    );
    expect(res.error).toBeNull();
    mainVersion += 1;
    expect((await itemRow(mainDraft, pA)).item_note).toBe(
      'first line\nsecond "quoted" line, ok',
    );
    expect((await draftRow(mainDraft)).vendor_note).toBe(
      "Dock B\nCall on arrival 🙂",
    );

    // Whitespace-only and empty become null.
    res = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 8, "   ")],
      "",
    );
    expect(res.error).toBeNull();
    mainVersion += 1;
    expect((await itemRow(mainDraft, pA)).item_note).toBeNull();
    expect((await draftRow(mainDraft)).vendor_note).toBeNull();

    // Limits are refused, never truncated.
    const longItem = await save(fx.manager, mainDraft, mainVersion, [
      line(pA, 8, "x".repeat(201)),
    ]);
    expect(longItem.error?.code).toBe("22023");
    const longVendor = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 8)],
      "y".repeat(1001),
    );
    expect(longVendor.error?.code).toBe("22023");
    // Exactly at the limits is accepted.
    res = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 8, "x".repeat(200))],
      "y".repeat(1000),
    );
    expect(res.error).toBeNull();
    mainVersion += 1;
    expect(((await itemRow(mainDraft, pA)).item_note as string).length).toBe(
      200,
    );
    expect(((await draftRow(mainDraft)).vendor_note as string).length).toBe(
      1000,
    );
    // Reset notes.
    res = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 8, null)],
      null,
    );
    mainVersion += 1;
  });

  it("Include = false persists and survives reload; the line stays", async () => {
    let res = await save(fx.manager, mainDraft, mainVersion, [
      line(pB, 0, null, false),
    ]);
    expect(res.error).toBeNull();
    mainVersion += 1;
    const read = await fx.manager.client
      .from("inventory_order_draft_items")
      .select("included, product_id")
      .eq("draft_id", mainDraft);
    expect(read.data?.find((r) => r.product_id === pB)?.included).toBe(false);
    expect(read.data).toHaveLength(3);
    res = await save(fx.manager, mainDraft, mainVersion, [
      line(pB, 0, null, true),
    ]);
    mainVersion += 1;
    expect((await itemRow(mainDraft, pB)).included).toBe(true);
  });
});

// ---------------------------------------------------------------------
describe("Clear, Fill, Update Suggestions (VOD-008/030/031/032)", () => {
  it("Clear resets quantities, notes, Included and vendor note; keeps lines, snapshots and stock", async () => {
    const res0 = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 3, "keep?", false), line(pB, 2), line(pD, 4, "note")],
      "vendor says hi",
    );
    expect(res0.error).toBeNull();
    mainVersion += 1;
    const stockBefore = await inventoryState();
    const snapshotsBefore = (await items(mainDraft))
      .map((r) => [
        r.product_id,
        r.suggested_qty,
        r.total_at_snapshot,
        r.status_at_snapshot,
      ])
      .sort();
    const res = await clear(fx.manager, mainDraft, mainVersion);
    expect(res.error).toBeNull();
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    const rows = await items(mainDraft);
    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        (r) =>
          r.order_qty === null && r.item_note === null && r.included === true,
      ),
    ).toBe(true);
    expect((await draftRow(mainDraft)).vendor_note).toBeNull();
    expect((await draftRow(mainDraft)).status).toBe("draft");
    expect(
      rows
        .map((r) => [
          r.product_id,
          r.suggested_qty,
          r.total_at_snapshot,
          r.status_at_snapshot,
        ])
        .sort(),
    ).toEqual(snapshotsBefore);
    expect(await inventoryState()).toEqual(stockBefore);
    // A second Clear is a no-op.
    const again = await clear(fx.manager, mainDraft, mainVersion);
    expect(asJson(again)).toMatchObject({
      changed: false,
      version: mainVersion,
    });
  });

  it("Fill (empty only) copies numeric suggestions; the no-Par line stays blank", async () => {
    const res = await fill(fx.manager, mainDraft, mainVersion, "empty_only");
    expect(res.error).toBeNull();
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pA)).toBe(9);
    expect(await qtyOf(mainDraft, pD)).toBe(5);
    expect(await qtyOf(mainDraft, pB)).toBeNull();
    const again = await fill(fx.manager, mainDraft, mainVersion, "empty_only");
    expect(asJson(again).changed).toBe(false);
  });

  it("a typed quantity survives empty-only; only the explicit replace-all overwrites it", async () => {
    let res = await save(fx.manager, mainDraft, mainVersion, [line(pA, 3)]);
    expect(res.error).toBeNull();
    mainVersion += 1;
    res = await fill(fx.manager, mainDraft, mainVersion, "empty_only");
    expect(asJson(res).changed).toBe(false);
    expect(await qtyOf(mainDraft, pA)).toBe(3);
    // A NULL / unknown mode is never treated as confirmation.
    const bad = await call(fx.manager, "inventory_order_draft_fill", {
      p_draft_id: mainDraft,
      p_expected_version: mainVersion,
      p_mode: null,
    });
    expect(bad.error?.code).toBe("22023");
    expect(await qtyOf(mainDraft, pA)).toBe(3);
    res = await fill(fx.manager, mainDraft, mainVersion, "replace_all");
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pA)).toBe(9);
  });

  it("Update suggestions re-stamps snapshots and appends new items; manager planning is untouched", async () => {
    // Manager planning to preserve.
    let res = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 4, "my note", false), line(pB, 2)],
      "plan vendor note",
    );
    expect(res.error).toBeNull();
    mainVersion += 1;
    // Inventory moves: A gets even lower, C (healthy) becomes low.
    const adjA = await fx.manager.client.rpc("inventory_stock_adjust", {
      ...base(),
      p_product_id: pA,
      p_mode: "set",
      p_on_hand: 0,
      p_backup: 0,
      p_reason: "stock_count",
      p_note: null,
      p_expected_version: 3,
    });
    expect(adjA.error).toBeNull();
    const adjC = await fx.manager.client.rpc("inventory_stock_adjust", {
      ...base(),
      p_product_id: pC,
      p_mode: "set",
      p_on_hand: 3,
      p_backup: 0,
      p_reason: "stock_count",
      p_note: null,
      p_expected_version: 3,
    });
    expect(adjC.error).toBeNull();
    // Inventory changes never rewrite a stored suggestion or Order Qty by themselves.
    expect(Number((await itemRow(mainDraft, pA)).suggested_qty)).toBe(9);

    res = await sync(fx.manager, mainDraft, mainVersion);
    expect(res.error).toBeNull();
    expect(asJson(res).changed).toBe(true);
    mainVersion += 1;
    const a = await itemRow(mainDraft, pA);
    expect(Number(a.suggested_qty)).toBe(12); // re-stamped: par 12 - total 0
    expect(Number(a.total_at_snapshot)).toBe(0);
    expect(Number(a.order_qty)).toBe(4); // untouched
    expect(a.item_note).toBe("my note");
    expect(a.included).toBe(false);
    expect((await draftRow(mainDraft)).vendor_note).toBe("plan vendor note");
    const c = await itemRow(mainDraft, pC); // appended
    expect(c.status_at_snapshot).toBe("low");
    expect(c.order_qty).toBeNull();
    expect(await qtyOf(mainDraft, pB)).toBe(2);
    // Nothing further to refresh -> no-op.
    expect(asJson(await sync(fx.manager, mainDraft, mainVersion)).changed).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------
describe("real two-context concurrency (VOD-040/041/076)", () => {
  it("stale save from the second manager is PT409 `stale`; nothing is applied; reload + reapply works", async () => {
    const aLoaded = mainVersion; // both contexts load the same version
    const bLoaded = mainVersion;
    const first = await save(fx.owner, mainDraft, aLoaded, [line(pD, 6)]);
    expect(first.error).toBeNull();
    mainVersion += 1;

    const stale = await save(fx.manager, mainDraft, bLoaded, [
      line(pD, 99),
      line(pB, 77),
    ]);
    expect(stale.error?.code).toBe("PT409");
    expect(detailOf(stale)).toMatchObject({
      kind: "stale",
      entity: "order_draft",
      id: mainDraft,
      current_version: mainVersion,
    });
    // A did not get overwritten and B's lines were not partially applied.
    expect(await qtyOf(mainDraft, pD)).toBe(6);
    expect(await qtyOf(mainDraft, pB)).toBe(2);
    expect((await draftRow(mainDraft)).version).toBe(mainVersion);
    expect((await draftRow(mainDraft)).updated_by).toBe(fx.owner.id);

    // Deliberate reload/reapply: re-send B's own change on top of the latest.
    const reapply = await save(fx.manager, mainDraft, mainVersion, [
      line(pB, 77),
    ]);
    expect(reapply.error).toBeNull();
    mainVersion += 1;
    expect(await qtyOf(mainDraft, pB)).toBe(77);
    expect(await qtyOf(mainDraft, pD)).toBe(6); // A's edit survives
  });

  it("two saves racing the same version: exactly one wins, the other is PT409", async () => {
    const v = mainVersion;
    const [x, y] = await Promise.all([
      save(fx.owner, mainDraft, v, [line(pD, 10)]),
      save(assistant, mainDraft, v, [line(pD, 11)]),
    ]);
    const outcomes = [x, y].map((r) => r.error?.code ?? "ok").sort();
    expect(outcomes).toEqual(["PT409", "ok"]);
    mainVersion += 1;
    expect((await draftRow(mainDraft)).version).toBe(mainVersion);
    expect([10, 11]).toContain(await qtyOf(mainDraft, pD));
  });

  it("stale Mark Sent: the second manager must reload; the draft stays DRAFT", async () => {
    const reviewed = mainVersion; // Assistant reviews this version
    const edit = await save(fx.manager, mainDraft, reviewed, [line(pA, 5)]);
    expect(edit.error).toBeNull();
    mainVersion += 1;
    const stale = await markSent(assistant, mainDraft, reviewed);
    expect(stale.error?.code).toBe("PT409");
    expect(detailOf(stale)).toMatchObject({
      kind: "stale",
      entity: "order_draft",
    });
    const row = await draftRow(mainDraft);
    expect(row).toMatchObject({
      status: "draft",
      version: mainVersion,
      sent_by: null,
      sent_at: null,
    });
  });

  it("a stale fill, clear and sync are PT409 too", async () => {
    const stale = mainVersion - 1;
    // Give Update suggestions real work (stock moved), otherwise it is a no-op.
    const adjD = await fx.manager.client.rpc("inventory_stock_adjust", {
      ...base(),
      p_product_id: pD,
      p_mode: "set",
      p_on_hand: 3,
      p_backup: 1,
      p_reason: "stock_count",
      p_note: null,
      p_expected_version: 3,
    });
    expect(adjD.error).toBeNull();
    expect(
      (await fill(assistant, mainDraft, stale, "replace_all")).error?.code,
    ).toBe("PT409");
    expect((await clear(assistant, mainDraft, stale)).error?.code).toBe(
      "PT409",
    );
    expect((await sync(assistant, mainDraft, stale)).error?.code).toBe("PT409");
    expect((await draftRow(mainDraft)).version).toBe(mainVersion);
  });
});

// ---------------------------------------------------------------------
describe("Mark Sent: no inventory mutation, immutability, retry, new draft, frozen labels (VOD-070..077, 082)", () => {
  let sentAtFacts: { sent_by: unknown; sent_at: unknown; version: number };
  let before: Awaited<ReturnType<typeof inventoryState>>;
  let newDraft: string;

  it("refuses a draft with no included quantity", async () => {
    const vendor = await createVendor("VOD4 Empty Vendor");
    await createProduct(vendor, "VOD4 Empty Item", {
      cutoff: 2,
      warning: 4,
      par: 8,
      onHand: 1,
    });
    const draft = (await open(fx.manager, vendor)).data as string;
    const res = await markSent(fx.manager, draft, 1);
    expect(res.error?.code).toBe("22023");
    expect(res.error?.message).toMatch(/Add a quantity/);
    expect((await draftRow(draft)).status).toBe("draft");
  });

  it("Mark Sent records the send and changes no stock, no stock version and no ledger row", async () => {
    // Make the order have an included line with quantity > 0 and a note.
    const prep = await save(
      fx.manager,
      mainDraft,
      mainVersion,
      [line(pA, 5, "frozen note"), line(pD, 2)],
      "send vendor note",
    );
    expect(prep.error).toBeNull();
    mainVersion += 1;

    before = await inventoryState();
    expect(before.ledgerCount).toBeGreaterThan(0);

    const res = await markSent(fx.manager, mainDraft, mainVersion);
    expect(res.error).toBeNull();
    expect(asJson(res)).toMatchObject({
      status: "sent",
      changed: true,
      version: mainVersion + 1,
      sent_by: fx.manager.name,
    });
    mainVersion += 1;
    const row = await draftRow(mainDraft);
    expect(row).toMatchObject({
      status: "sent",
      sent_by: fx.manager.id,
      version: mainVersion,
    });
    expect(row.sent_at).not.toBeNull();
    sentAtFacts = {
      sent_by: row.sent_by,
      sent_at: row.sent_at,
      version: row.version,
    };

    const after = await inventoryState();
    // On Hand / Backup / Total / stock versions / last-adjusted all identical.
    expect(stockDiff(after.stock, before.stock)).toEqual([]);
    expect(after.ledgerCount).toBe(before.ledgerCount);
    expect(after.ledgerMaxId).toBe(before.ledgerMaxId);
    expect(after.changeLogCount).toBe(before.changeLogCount);
    expect(after.products).toEqual(before.products);
  });

  it("a Sent order is immutable through every RPC and by direct privileged writes", async () => {
    const v = mainVersion;
    expect(
      (await save(fx.manager, mainDraft, v, [line(pA, 99)])).error?.code,
    ).toBe("23514");
    expect(
      (await fill(fx.manager, mainDraft, v, "replace_all")).error?.code,
    ).toBe("23514");
    expect((await clear(fx.manager, mainDraft, v)).error?.code).toBe("23514");
    expect((await sync(fx.manager, mainDraft, v)).error?.code).toBe("23514");
    // Not even the service role can rewrite or delete history.
    expect(
      (
        await fx.admin
          .from("inventory_order_drafts")
          .update({ vendor_note: "tamper" })
          .eq("id", mainDraft)
      ).error?.code,
    ).toBe("23514");
    expect(
      (
        await fx.admin
          .from("inventory_order_draft_items")
          .update({ order_qty: 1 })
          .eq("draft_id", mainDraft)
      ).error?.code,
    ).toBe("23514");
    expect(
      (
        await fx.admin
          .from("inventory_order_drafts")
          .delete()
          .eq("id", mainDraft)
      ).error?.code,
    ).toBe("23514");
    expect(
      (
        await fx.admin
          .from("inventory_order_draft_items")
          .delete()
          .eq("draft_id", mainDraft)
      ).error?.code,
    ).toBe("23514");
    expect(
      (
        await fx.admin.from("inventory_order_draft_items").insert({
          draft_id: mainDraft,
          organization_id: org,
          location_id: loc,
          product_id: pC,
          total_at_snapshot: 0,
          status_at_snapshot: "low",
          product_name: "x",
          unit: "Bottle",
        })
      ).error?.code,
    ).toBe("23514");
    const row = await draftRow(mainDraft);
    expect(row).toMatchObject(sentAtFacts);
    expect(row.vendor_note).toBe("send vendor note");
    expect(await qtyOf(mainDraft, pA)).toBe(5);
  });

  it("Mark Sent is idempotent: a retry or a second manager returns the first send's facts", async () => {
    const again = await markSent(fx.manager, mainDraft, mainVersion);
    expect(again.error).toBeNull();
    expect(asJson(again)).toMatchObject({
      status: "sent",
      changed: false,
      version: mainVersion,
      sent_by: fx.manager.name,
    });
    // A second manager, even with a stale reviewed version, sees the same facts.
    const other = await markSent(assistant, mainDraft, 1);
    expect(other.error).toBeNull();
    expect(asJson(other)).toMatchObject({
      changed: false,
      sent_by: fx.manager.name,
      version: mainVersion,
    });
    expect(await draftRow(mainDraft)).toMatchObject(sentAtFacts);
    const sentCount = await fx.admin
      .from("inventory_order_drafts")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vMain)
      .eq("status", "sent");
    expect(sentCount.count).toBe(1);
    expect(stockDiff((await inventoryState()).stock, before.stock)).toEqual([]);
  });

  it("catalog changes after sending leave the Sent order untouched (frozen labels)", async () => {
    const frozenBefore = (await items(mainDraft))
      .map((r) => [r.product_id, r.product_name, r.size, r.unit, r.sku])
      .sort();
    const draftBefore = await draftRow(mainDraft);
    // Rename + archive product A, rename the vendor, change Par, re-vendor nothing.
    const productA = await fx.admin
      .from("inventory_products")
      .select("version")
      .eq("id", pA)
      .single();
    const rename = await fx.manager.client.rpc("inventory_product_update", {
      ...base(),
      p_product_id: pA,
      p_vendor_id: vMain,
      p_name: "VOD4 Alpha RENAMED",
      p_category_id: null,
      p_subcategory_id: null,
      p_size: "1 L",
      p_unit_type: "bottle",
      p_unit_label: null,
      p_sku: "SKU-NEW",
      p_notes: null,
      p_expected_version: productA.data!.version,
    });
    expect(rename.error).toBeNull();
    const archive = await fx.manager.client.rpc(
      "inventory_product_set_active",
      {
        ...base(),
        p_product_id: pA,
        p_active: false,
        p_expected_version: productA.data!.version + 1,
      },
    );
    expect(archive.error).toBeNull();
    const vendorRow = await fx.admin
      .from("inventory_vendors")
      .select("version")
      .eq("id", vMain)
      .single();
    const vrename = await fx.manager.client.rpc("inventory_vendor_update", {
      ...base(),
      p_vendor_id: vMain,
      p_name: "VOD4 Main Vendor RENAMED",
      p_notes: null,
      p_expected_version: vendorRow.data!.version,
    });
    expect(vrename.error).toBeNull();

    expect(
      (await items(mainDraft))
        .map((r) => [r.product_id, r.product_name, r.size, r.unit, r.sku])
        .sort(),
    ).toEqual(frozenBefore);
    const draftAfter = await draftRow(mainDraft);
    expect(draftAfter.vendor_name).toBe("VOD4 Main Vendor");
    expect(draftAfter).toMatchObject({
      version: draftBefore.version,
      sent_at: draftBefore.sent_at,
    });
  });

  it("a NEW draft for the same vendor opens after Sent, from current stock, with nothing carried over", async () => {
    const opened = await open(fx.manager, vMain);
    expect(opened.error).toBeNull();
    newDraft = opened.data as string;
    expect(newDraft).not.toBe(mainDraft);
    const row = await draftRow(newDraft);
    expect(row).toMatchObject({
      status: "draft",
      version: 1,
      vendor_name: "VOD4 Main Vendor RENAMED",
      vendor_note: null,
    });
    const lines = await items(newDraft);
    // A is archived (excluded); B, C, D are Critical/Low now.
    expect(lines.map((r) => r.product_id).sort()).toEqual([pB, pC, pD].sort());
    expect(
      lines.every(
        (r) =>
          r.order_qty === null && r.item_note === null && r.included === true,
      ),
    ).toBe(true);
    // Exactly one active DRAFT and one SENT for the vendor.
    const all = await fx.admin
      .from("inventory_order_drafts")
      .select("id, status")
      .eq("vendor_id", vMain);
    expect((all.data ?? []).map((r) => r.status).sort()).toEqual([
      "draft",
      "sent",
    ]);
    // The old Sent record is still byte-for-byte what was sent.
    expect(await draftRow(mainDraft)).toMatchObject(sentAtFacts);
    expect(await qtyOf(mainDraft, pA)).toBe(5);
  });
});

// ---------------------------------------------------------------------
describe("real data layer: active drafts, draft by id, Sent history + paging (VOD-080)", () => {
  it("getActiveOrderDrafts / getOrderDraftById obey RLS and location binding", async () => {
    ctx.client = fx.manager.client;
    const active = await getActiveOrderDrafts(org, loc);
    expect(active).not.toBeNull();
    expect(active!.every((d) => d.status === "draft")).toBe(true);
    expect(
      active!.some((d) => d.vendorName === "VOD4 Main Vendor RENAMED"),
    ).toBe(true);

    const sent = await getOrderDraftById(org, loc, mainDraft);
    expect(sent.failed).toBe(false);
    expect(sent.draft).toMatchObject({
      status: "sent",
      vendorName: "VOD4 Main Vendor",
      sentByName: fx.manager.name,
    });
    expect(sent.draft!.lines.find((l) => l.productId === pA)).toMatchObject({
      name: "VOD4 Alpha Vodka",
      size: "750 mL",
      orderQty: 5,
      itemNote: "frozen note",
    });

    // Another location of the same org: the draft does not exist there.
    expect((await getOrderDraftById(org, fx.locB, mainDraft)).draft).toBeNull();
    // Staff and the foreign owner read nothing.
    for (const user of [staff, fx.outsider]) {
      ctx.client = user.client;
      expect((await getOrderDraftById(org, loc, mainDraft)).draft).toBeNull();
      expect(await getActiveOrderDrafts(org, loc)).toEqual([]);
      const page = await getSentOrderDraftsPage(org, loc, 0);
      expect(page).toMatchObject({ total: 0, drafts: [] });
    }
  });

  it("20 per page, exact count, newest first, every order once -- past 1,000 rows", async () => {
    ctx.client = fx.manager.client;
    // Arrange a long history cheaply (service role, DEV throwaway org): 1,050
    // Sent rows on a separate vendor, spread over distinct send times.
    const bulkVendor = await createVendor("VOD4 Bulk Vendor");
    const start = Date.parse("2026-01-01T00:00:00Z");
    const rows = Array.from({ length: 1050 }, (_, i) => ({
      organization_id: org,
      location_id: loc,
      vendor_id: bulkVendor,
      vendor_name: "VOD4 Bulk Vendor",
      status: "sent",
      version: 2,
      created_by: fx.manager.id,
      updated_by: fx.manager.id,
      sent_by: fx.manager.id,
      sent_at: new Date(start + i * 60_000).toISOString(),
    }));
    for (let at = 0; at < rows.length; at += 250) {
      // Arrangement only: retry a transport hiccup, but never hide a database
      // error (a retried insert that partly landed would show up in the count).
      let message: string | null = "not run";
      for (let attempt = 0; attempt < 3 && message !== null; attempt++) {
        const ins = await fx.admin
          .from("inventory_order_drafts")
          .insert(rows.slice(at, at + 250));
        message = ins.error
          ? `${ins.error.code ?? ""} ${ins.error.message}`.trim()
          : null;
        if (message && ins.error?.code) break; // a real database error
      }
      expect(message).toBeNull();
    }
    const truth = await fx.admin
      .from("inventory_order_drafts")
      .select("id", { count: "exact", head: true })
      .eq("location_id", loc)
      .eq("status", "sent");
    const total = truth.count!;
    expect(total).toBeGreaterThan(1000);

    const first = await getSentOrderDraftsPage(org, loc, 0);
    expect(first).not.toBeNull();
    expect(first!.total).toBe(total);
    expect(first!.pageSize).toBe(SENT_PAGE_SIZE);
    expect(first!.drafts).toHaveLength(SENT_PAGE_SIZE);

    const seen = new Set<string>();
    let previous = Number.POSITIVE_INFINITY;
    const pages = Math.ceil(total / SENT_PAGE_SIZE);
    for (let p = 0; p < pages; p++) {
      const page = await getSentOrderDraftsPage(org, loc, p);
      expect(page, `page ${p}`).not.toBeNull();
      expect(page!.page).toBe(p);
      expect(page!.drafts).toHaveLength(
        p === pages - 1 ? total - p * SENT_PAGE_SIZE : SENT_PAGE_SIZE,
      );
      for (const d of page!.drafts) {
        expect(seen.has(d.id), "an order appears on two pages").toBe(false);
        seen.add(d.id);
        const at = Date.parse(d.sentAt!);
        expect(at).toBeLessThanOrEqual(previous);
        previous = at;
      }
    }
    expect(seen.size).toBe(total);

    // Past the end clamps to the last page.
    const beyond = await getSentOrderDraftsPage(org, loc, pages + 7);
    expect(beyond!.page).toBe(pages - 1);
    // Newest order sits first on page 0; the real Mark Sent from earlier is 'now', newer than 2026-01.
    expect(first!.drafts[0].vendorName).not.toBe("VOD4 Bulk Vendor");
  }, 180_000);

  it("the Sent summary carries vendor, sender, line count and planned total", async () => {
    ctx.client = fx.manager.client;
    const sent = await getOrderDraftById(org, loc, mainDraft);
    const page = await getSentOrderDraftsPage(org, loc, 0);
    const summary = page!.drafts.find((d) => d.id === mainDraft)!;
    // Ordered lines at send time: A=5, B=77 (re-applied in the concurrency
    // test), D=2 -> 3 lines, planned total 84. C was never given a quantity.
    expect(summary).toMatchObject({
      vendorName: "VOD4 Main Vendor",
      sentByName: fx.manager.name,
      lineCount: 3,
      plannedTotal: 84,
    });
    expect(Date.parse(summary.sentAt)).toBe(Date.parse(sent.draft!.sentAt!));
  });
});
