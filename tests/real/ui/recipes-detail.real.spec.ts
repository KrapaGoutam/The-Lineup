import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";
let orgId = "";
let categoryId = "";
let recipeIds: string[] = [];
let importAttempted = false;
test.beforeAll(async () => {
  await assertServerIsDev();
  const { admin, orgId: org } = await devLocation();
  orgId = org;
  const before = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", org)
    .in("recipe_number", [9001, 9002]);
  const slugCollision = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", org)
    .in("slug", ["r1-test-citrus", "r1-test-highball"]);
  const existingCategory = await admin
    .from("bar_recipe_categories")
    .select("id")
    .eq("organization_id", org)
    .eq("slug", "r1-test-drinks");
  if (
    before.error ||
    slugCollision.error ||
    slugCollision.data?.length ||
    existingCategory.error ||
    before.data?.length ||
    existingCategory.data?.length
  )
    throw new Error(
      "Synthetic fixture collides with existing data; refusing import",
    );
  const actor = await admin
    .from("memberships")
    .select("profile_id")
    .eq("organization_id", org)
    .eq("active", true)
    .overlaps("roles", ["owner", "general_manager", "shift_manager"])
    .limit(1)
    .single();
  if (actor.error || !actor.data) throw new Error("No active management actor");
  const payload = JSON.parse(
    readFileSync(
      "tests/fixtures/recipes/import-sample.synthetic.json",
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
  payload.categories = payload.categories.filter(
    (c: { slug: string }) => c.slug === "r1-test-drinks",
  );
  importAttempted = true;
  const imported = await admin.rpc("bar_recipes_import", {
    p_organization_id: org,
    p_actor_profile_id: actor.data.profile_id,
    p_payload: payload,
    p_mode: "create",
    p_overwrite: [],
  });
  if (imported.error)
    throw new Error(`Synthetic import: ${imported.error.message}`);
  const rows = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", org)
    .in("recipe_number", [9001, 9002]);
  const category = await admin
    .from("bar_recipe_categories")
    .select("id")
    .eq("organization_id", org)
    .eq("slug", "r1-test-drinks")
    .single();
  recipeIds = (rows.data ?? []).map((r) => r.id);
  categoryId = category.data?.id ?? "";
  if (rows.error || category.error || recipeIds.length !== 2 || !categoryId)
    throw new Error("Synthetic import verification failed");
});
test.afterAll(async () => {
  if (!orgId || !importAttempted) return;
  const { admin } = await devLocation();
  const rows = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", orgId)
    .in("recipe_number", [9001, 9002]);
  const categoryRows = await admin
    .from("bar_recipe_categories")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", "r1-test-drinks");
  if (rows.error || categoryRows.error)
    throw new Error("Cannot identify synthetic rows for cleanup");
  recipeIds = (rows.data ?? []).map((r) => r.id);
  categoryId = categoryRows.data?.[0]?.id ?? "";
  const variants = await admin
    .from("bar_recipe_variants")
    .select("id")
    .eq("organization_id", orgId)
    .in("recipe_id", recipeIds);
  if (variants.error)
    throw new Error("Cannot identify synthetic variants for cleanup");
  const variantIds = (variants.data ?? []).map((v) => v.id);
  const recipes = await admin
    .from("bar_recipes")
    .delete()
    .eq("organization_id", orgId)
    .in("id", recipeIds);
  if (recipes.error)
    throw new Error(`Synthetic recipe cleanup: ${recipes.error.message}`);
  if (categoryId) {
    const category = await admin
      .from("bar_recipe_categories")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", categoryId);
    if (category.error)
      throw new Error(`Synthetic category cleanup: ${category.error.message}`);
  }
  for (const table of [
    "bar_recipe_ingredients",
    "bar_recipe_steps",
    "bar_recipe_garnishes",
  ] as const) {
    const result = await admin
      .from(table)
      .select("id")
      .eq("organization_id", orgId)
      .in("variant_id", variantIds);
    if (result.error || result.data?.length)
      throw new Error(`Synthetic cleanup verification failed: ${table}`);
  }
  const remaining = await Promise.all([
    admin
      .from("bar_recipes")
      .select("id")
      .eq("organization_id", orgId)
      .in("recipe_number", [9001, 9002]),
    admin
      .from("bar_recipe_variants")
      .select("id")
      .eq("organization_id", orgId)
      .in("id", variantIds),
    admin
      .from("bar_recipe_categories")
      .select("id")
      .eq("organization_id", orgId)
      .eq("slug", "r1-test-drinks"),
  ]);
  if (remaining.some((r) => r.error || r.data?.length))
    throw new Error("Synthetic cleanup verification failed");
});
for (const role of ["TestManager", "TestServer1"] as const) {
  test(`${role} reads synthetic detail`, async ({ page }) => {
    await signIn(page, PINS[role]);
    await page.goto("/?tab=recipes&recipe=r1-test-citrus");
    await expect(
      page.getByRole("heading", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Perfect Bartending Recipe" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "House Recipe" }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic citrus").locator("visible=true").first(),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic mixer").locator("visible=true").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Quick glance" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Quick measure" }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
  });
}
