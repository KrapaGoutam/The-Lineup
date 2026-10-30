import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";
const tag = Date.now().toString(36);
const prefix = `R2B UI ${tag}`;
const categorySlug = `r2b-ui-${tag}`;
const seedName = `${prefix} existing`;
const seedSlug = seedName.toLowerCase().replaceAll(" ", "-");
let orgId = "";
let attempted = false;
let cleanupCounts: Record<string, number> = {};
async function handleOpeningReminder(page: Page) {
  // The shared synthetic DEV users can receive the app-wide Opening prompt.
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: /^Opening/ }),
    async (dialog) => {
      await dialog
        .getByRole("button", { name: "Dismiss", exact: true })
        .click();
    },
  );
}
test.beforeAll(async () => {
  await assertServerIsDev();
  const { admin, orgId: org } = await devLocation();
  orgId = org;
  const collision = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", org)
    .in("recipe_number", [9401, 9402, 9403]);
  if (collision.error || collision.data?.length)
    throw new Error(
      "Synthetic recipe numbers are occupied; refusing fixture creation",
    );
  const actor = await admin
    .from("memberships")
    .select("profile_id")
    .eq("organization_id", org)
    .eq("active", true)
    .overlaps("roles", ["owner", "general_manager", "shift_manager"])
    .limit(1)
    .single();
  if (actor.error) throw new Error("No management fixture actor");
  const fallback = await admin
    .from("bar_recipe_categories")
    .select("id")
    .eq("organization_id", org)
    .eq("is_fallback", true)
    .maybeSingle();
  if (fallback.error) throw new Error("Cannot read fallback category");
  const payload = JSON.parse(
    readFileSync(
      "tests/fixtures/recipes/import-sample.synthetic.json",
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
  payload.categories = [
    { slug: categorySlug, name: `${prefix} category`, display_order: 10 },
    ...(!fallback.data
      ? [
          {
            slug: `${categorySlug}-fallback`,
            name: `${prefix} fallback`,
            display_order: 999,
            is_fallback: true,
          },
        ]
      : []),
  ];
  payload.recipes = [
    {
      ...payload.recipes[0],
      name: seedName,
      recipe_number: 9401,
      category_slug: categorySlug,
    },
  ];
  attempted = true;
  const imported = await admin.rpc("bar_recipes_import", {
    p_organization_id: org,
    p_actor_profile_id: actor.data!.profile_id,
    p_payload: payload,
    p_mode: "create",
    p_overwrite: [],
  });
  if (imported.error) throw new Error("Synthetic editor fixture import failed");
});
test.afterAll(async () => {
  if (!attempted || !orgId) return;
  const { admin } = await devLocation();
  const recipes = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", orgId)
    .like("name", `${prefix}%`);
  const categories = await admin
    .from("bar_recipe_categories")
    .select("id")
    .eq("organization_id", orgId)
    .like("slug", `${categorySlug}%`);
  if (recipes.error || categories.error)
    throw new Error("Cannot identify synthetic cleanup rows");
  const recipeIds = recipes.data.map((r) => r.id);
  const variants = await admin
    .from("bar_recipe_variants")
    .select("id")
    .eq("organization_id", orgId)
    .in("recipe_id", recipeIds);
  if (variants.error) throw new Error("Cannot identify synthetic variants");
  const ids = variants.data.map((v) => v.id);
  const removed = await admin
    .from("bar_recipes")
    .delete()
    .eq("organization_id", orgId)
    .in("id", recipeIds);
  if (removed.error) throw new Error("Synthetic recipe cleanup failed");
  const removedCategories = await admin
    .from("bar_recipe_categories")
    .delete()
    .eq("organization_id", orgId)
    .in(
      "id",
      categories.data.map((c) => c.id),
    );
  if (removedCategories.error)
    throw new Error("Synthetic category cleanup failed");
  for (const table of [
    "bar_recipe_ingredients",
    "bar_recipe_steps",
    "bar_recipe_garnishes",
  ] as const) {
    const rows = await admin
      .from(table)
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .in("variant_id", ids);
    if (rows.error || rows.data?.length)
      throw new Error(`Synthetic residue: ${table}`);
    cleanupCounts[table] = rows.count ?? -1;
  }
  const remaining = await Promise.all([
    admin
      .from("bar_recipes")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .like("name", `${prefix}%`),
    admin
      .from("bar_recipe_variants")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .in("id", ids),
    admin
      .from("bar_recipe_categories")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId)
      .like("slug", `${categorySlug}%`),
  ]);
  if (remaining.some((r) => r.error || r.data?.length))
    throw new Error("Synthetic graph cleanup verification failed");
  cleanupCounts = {
    ...cleanupCounts,
    recipes: remaining[0].count ?? -1,
    variants: remaining[1].count ?? -1,
    categories: remaining[2].count ?? -1,
  };
  console.log("R2-B synthetic cleanup counts:", JSON.stringify(cleanupCounts));
});
test("hosted DEV management create/edit/renumber, both variants, stale recovery, Staff denial", async ({
  page,
  browser,
}) => {
  let captured:
    | { url: string; action: string; contentType: string; body: string }
    | undefined;
  await handleOpeningReminder(page);
  page.on("request", (request) => {
    const action = request.headers()["next-action"];
    const body = request.postData();
    if (action && body?.includes(prefix) && body.includes("recipe_number"))
      captured = {
        url: request.url(),
        action,
        contentType: request.headers()["content-type"],
        body,
      };
  });
  await signIn(page, PINS.TestManager);
  await page.goto("/?tab=recipes&mode=new");
  await expect(
    page.getByRole("heading", { name: "Add Recipe", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Recipe number", { exact: true }).fill("9402");
  await page.getByLabel("Name", { exact: true }).fill(`${prefix} created`);
  await page
    .getByLabel("Base spirit", { exact: true })
    .fill("Synthetic custom spirit");
  await page.getByLabel("Method", { exact: true }).fill("Synthetic build");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page
    .getByLabel("Ingredient name", { exact: true })
    .fill("Synthetic ingredient");
  await page.getByLabel("Amount", { exact: true }).fill("To taste");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit Recipe", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Recipe saved", { exact: true })).toBeVisible();
  const { admin } = await devLocation();
  const created = await admin
    .from("bar_recipes")
    .select("id,slug,version")
    .eq("organization_id", orgId)
    .eq("name", `${prefix} created`)
    .single();
  expect(created.error).toBeNull();
  expect(created.data?.version).toBe(1);
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  await expect(page.getByLabel("Recipe number", { exact: true })).toHaveValue(
    "9402",
  );
  await page.getByLabel("Recipe number", { exact: true }).fill("9403");
  await page.getByLabel("Name", { exact: true }).fill(`${prefix} edited`);
  await page
    .getByLabel("Method", { exact: true })
    .fill("Synthetic updated method");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`9403.*${prefix} edited`) }),
  ).toBeVisible();
  const updated = await admin
    .from("bar_recipes")
    .select("id,slug,version,recipe_number")
    .eq("id", created.data!.id)
    .single();
  expect(updated.data).toMatchObject({
    id: created.data!.id,
    slug: created.data!.slug,
    version: 2,
    recipe_number: 9403,
  });
  await page.goto(`/?tab=recipes&recipe=${seedSlug}&mode=edit`);
  const perfect = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Perfect Bartending Recipe" }),
  });
  const house = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "House Recipe" }) });
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue("Stir");
  await perfect
    .getByLabel("Method", { exact: true })
    .fill("R2B hosted Perfect");
  await house.getByLabel("Method", { exact: true }).fill("R2B hosted House");
  await perfect
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await perfect
    .getByLabel("Ingredient name", { exact: true })
    .nth(1)
    .fill("R2B reordered ingredient");
  await perfect
    .getByRole("button", { name: "Move ingredient 2 up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(seedName) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Recipe", exact: true }).click();
  await expect(
    perfect.getByLabel("Ingredient name", { exact: true }).first(),
  ).toHaveValue("R2B reordered ingredient");
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    "R2B hosted House",
  );
  await page
    .getByLabel("Name", { exact: true })
    .fill(`${prefix} local unsaved`);
  const other = await page.context().newPage();
  await handleOpeningReminder(other);
  await other.goto(`/?tab=recipes&recipe=${seedSlug}&mode=edit`);
  await other
    .getByLabel("Name", { exact: true })
    .fill(`${prefix} external saved`);
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    other.getByRole("heading", {
      name: new RegExp(`${prefix} external saved`),
    }),
  ).toBeVisible();
  await other.close();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reload latest", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    `${prefix} local unsaved`,
  );
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    `${prefix} local unsaved`,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Reload latest", exact: true })
    .click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    `${prefix} external saved`,
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  const staff = await browser.newContext();
  try {
    const staffPage = await staff.newPage();
    await handleOpeningReminder(staffPage);
    await signIn(staffPage, PINS.TestServer1);
    await staffPage.goto("/?tab=recipes&mode=new");
    await expect(
      staffPage.getByRole("heading", { name: "Bar Recipes", exact: true }),
    ).toBeVisible();
    await expect(staffPage.getByRole("form")).toHaveCount(0);
    await staffPage.goto(`/?tab=recipes&recipe=${seedSlug}&mode=edit`);
    await expect(
      staffPage.getByRole("heading", {
        name: new RegExp(`${prefix} external saved`),
      }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", { name: /Edit Recipe|Save/ }),
    ).toHaveCount(0);
    expect(captured).toBeDefined();
    const replay = await staff.request.post(captured!.url, {
      headers: {
        "Next-Action": captured!.action,
        "Content-Type": captured!.contentType,
        Origin: new URL(captured!.url).origin,
      },
      data: captured!.body,
    });
    expect(await replay.text()).toContain("permission");
    const unchanged = await admin
      .from("bar_recipes")
      .select("version")
      .eq("id", created.data!.id)
      .single();
    expect(unchanged.data?.version).toBe(2);
  } finally {
    await staff.close();
  }
});
