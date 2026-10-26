/**
 * Bar Inventory V1 / BI-1 -- real-mode catalog scenarios (hosted DEV only).
 * Scenario ids (BI-xxx) match docs/features/bar-inventory-v1/TEST_MATRIX.md.
 * Every call goes through a synthetic user's own JWT via PostgREST, so RLS,
 * grants, argument handling (explicit nulls) and the SECURITY DEFINER boundary
 * behave exactly as they do for the app.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixture, type Fixture } from "./support/harness";

let fx: Fixture;
let org: string;
let loc: string;

type Rpc = {
  data: unknown;
  error: { message: string; code?: string; details?: string | null } | null;
};

const base = () => ({ p_organization_id: org, p_location_id: loc });

async function vendorCreate(
  user: Pick<Fixture["owner"], "client">,
  name: string,
  notes: string | null = null,
): Promise<Rpc> {
  return user.client.rpc("inventory_vendor_create", {
    ...base(),
    p_name: name,
    p_notes: notes,
  });
}

async function vendorId(name: string): Promise<string> {
  const { data, error } = await fx.admin
    .from("inventory_vendors")
    .select("id")
    .eq("organization_id", org)
    .eq("name", name)
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

const detailOf = (rpc: Rpc) =>
  rpc.error?.details ? JSON.parse(rpc.error.details) : null;

function productArgs(vendor: string, over: Record<string, unknown> = {}) {
  return {
    ...base(),
    p_vendor_id: vendor,
    p_name: "Tito's Handmade Vodka",
    p_category_id: null,
    p_subcategory_id: null,
    p_size: "750 mL",
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
    ...over,
  };
}

beforeAll(async () => {
  fx = await createFixture();
  org = fx.orgId;
  loc = fx.locA;
});

afterAll(async () => {
  if (!fx) return;
  // Inventory rows hold actor FKs to memberships and the change log is
  // append-only: the harness teardown removes the organizations (cascade)
  // before it deletes memberships.
  await fx.teardown();
});

describe("access (BI-SEC-002, BI-NAV-003)", () => {
  it("owner and manager may bootstrap; staff, outsider and anon may not", async () => {
    for (const user of [fx.owner, fx.manager]) {
      const { error } = await user.client.rpc("inventory_bootstrap", base());
      expect(error).toBeNull();
    }
    for (const user of [fx.server1, fx.server2, fx.outsider]) {
      const { error } = await user.client.rpc("inventory_bootstrap", base());
      expect(error?.code).toBe("42501");
    }
    const anon = await fx.anon.rpc("inventory_bootstrap", base());
    expect(anon.error).not.toBeNull();
  });

  it("bootstrap is idempotent: one system 'Unassigned' vendor", async () => {
    await fx.manager.client.rpc("inventory_bootstrap", base());
    const { data } = await fx.admin
      .from("inventory_vendors")
      .select("name, is_system")
      .eq("organization_id", org)
      .eq("is_system", true);
    expect(data).toEqual([{ name: "Unassigned", is_system: true }]);
  });

  it("staff see no catalog rows; managers do; another tenant sees none", async () => {
    await vendorCreate(fx.manager, "Faust");
    const rowsFor = async (user: Fixture["owner"]) =>
      (await user.client.from("inventory_vendors").select("id")).data ?? [];
    expect((await rowsFor(fx.manager)).length).toBeGreaterThanOrEqual(2);
    expect((await rowsFor(fx.owner)).length).toBeGreaterThanOrEqual(2);
    expect(await rowsFor(fx.server1)).toEqual([]);
    expect(await rowsFor(fx.outsider)).toEqual([]);
    expect(
      (await fx.anon.from("inventory_vendors").select("id")).data ?? [],
    ).toEqual([]);
  });

  it("clients cannot write tables directly (no DML grants)", async () => {
    const insert = await fx.manager.client.from("inventory_vendors").insert({
      organization_id: org,
      name: "Direct",
      created_by: fx.manager.id,
    });
    expect(insert.error).not.toBeNull();
    const update = await fx.manager.client
      .from("inventory_vendors")
      .update({ name: "Hacked" })
      .eq("organization_id", org);
    expect(update.error).not.toBeNull();
    const del = await fx.manager.client
      .from("inventory_vendors")
      .delete()
      .eq("organization_id", org);
    expect(del.error).not.toBeNull();
  });

  it("a manager cannot reach another organization's location or ids (BI-CAT-011)", async () => {
    const wrongLoc = await fx.manager.client.rpc("inventory_vendor_create", {
      p_organization_id: org,
      p_location_id: fx.otherLoc,
      p_name: "Cross",
      p_notes: null,
    });
    expect(wrongLoc.error?.code).toBe("42501");

    const theirOwn = await fx.outsider.client.rpc("inventory_vendor_create", {
      p_organization_id: fx.otherOrgId,
      p_location_id: fx.otherLoc,
      p_name: "Faust",
      p_notes: null,
    });
    expect(theirOwn.error).toBeNull();
    const { data: theirs } = await fx.admin
      .from("inventory_vendors")
      .select("id, version")
      .eq("organization_id", fx.otherOrgId)
      .eq("name", "Faust")
      .single();
    const steal = await fx.manager.client.rpc("inventory_vendor_update", {
      ...base(),
      p_vendor_id: theirs!.id,
      p_name: "Stolen",
      p_notes: null,
      p_expected_version: 1,
    });
    expect(steal.error?.code).toBe("22023");
  });
});

describe("vendors (BI-CAT-002..005)", () => {
  it("spelling variants collide and the error names the existing vendor", async () => {
    await vendorCreate(fx.manager, "  Del   Papa ");
    for (const variant of ["DelPapa", "DEL PAPA", "del papa"]) {
      const res = await vendorCreate(fx.manager, variant);
      expect(res.error?.code).toBe("23505");
      expect(detailOf(res)).toMatchObject({
        kind: "duplicate",
        existing_label: "Del Papa",
      });
    }
    expect((await vendorCreate(fx.manager, "unassigned")).error?.code).toBe(
      "23505",
    );
  });

  it("rename bumps the version, an identical re-submit is a no-op", async () => {
    const id = await vendorId("Faust");
    const rename = (name: string, version: number) =>
      fx.manager.client.rpc("inventory_vendor_update", {
        ...base(),
        p_vendor_id: id,
        p_name: name,
        p_notes: null,
        p_expected_version: version,
      });
    expect((await rename("Faust Distributing", 1)).data).toBe(2);
    expect((await rename("Faust Distributing", 2)).data).toBe(2);
  });

  it("BI-ADJ-005 a stale edit is PT409 with who changed it", async () => {
    const id = await vendorId("Faust Distributing");
    const stale = await fx.owner.client.rpc("inventory_vendor_update", {
      ...base(),
      p_vendor_id: id,
      p_name: "Faust Again",
      p_notes: null,
      p_expected_version: 1,
    });
    expect(stale.error?.code).toBe("PT409");
    expect(detailOf(stale)).toMatchObject({
      kind: "stale",
      entity: "vendor",
      current_version: 2,
    });
    expect(detailOf(stale).updated_by).toBeTruthy();
  });

  it("two managers racing the same version: exactly one wins", async () => {
    const id = await vendorId("Del Papa");
    const attempt = (user: Fixture["owner"], name: string) =>
      user.client.rpc("inventory_vendor_update", {
        ...base(),
        p_vendor_id: id,
        p_name: name,
        p_notes: null,
        p_expected_version: 1,
      });
    const [a, b] = await Promise.all([
      attempt(fx.owner, "Del Papa North"),
      attempt(fx.manager, "Del Papa South"),
    ]);
    const outcomes = [a, b].map((r) => (r.error ? r.error.code : "ok")).sort();
    expect(outcomes).toEqual(["PT409", "ok"]);
  });

  it("the system vendor is immutable; deactivate and reactivate keep the row", async () => {
    const unassigned = await vendorId("Unassigned");
    const rename = await fx.manager.client.rpc("inventory_vendor_update", {
      ...base(),
      p_vendor_id: unassigned,
      p_name: "Renamed",
      p_notes: null,
      p_expected_version: 1,
    });
    expect(rename.error?.code).toBe("22023");

    const id = await vendorId("Faust Distributing");
    const off = await fx.manager.client.rpc("inventory_vendor_set_active", {
      ...base(),
      p_vendor_id: id,
      p_active: false,
      p_expected_version: 2,
    });
    expect(off.data).toBe(3);
    const on = await fx.manager.client.rpc("inventory_vendor_set_active", {
      ...base(),
      p_vendor_id: id,
      p_active: true,
      p_expected_version: 3,
    });
    expect(on.data).toBe(4);
  });
});

describe("categories and products (BI-CAT-006..010)", () => {
  let spirits: string;
  let vodka: string;
  let faust: string;

  it("category and subcategory rules", async () => {
    const cat = await fx.manager.client.rpc("inventory_category_create", {
      ...base(),
      p_name: "Spirits",
    });
    expect(cat.error).toBeNull();
    spirits = cat.data as string;
    expect(
      (
        await fx.manager.client.rpc("inventory_category_create", {
          ...base(),
          p_name: " SPIRITS ",
        })
      ).error?.code,
    ).toBe("23505");

    const sub = await fx.manager.client.rpc("inventory_subcategory_create", {
      ...base(),
      p_category_id: spirits,
      p_name: "Vodka",
    });
    expect(sub.error).toBeNull();
    vodka = sub.data as string;
    expect(
      (
        await fx.manager.client.rpc("inventory_subcategory_create", {
          ...base(),
          p_category_id: spirits,
          p_name: "vodka",
        })
      ).error?.code,
    ).toBe("23505");
  });

  it("product identity: size, vendor and unit separate products; duplicates refused", async () => {
    faust = await vendorId("Faust Distributing");
    const create = (over: Record<string, unknown> = {}) =>
      fx.manager.client.rpc(
        "inventory_product_create",
        productArgs(faust, over),
      );

    const first = await create({
      p_category_id: spirits,
      p_subcategory_id: vodka,
      p_sku: "TIT-750",
    });
    expect(first.error).toBeNull();

    const dup = await create({
      p_name: "TITOS handmade vodka",
      p_size: "750ml",
    });
    expect(dup.error?.code).toBe("23505");
    expect(detailOf(dup)).toMatchObject({
      kind: "duplicate",
      field: "identity",
    });

    expect((await create({ p_size: "1.75 L" })).error).toBeNull();
    expect((await create({ p_unit_type: "keg" })).error).toBeNull();
    const sku = await create({
      p_name: "Other",
      p_size: null,
      p_sku: " tit-750 ",
    });
    expect(detailOf(sku)).toMatchObject({ field: "sku" });
  });

  it("units: Other needs a label; subcategory needs its own category", async () => {
    const create = (over: Record<string, unknown>) =>
      fx.manager.client.rpc(
        "inventory_product_create",
        productArgs(faust, over),
      );
    expect(
      (await create({ p_name: "G1", p_unit_type: "other" })).error?.code,
    ).toBe("22023");
    expect(
      (
        await create({
          p_name: "G2",
          p_unit_type: "other",
          p_unit_label: "Growler",
        })
      ).error,
    ).toBeNull();
    expect(
      (await create({ p_name: "G3", p_unit_type: "can", p_unit_label: "x" }))
        .error?.code,
    ).toBe("22023");
    expect(
      (await create({ p_name: "G4", p_subcategory_id: vodka })).error?.code,
    ).toBe("22023");
  });

  it("archive frees the identity; reactivation re-checks; stale product edit is PT409", async () => {
    const { data } = await fx.admin
      .from("inventory_products")
      .select("id, version")
      .eq("organization_id", org)
      .eq("sku", "TIT-750")
      .single();
    const id = data!.id as string;

    const off = await fx.manager.client.rpc("inventory_product_set_active", {
      ...base(),
      p_product_id: id,
      p_active: false,
      p_expected_version: 1,
    });
    expect(off.data).toBe(2);

    const again = await fx.manager.client.rpc(
      "inventory_product_create",
      productArgs(faust, { p_sku: "TIT-750" }),
    );
    expect(again.error).toBeNull();

    const react = await fx.manager.client.rpc("inventory_product_set_active", {
      ...base(),
      p_product_id: id,
      p_active: true,
      p_expected_version: 2,
    });
    expect(react.error?.code).toBe("23505");

    const stale = await fx.manager.client.rpc("inventory_product_set_active", {
      ...base(),
      p_product_id: id,
      p_active: true,
      p_expected_version: 1,
    });
    expect(stale.error?.code).toBe("PT409");
  });

  it("history is recorded for managers only and cannot be rewritten (BI-HIST-004, BI-ADJ-003)", async () => {
    const log = await fx.manager.client
      .from("inventory_change_log")
      .select("id, actor_profile_id, entity_type");
    expect((log.data ?? []).length).toBeGreaterThan(5);
    expect((log.data ?? []).every((row) => row.actor_profile_id !== null)).toBe(
      true,
    );
    expect(
      (await fx.server1.client.from("inventory_change_log").select("id"))
        .data ?? [],
    ).toEqual([]);

    const tamper = await fx.admin
      .from("inventory_change_log")
      .update({ diff: {} })
      .eq("organization_id", org);
    expect(tamper.error?.code).toBe("23514");
  });
});
