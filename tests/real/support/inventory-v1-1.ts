import fs from "node:fs";
import { env, type Fixture, type TestUser } from "./harness";
export const DEV_REF = "opmujepkemwcdxxorhfd";
export function assertInventoryDev() {
  if (
    new URL(env.url).hostname !== `${DEV_REF}.supabase.co` ||
    fs.readFileSync("supabase/.temp/project-ref", "utf8").trim() !== DEV_REF
  )
    throw new Error(
      "STOP: Inventory tests require the explicitly linked DEV project.",
    );
}
export function inventoryBase(fx: Fixture, location = fx.locA) {
  return { p_organization_id: fx.orgId, p_location_id: location };
}
export async function inventoryRpc(
  user: TestUser,
  name: string,
  args: Record<string, unknown>,
) {
  assertInventoryDev();
  return user.client.rpc(name, args);
}
export async function seedInventory(fx: Fixture) {
  const base = inventoryBase(fx);
  const vendor = await inventoryRpc(fx.manager, "inventory_vendor_create", {
    ...base,
    p_name: "V1.1 synthetic vendor",
    p_notes: null,
  });
  if (vendor.error) throw new Error(vendor.error.message);
  const category = await inventoryRpc(fx.manager, "inventory_category_create", {
    ...base,
    p_name: "V1.1 synthetic Beer",
  });
  if (category.error) throw new Error(category.error.message);
  const sub = await inventoryRpc(fx.manager, "inventory_subcategory_create", {
    ...base,
    p_category_id: category.data,
    p_name: "V1.1 synthetic IPA",
  });
  if (sub.error) throw new Error(sub.error.message);
  return {
    vendorId: vendor.data as string,
    subcategoryId: sub.data as string,
    categoryId: category.data as string,
  };
}
export async function inventoryProduct(
  fx: Fixture,
  seed: Awaited<ReturnType<typeof seedInventory>>,
  name: string,
) {
  const result = await inventoryRpc(fx.manager, "inventory_product_create", {
    ...inventoryBase(fx),
    p_vendor_id: seed.vendorId,
    p_name: name,
    p_category_id: seed.categoryId,
    p_subcategory_id: seed.subcategoryId,
    p_size: "12 oz",
    p_unit_type: "bottle",
    p_unit_label: null,
    p_sku: null,
    p_notes: null,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as string;
}
export async function verifyInventoryCleanup(fx: Fixture) {
  const counts: Record<string, number> = {};
  for (const table of [
    "locations",
    "memberships",
    "inventory_products",
    "inventory_stock",
    "inventory_adjustments",
    "inventory_date_lots",
    "inventory_freshness_rules",
    "inventory_saved_views",
    "inventory_change_log",
    "inventory_vendors",
    "inventory_categories",
    "inventory_subcategories",
    "passcode_credentials",
    "passcode_login_attempts",
  ]) {
    const result = await fx.admin
      .from(table)
      .select("*", { head: true, count: "exact" })
      .in("organization_id", [fx.orgId, fx.otherOrgId]);
    if (result.error || result.count !== 0)
      throw new Error(`Synthetic residue or cleanup query failure: ${table}`);
    counts[table] = result.count;
  }
  const org = await fx.admin
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .in("id", [fx.orgId, fx.otherOrgId]);
  if (org.error || org.count !== 0)
    throw new Error("Synthetic organization residue");
  counts.organizations = 0;
  const users = [
    fx.owner,
    fx.manager,
    fx.server1,
    fx.server2,
    fx.server3,
    fx.outsider,
  ];
  const profiles = await fx.admin
    .from("profiles")
    .select("id", { head: true, count: "exact" })
    .in(
      "id",
      users.map((u) => u.id),
    );
  if (profiles.error || profiles.count !== 0)
    throw new Error("Synthetic profile residue");
  counts.profiles = 0;
  for (const user of users) {
    const auth = await fx.admin.auth.admin.getUserById(user.id);
    if (auth.data.user) throw new Error("Synthetic Auth residue");
  }
  counts.authUsers = 0;
  return counts;
}
