/**
 * V2-005.006-E real-JWT suite: physical storage + transactional Date Group import.
 *
 * Every call below goes through PostgREST with a token that local GoTrue issued
 * to a real (synthetic) user, so the live-session check (auth.sessions + banned_until),
 * RLS, grants and SECURITY DEFINER boundaries all apply exactly as in the browser.
 * Local mode only (LINEUP_REAL_LOCAL=1, restaurant-roster on 127.0.0.1:54321):
 * hosted DEV is never touched by this file.
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createFixture,
  env,
  type Fixture,
  type TestUser,
} from "./support/harness";

if (process.env.LINEUP_REAL_LOCAL !== "1") {
  throw new Error(
    "bar-inventory-storage real suite runs against the LOCAL stack only.",
  );
}

let fx: Fixture;
const extras: TestUser[] = [];
let overallRoleProfile: string | null = null;
const runId = crypto.randomBytes(4).toString("hex");

async function extraUser(key: string): Promise<TestUser> {
  const admin = fx.admin;
  const email = `bis-${runId}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`createUser ${key}: ${created.error?.message}`);
  const id = created.data.user.id;
  const name = `BIS ${key} ${runId}`;
  const profile = await admin
    .from("profiles")
    .insert({ id, display_name: name });
  if (profile.error)
    throw new Error(`profile ${key}: ${profile.error.message}`);
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user: TestUser = { id, name, email, password, client };
  extras.push(user);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`sign-in ${key}: ${signed.error.message}`);
  return user;
}

async function orgMember(user: TestUser, roles: string[]) {
  const r = await fx.admin.from("memberships").insert({
    organization_id: fx.orgId,
    profile_id: user.id,
    roles,
    active: true,
  });
  if (r.error) throw new Error(`membership: ${r.error.message}`);
}
async function locRole(
  user: TestUser,
  location: string,
  role: "manager" | "assistant_manager" | "staff",
) {
  const r = await fx.admin
    .from("location_memberships")
    .insert({ location_id: location, profile_id: user.id, role, active: true });
  if (r.error) throw new Error(`location role: ${r.error.message}`);
}

let assistantA: TestUser;
let managerBOnly: TestUser;
let overallManager: TestUser;
let bannedUser: TestUser;
let revokedUser: TestUser;
let vendorId: string;
let productA: string;
let productB: string;

const base = (location = () => fx.locA) => ({
  p_organization_id: fx.orgId,
  p_location_id: location(),
});
const area = (
  user: TestUser,
  over: Record<string, unknown> = {},
  location = fx.locA,
  org = fx.orgId,
) =>
  user.client.rpc("inventory_storage_area_upsert", {
    p_organization_id: org,
    p_location_id: location,
    p_area_id: null,
    p_name: `Cooler ${crypto.randomBytes(3).toString("hex")}`,
    p_kind: "cooler",
    p_display_order: 1,
    p_active: true,
    p_expected_version: null,
    ...over,
  });

async function stockSnapshot() {
  const [stock, adj] = await Promise.all([
    fx.admin
      .from("inventory_stock")
      .select("product_id,location_id,on_hand,backup,version")
      .in("location_id", [fx.locA, fx.locB])
      .order("product_id")
      .order("location_id"),
    fx.admin
      .from("inventory_adjustments")
      .select("id", { head: true, count: "exact" })
      .in("location_id", [fx.locA, fx.locB]),
  ]);
  if (stock.error || adj.error) throw new Error("snapshot failed");
  return JSON.stringify({ stock: stock.data, adjustments: adj.count });
}

beforeAll(async () => {
  fx = await createFixture();
  assistantA = await extraUser("asst-a");
  await orgMember(assistantA, ["server"]);
  await locRole(assistantA, fx.locA, "assistant_manager");
  managerBOnly = await extraUser("mgr-b");
  await orgMember(managerBOnly, ["server"]);
  await locRole(managerBOnly, fx.locB, "manager");
  overallManager = await extraUser("overall");
  const overall = await fx.admin
    .from("overall_roles")
    .insert({ profile_id: overallManager.id, role: "manager" });
  if (overall.error) throw new Error(`overall role: ${overall.error.message}`);
  overallRoleProfile = overallManager.id;
  bannedUser = await extraUser("banned");
  await orgMember(bannedUser, ["server"]);
  await locRole(bannedUser, fx.locA, "manager");
  revokedUser = await extraUser("revoked");
  await orgMember(revokedUser, ["server"]);
  await locRole(revokedUser, fx.locA, "manager");

  const v = await fx.manager.client.rpc("inventory_vendor_create", {
    ...base(),
    p_name: `BIS vendor ${runId}`,
    p_notes: null,
  });
  if (v.error) throw new Error(v.error.message);
  vendorId = v.data as string;
  const mk = async (name: string) => {
    const r = await fx.manager.client.rpc("inventory_product_create", {
      ...base(),
      p_vendor_id: vendorId,
      p_name: name,
      p_category_id: null,
      p_subcategory_id: null,
      p_size: "12 oz",
      p_unit_type: "bottle",
      p_unit_label: null,
      p_sku: null,
      p_notes: null,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data as string;
  };
  productA = await mk(`BIS Bud Light ${runId}`);
  productB = await mk(`BIS Tequila ${runId}`);
  // Authoritative stock the storage tests must never change (set via the ledger RPC).
  for (const [pid, onHand, backup] of [
    [productA, 18, 6],
    [productB, 7, 2],
  ] as const) {
    const r = await fx.manager.client.rpc("inventory_stock_adjust", {
      ...base(),
      p_product_id: pid,
      p_mode: "set",
      p_on_hand: onHand,
      p_backup: backup,
      p_reason: "stock_count",
      p_note: null,
      p_expected_version: 1,
    });
    if (r.error) throw new Error(`stock seed: ${r.error.message}`);
  }
});

afterAll(async () => {
  if (!fx) return;
  // Extras' memberships / location memberships go with the organization teardown.
  await fx.teardown();
  if (overallRoleProfile)
    await fx.admin
      .from("overall_roles")
      .delete()
      .eq("profile_id", overallRoleProfile);
  for (const user of extras) {
    await fx.admin.from("profiles").delete().eq("id", user.id);
    await fx.admin.auth.admin.deleteUser(user.id);
  }
});

describe("storage RPC actor matrix through real GoTrue tokens (direct PostgREST)", () => {
  it.each([
    ["Organization Owner", () => fx.owner],
    ["General Manager", () => fx.manager],
    ["Location Assistant Manager A", () => assistantA],
    ["Overall Manager", () => overallManager],
  ])("%s may manage storage at Location A", async (_label, who) => {
    const r = await area(who());
    expect(r.error).toBeNull();
    expect(typeof r.data).toBe("string");
  });

  it.each([
    ["ordinary Location Staff (server1)", () => fx.server1],
    ["Location Manager B only, targeting Location A", () => managerBOnly],
    ["a foreign-organization owner", () => fx.outsider],
  ])("%s is refused at Location A with 42501", async (_label, who) => {
    const r = await area(who());
    expect(r.error?.code).toBe("42501");
  });

  it("an anonymous (no-session) caller cannot execute any storage RPC", async () => {
    const r = await fx.anon.rpc("inventory_storage_area_upsert", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
      p_area_id: null,
      p_name: "x",
      p_kind: "cooler",
      p_display_order: 1,
      p_active: true,
      p_expected_version: null,
    });
    expect(r.error).not.toBeNull();
    expect(["42501", "PGRST301", "401"]).toContain(
      r.error?.code ?? String(r.status),
    );
  });

  it("the same actor who may write at Location A is refused at a location they do not manage", async () => {
    const r = await area(managerBOnly, {}, fx.locA);
    expect(r.error?.code).toBe("42501");
    const ok = await area(managerBOnly, {}, fx.locB);
    expect(ok.error).toBeNull();
  });

  it("forgery: a valid organization id with another organization's location is refused", async () => {
    const r = await area(fx.outsider, {}, fx.locA, fx.otherOrgId);
    expect(r.error?.code).toBe("42501");
    const r2 = await area(fx.owner, {}, fx.otherLoc, fx.orgId);
    expect(r2.error?.code).toBe("42501");
  });

  it("forgery: an existing area id from another restaurant cannot be hijacked or probed", async () => {
    const mine = await area(
      fx.manager,
      { p_name: `Hijack target ${runId}` },
      fx.locA,
    );
    expect(mine.error).toBeNull();
    const r = await area(
      managerBOnly,
      { p_area_id: mine.data, p_expected_version: 1, p_name: "stolen" },
      fx.locB,
    );
    expect(r.error?.code).toBe("22023");
    const after = await fx.admin
      .from("inventory_storage_areas")
      .select("name")
      .eq("id", mine.data as string)
      .single();
    expect(after.data?.name).toBe(`Hijack target ${runId}`);
  });

  it("a BANNED employee holding a still-valid token is refused (live-session check)", async () => {
    expect((await area(bannedUser)).error).toBeNull();
    const ban = await fx.admin.auth.admin.updateUserById(bannedUser.id, {
      ban_duration: "24h",
    });
    expect(ban.error).toBeNull();
    expect((await area(bannedUser)).error?.code).toBe("42501");
  });

  it("an employee whose SESSION was revoked is refused even though the JWT has not expired", async () => {
    expect((await area(revokedUser)).error).toBeNull();
    const session = await revokedUser.client.auth.getSession();
    const token = session.data.session!.access_token;
    const out = await fx.admin.auth.admin.signOut(token, "global");
    expect(out.error).toBeNull();
    expect((await area(revokedUser)).error?.code).toBe("42501");
  });

  it("an employee whose location access was removed is refused immediately", async () => {
    const temp = await extraUser("temp-revoked");
    await orgMember(temp, ["server"]);
    await locRole(temp, fx.locA, "manager");
    expect((await area(temp)).error).toBeNull();
    const del = await fx.admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", temp.id)
      .eq("location_id", fx.locA);
    expect(del.error).toBeNull();
    expect((await area(temp)).error?.code).toBe("42501");
  });

  it("an inactive location refuses even the organization owner", async () => {
    const off = await fx.admin
      .from("locations")
      .insert({
        organization_id: fx.orgId,
        name: "BIS Inactive",
        time_zone: "America/Chicago",
        active: false,
      })
      .select("id")
      .single();
    expect(off.error).toBeNull();
    const r = await area(fx.owner, {}, off.data!.id);
    expect(r.error?.code).toBe("42501");
    await fx.admin.from("locations").delete().eq("id", off.data!.id);
  });
});

describe("storage reads and direct writes through PostgREST", () => {
  let areaId: string;
  beforeAll(async () => {
    const r = await area(fx.manager, { p_name: `Read target ${runId}` });
    areaId = r.data as string;
  });

  it("a manager of the location reads it; staff, another branch's manager and outsiders read nothing", async () => {
    const mine = await fx.manager.client
      .from("inventory_storage_areas")
      .select("id")
      .eq("id", areaId);
    expect(mine.data).toHaveLength(1);
    for (const who of [fx.server1, managerBOnly, fx.outsider]) {
      const r = await who.client
        .from("inventory_storage_areas")
        .select("id")
        .eq("id", areaId);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    const anon = await fx.anon.from("inventory_storage_areas").select("id");
    expect(anon.error).not.toBeNull();
  });

  it("no client role can INSERT, UPDATE or DELETE the storage tables directly", async () => {
    for (const who of [fx.owner, fx.manager, assistantA]) {
      const ins = await who.client.from("inventory_storage_areas").insert({
        organization_id: fx.orgId,
        location_id: fx.locA,
        name: "direct",
      });
      expect(ins.error?.code).toBe("42501");
      const upd = await who.client
        .from("inventory_storage_areas")
        .update({ name: "direct" })
        .eq("id", areaId);
      expect(upd.error?.code).toBe("42501");
      const del = await who.client
        .from("inventory_storage_areas")
        .delete()
        .eq("id", areaId);
      expect(del.error?.code).toBe("42501");
      const pl = await who.client
        .from("inventory_storage_placements")
        .insert({ organization_id: fx.orgId, location_id: fx.locA });
      expect(pl.error?.code).toBe("42501");
    }
    const still = await fx.admin
      .from("inventory_storage_areas")
      .select("name")
      .eq("id", areaId)
      .single();
    expect(still.data?.name).toBe(`Read target ${runId}`);
  });
});

describe("Option A: placement is organization only, stock never moves", () => {
  it("the whole area/shelf/placement lifecycle leaves every stock row and the ledger identical", async () => {
    const before = await stockSnapshot();
    const mgr = fx.manager.client;
    const a = await area(fx.manager, { p_name: `Lifecycle ${runId}` });
    expect(a.error).toBeNull();
    const s1 = await mgr.rpc("inventory_storage_shelf_upsert", {
      ...base(),
      p_shelf_id: null,
      p_storage_area_id: a.data,
      p_name: "Top",
      p_section_name: "Left",
      p_display_order: 1,
      p_expected_version: null,
    });
    const s2 = await mgr.rpc("inventory_storage_shelf_upsert", {
      ...base(),
      p_shelf_id: null,
      p_storage_area_id: a.data,
      p_name: "Bottom",
      p_section_name: null,
      p_display_order: 2,
      p_expected_version: null,
    });
    expect(s1.error).toBeNull();
    expect(s2.error).toBeNull();
    const place = (
      shelf: unknown,
      product: string,
      extra: Record<string, unknown> = {},
    ) =>
      mgr.rpc("inventory_storage_placement_set", {
        ...base(),
        p_placement_id: null,
        p_storage_area_id: a.data,
        p_shelf_id: shelf,
        p_product_id: product,
        p_slot_number: null,
        p_slot_label: null,
        p_display_order: 1,
        p_expected_version: null,
        ...extra,
      });
    const p1 = await place(s1.data, productA, {
      p_slot_number: 1,
      p_slot_label: "L1",
    });
    const p2 = await place(s2.data, productA); // the SAME product on another shelf
    const p3 = await place(s1.data, productB, { p_slot_number: 2 });
    for (const p of [p1, p2, p3]) expect(p.error).toBeNull();
    // one product, two placements, one stock row
    const rows = await fx.admin
      .from("inventory_storage_placements")
      .select("product_id")
      .eq("product_id", productA);
    expect(rows.data).toHaveLength(2);
    // move, reorder, archive area, restore, delete
    // Move product B (placement p3) to the other shelf; product A already sits there.
    expect(
      (
        await place(s2.data, productB, {
          p_placement_id: p3.data,
          p_slot_number: 5,
          p_expected_version: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await mgr.rpc("inventory_storage_placement_reorder", {
          ...base(),
          p_shelf_id: s1.data,
          p_placement_ids: [p1.data],
        })
      ).error,
    ).toBeNull();
    const areaRow = await fx.admin
      .from("inventory_storage_areas")
      .select("version")
      .eq("id", a.data as string)
      .single();
    expect(
      (
        await mgr.rpc("inventory_storage_area_archive", {
          ...base(),
          p_area_id: a.data,
          p_expected_version: areaRow.data!.version,
        })
      ).error,
    ).toBeNull();
    expect(await stockSnapshot()).toBe(before);
    const placementVersion = await fx.admin
      .from("inventory_storage_placements")
      .select("version")
      .eq("id", p3.data as string)
      .single();
    expect(
      (
        await mgr.rpc("inventory_storage_placement_delete", {
          ...base(),
          p_placement_id: p3.data,
          p_expected_version: placementVersion.data!.version,
        })
      ).error,
    ).toBeNull();
    expect(await stockSnapshot()).toBe(before);
  });
});

describe("concurrency: two managers racing the same row", () => {
  it("racing the same version of one area: exactly one wins, the other gets PT409", async () => {
    const a = await area(fx.manager, { p_name: `Race ${runId}` });
    const attempt = (user: TestUser, name: string) =>
      user.client.rpc("inventory_storage_area_upsert", {
        ...base(),
        p_area_id: a.data,
        p_name: name,
        p_kind: "cooler",
        p_display_order: 1,
        p_active: true,
        p_expected_version: 1,
      });
    const [r1, r2] = await Promise.all([
      attempt(fx.owner, `Race owner ${runId}`),
      attempt(fx.manager, `Race gm ${runId}`),
    ]);
    const outcomes = [r1, r2].map((r) => r.error?.code ?? "ok").sort();
    expect(outcomes).toEqual(["PT409", "ok"]);
    const row = await fx.admin
      .from("inventory_storage_areas")
      .select("version")
      .eq("id", a.data as string)
      .single();
    expect(row.data?.version).toBe(2);
  });

  it("racing to put the same slot on one shelf: one placement, one refusal, no duplicate", async () => {
    const a = await area(fx.manager, { p_name: `Slot race ${runId}` });
    const sh = await fx.manager.client.rpc("inventory_storage_shelf_upsert", {
      ...base(),
      p_shelf_id: null,
      p_storage_area_id: a.data,
      p_name: "S",
      p_section_name: null,
      p_display_order: 1,
      p_expected_version: null,
    });
    const put = (user: TestUser, product: string) =>
      user.client.rpc("inventory_storage_placement_set", {
        ...base(),
        p_placement_id: null,
        p_storage_area_id: a.data,
        p_shelf_id: sh.data,
        p_product_id: product,
        p_slot_number: 3,
        p_slot_label: null,
        p_display_order: 1,
        p_expected_version: null,
      });
    const [r1, r2] = await Promise.all([
      put(fx.owner, productA),
      put(fx.manager, productB),
    ]);
    expect([r1, r2].filter((r) => r.error === null)).toHaveLength(1);
    expect([r1, r2].filter((r) => r.error?.code === "22023")).toHaveLength(1);
    const rows = await fx.admin
      .from("inventory_storage_placements")
      .select("id")
      .eq("shelf_id", sh.data as string);
    expect(rows.data).toHaveLength(1);
  });

  it("a shelf with placed products cannot be deleted unless removal is explicitly confirmed", async () => {
    const a = await area(fx.manager, { p_name: `Del ${runId}` });
    const sh = await fx.manager.client.rpc("inventory_storage_shelf_upsert", {
      ...base(),
      p_shelf_id: null,
      p_storage_area_id: a.data,
      p_name: "D",
      p_section_name: null,
      p_display_order: 1,
      p_expected_version: null,
    });
    await fx.manager.client.rpc("inventory_storage_placement_set", {
      ...base(),
      p_placement_id: null,
      p_storage_area_id: a.data,
      p_shelf_id: sh.data,
      p_product_id: productA,
      p_slot_number: null,
      p_slot_label: null,
      p_display_order: 1,
      p_expected_version: null,
    });
    const refused = await fx.manager.client.rpc(
      "inventory_storage_shelf_delete",
      {
        ...base(),
        p_shelf_id: sh.data,
        p_expected_version: 1,
        p_remove_placements: false,
      },
    );
    expect(refused.error?.code).toBe("22023");
    expect(
      (
        await fx.admin
          .from("inventory_storage_placements")
          .select("id")
          .eq("shelf_id", sh.data as string)
      ).data,
    ).toHaveLength(1);
    const done = await fx.manager.client.rpc("inventory_storage_shelf_delete", {
      ...base(),
      p_shelf_id: sh.data,
      p_expected_version: 1,
      p_remove_placements: true,
    });
    expect(done.error).toBeNull();
    expect(done.data).toBe(1);
    const log = await fx.admin
      .from("inventory_change_log")
      .select("id")
      .eq("entity_type", "storage_placement")
      .eq("action", "delete")
      .eq("actor_profile_id", fx.manager.id);
    expect((log.data ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("transactional Date Group import through real tokens", () => {
  const dg = (
    user: TestUser,
    requestId: string,
    rows: Record<string, unknown>[],
    over: Record<string, unknown> = {},
    location = fx.locA,
  ) =>
    user.client.rpc("inventory_date_group_import_commit", {
      p_organization_id: fx.orgId,
      p_location_id: location,
      p_request_id: requestId,
      p_filename: "dg.csv",
      p_fingerprint: "dg_real",
      p_skipped: 0,
      p_rejected: 0,
      p_rows: rows,
      ...over,
    });
  const create = (
    product: string,
    n: number,
    extra: Record<string, unknown> = {},
  ) => ({
    row_number: n,
    action: "create",
    product_id: product,
    date_group_id: null,
    expected_version: null,
    quantity: 1,
    manufacture_date: "2026-04-01",
    manufacture_precision: "month",
    expiration_date: null,
    expiration_precision: null,
    notes: null,
    ...extra,
  });
  const lots = async (location = fx.locA) => {
    const r = await fx.admin
      .from("inventory_date_lots")
      .select("id,version,quantity")
      .eq("location_id", location)
      .eq("product_id", productA);
    return r.data ?? [];
  };

  it("one failing row rolls back every earlier row, leaves no receipt, and the corrected retry succeeds", async () => {
    const before = await lots();
    const id = crypto.randomUUID();
    const bad = await dg(fx.manager, id, [
      create(productA, 2),
      create(productA, 3, { quantity: -1 }),
    ]);
    expect(bad.error).not.toBeNull();
    expect(await lots()).toEqual(before);
    const receipt = await fx.admin
      .from("inventory_date_group_imports")
      .select("id")
      .eq("request_id", id);
    expect(receipt.data).toEqual([]);

    const good = await dg(fx.manager, id, [
      create(productA, 2),
      create(productA, 3, { manufacture_date: "2026-05-01" }),
    ]);
    expect(good.error).toBeNull();
    expect(good.data).toMatchObject({
      created: 2,
      updated: 0,
      replayed: false,
    });
    expect(await lots()).toHaveLength(before.length + 2);
  });

  it("a retry after success (dropped connection) replays the receipt and creates nothing new", async () => {
    const id = crypto.randomUUID();
    const rows = [create(productA, 2, { manufacture_date: "2026-06-01" })];
    const first = await dg(fx.manager, id, rows);
    expect(first.error).toBeNull();
    const countAfterFirst = (await lots()).length;
    const again = await dg(fx.manager, id, rows);
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ created: 1, replayed: true });
    expect((await lots()).length).toBe(countAfterFirst);
  });

  it("the same request id with a different payload is refused and writes nothing", async () => {
    const id = crypto.randomUUID();
    expect(
      (
        await dg(fx.manager, id, [
          create(productA, 2, { manufacture_date: "2026-07-01" }),
        ])
      ).error,
    ).toBeNull();
    const n = (await lots()).length;
    const r = await dg(fx.manager, id, [
      create(productA, 2, { manufacture_date: "2026-08-01" }),
    ]);
    expect(r.error?.code).toBe("22023");
    expect((await lots()).length).toBe(n);
  });

  it("two IDENTICAL concurrent requests commit exactly once (one live, one replay)", async () => {
    const id = crypto.randomUUID();
    const rows = [
      create(productA, 2, { manufacture_date: "2026-09-01" }),
      create(productA, 3, { manufacture_date: "2026-10-01" }),
    ];
    const n = (await lots()).length;
    const [r1, r2] = await Promise.all([
      dg(fx.manager, id, rows),
      dg(fx.manager, id, rows),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const replayed = [r1.data, r2.data]
      .map((d) => (d as { replayed: boolean }).replayed)
      .sort();
    expect(replayed).toEqual([false, true]);
    expect((await lots()).length).toBe(n + 2);
    const receipts = await fx.admin
      .from("inventory_date_group_imports")
      .select("id")
      .eq("request_id", id);
    expect(receipts.data).toHaveLength(1);
  });

  it("updates need the version they saw; a stale batch changes nothing; date precision is preserved", async () => {
    const seeded = await fx.manager.client.rpc("inventory_date_lot_save", {
      ...base(),
      p_id: null,
      p_product_id: productB,
      p_quantity: 2,
      p_manufacture_date: "2026-02-01",
      p_manufacture_precision: "month",
      p_expiration_date: "2026-08-31",
      p_expiration_precision: "month",
      p_notes: "seed",
      p_active: true,
      p_expected_version: null,
    });
    expect(seeded.error).toBeNull();
    const upd = (version: number, q: number) => ({
      row_number: 2,
      action: "update",
      product_id: productB,
      date_group_id: seeded.data,
      expected_version: version,
      quantity: q,
      manufacture_date: "2026-02-01",
      manufacture_precision: "month",
      expiration_date: "2026-08-31",
      expiration_precision: "month",
      notes: "seed",
    });
    const stale = await dg(fx.manager, crypto.randomUUID(), [upd(9, 5)]);
    expect(stale.error?.code).toBe("PT409");
    const ok = await dg(fx.manager, crypto.randomUUID(), [upd(1, 4.5)]);
    expect(ok.error).toBeNull();
    const row = await fx.admin
      .from("inventory_date_lots")
      .select("quantity,manufacture_precision,expiration_precision,version")
      .eq("id", seeded.data as string)
      .single();
    expect(row.data).toMatchObject({
      quantity: 4.5,
      manufacture_precision: "month",
      expiration_precision: "month",
      version: 2,
    });
  });

  it("a date-only import leaves authoritative stock, versions and the ledger byte-for-byte unchanged", async () => {
    const before = await stockSnapshot();
    const logBefore = await fx.admin
      .from("inventory_change_log")
      .select("id", { head: true, count: "exact" })
      .eq("entity_type", "stock_levels");
    expect(
      (
        await dg(fx.manager, crypto.randomUUID(), [
          create(productB, 2, { manufacture_date: "2026-11-01" }),
        ])
      ).error,
    ).toBeNull();
    expect(await stockSnapshot()).toBe(before);
    const logAfter = await fx.admin
      .from("inventory_change_log")
      .select("id", { head: true, count: "exact" })
      .eq("entity_type", "stock_levels");
    expect(logAfter.count).toBe(logBefore.count);
  });

  it("cross-location and cross-organization security", async () => {
    const lotB = await fx.admin
      .from("inventory_date_lots")
      .insert({
        organization_id: fx.orgId,
        location_id: fx.locB,
        product_id: productA,
        quantity: 3,
        manufacture_date: "2026-01-01",
        manufacture_precision: "day",
        created_by: fx.manager.id,
        updated_by: fx.manager.id,
      })
      .select("id")
      .single();
    expect(lotB.error).toBeNull();
    const row = {
      row_number: 2,
      action: "update",
      product_id: productA,
      date_group_id: lotB.data!.id,
      expected_version: 1,
      quantity: 99,
      manufacture_date: "2026-01-01",
      manufacture_precision: "day",
      expiration_date: null,
      expiration_precision: null,
      notes: null,
    };
    expect((await dg(fx.manager, crypto.randomUUID(), [row])).error?.code).toBe(
      "22023",
    ); // Loc B's group through Loc A
    expect(
      (await dg(fx.server1, crypto.randomUUID(), [create(productA, 2)])).error
        ?.code,
    ).toBe("42501");
    expect(
      (await dg(managerBOnly, crypto.randomUUID(), [create(productA, 2)])).error
        ?.code,
    ).toBe("42501");
    expect(
      (await dg(fx.outsider, crypto.randomUUID(), [create(productA, 2)])).error
        ?.code,
    ).toBe("42501");
    const anon = await fx.anon.rpc("inventory_date_group_import_commit", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
      p_request_id: crypto.randomUUID(),
      p_filename: "x",
      p_fingerprint: "x",
      p_skipped: 0,
      p_rejected: 0,
      p_rows: [create(productA, 2)],
    });
    expect(anon.error).not.toBeNull();
    const untouched = await fx.admin
      .from("inventory_date_lots")
      .select("quantity,version")
      .eq("id", lotB.data!.id)
      .single();
    expect(untouched.data).toMatchObject({ quantity: 3, version: 1 });
  });

  it("receipts are readable by the location's managers only", async () => {
    const id = crypto.randomUUID();
    expect(
      (
        await dg(fx.manager, id, [
          create(productA, 2, { manufacture_date: "2026-12-01" }),
        ])
      ).error,
    ).toBeNull();
    const mine = await fx.manager.client
      .from("inventory_date_group_imports")
      .select("id,actor_profile_id")
      .eq("request_id", id);
    expect(mine.data).toHaveLength(1);
    expect(mine.data![0].actor_profile_id).toBe(fx.manager.id);
    for (const who of [fx.server1, managerBOnly, fx.outsider]) {
      expect(
        (
          await who.client
            .from("inventory_date_group_imports")
            .select("id")
            .eq("request_id", id)
        ).data,
      ).toEqual([]);
    }
  });
});

export type _Unused = SupabaseClient;
