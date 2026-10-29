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
const prefix = `R2C UI ${tag}`;
const categorySlug = `r2c-ui-${tag}`;
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
    .in("recipe_number", [9451, 9452, 9453]);
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
      recipe_number: 9451,
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
  console.log("R2-C synthetic cleanup counts:", JSON.stringify(cleanupCounts));
});

test("hosted R2-C current-state copy, archive role boundary, inactive-category restore, categories and stale recovery", async ({
  page,
  browser,
}) => {
  const { admin } = await devLocation();
  let categoryRequest:
    | { url: string; action: string; contentType: string; body: string }
    | undefined;
  page.on("request", (request) => {
    const action = request.headers()["next-action"],
      body = request.postData();
    if (action && body?.includes('"operation":"save"'))
      categoryRequest = {
        url: request.url(),
        action,
        contentType: request.headers()["content-type"],
        body,
      };
  });
  await handleOpeningReminder(page);
  await signIn(page, PINS.TestManager);
  await page.goto(`/?tab=recipes&recipe=${seedSlug}&mode=edit`);
  const perfect = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Perfect Bartending Recipe" }),
  });
  const house = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "House Recipe" }) });
  await perfect
    .getByLabel("Method", { exact: true })
    .fill(`${prefix} unsaved Perfect`);
  await expect(
    page.getByRole("button", { name: "Archive Recipe", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Copy Perfect Recipe/ }).click();
  await page
    .getByRole("button", { name: "Replace House", exact: true })
    .click();
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    `${prefix} unsaved Perfect`,
  );
  await expect(
    page.getByRole("heading", { name: "House Recipe options" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Recipe", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit Recipe", exact: true }).click();
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    `${prefix} unsaved Perfect`,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: /Bar Recipes/ }).click();
  await page.getByRole("button", { name: "Manage Categories" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Manage Categories",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", {
      name: new RegExp(`Move ${prefix} fallback up`),
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("switch", {
      name: `Active ${prefix} fallback`,
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("switch", { name: `Active ${prefix} category`, exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "move or archive active recipes",
  );
  await dialog.getByLabel("New category name").fill(`${prefix} added`);
  await dialog
    .getByRole("button", { name: "Add category", exact: true })
    .click();
  await expect(
    dialog.getByLabel(`Name for ${prefix} added`, { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel(`Name for ${prefix} added`, { exact: true })
    .fill(`${prefix} renamed`);
  await dialog
    .getByRole("region", { name: `${prefix} added`, exact: true })
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect(
    dialog.getByLabel(`Name for ${prefix} renamed`, { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: `Move ${prefix} renamed up`, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: `Move ${prefix} renamed up`,
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: `Move ${prefix} renamed down`, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: `Move ${prefix} renamed up`,
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("switch", { name: `Active ${prefix} renamed`, exact: true })
    .click();
  await expect(
    dialog.getByRole("switch", {
      name: `Active ${prefix} renamed`,
      exact: true,
    }),
  ).not.toBeChecked();
  await dialog
    .getByRole("switch", { name: `Active ${prefix} renamed`, exact: true })
    .click();
  await expect(
    dialog.getByRole("switch", {
      name: `Active ${prefix} renamed`,
      exact: true,
    }),
  ).toBeChecked();
  // Rename fallback by its flag-backed row, never by treating its label as authority.
  await dialog
    .getByLabel(`Name for ${prefix} fallback`, { exact: true })
    .fill(`${prefix} fallback renamed`);
  await dialog
    .getByRole("region", { name: `${prefix} fallback`, exact: true })
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect(
    dialog.getByLabel(`Name for ${prefix} fallback renamed`, { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close categories" }).click();
  await expect(
    page.getByRole("button", { name: "Manage Categories" }),
  ).toBeFocused();
  const second = await browser.newContext();
  const staff = await browser.newContext();
  try {
    const other = await second.newPage();
    await handleOpeningReminder(other);
    await signIn(other, PINS.TestManager);
    await other.goto("/?tab=recipes");
    await other.getByRole("button", { name: "Manage Categories" }).click();
    await other
      .getByLabel(`Name for ${prefix} renamed`, { exact: true })
      .fill(`${prefix} stale edit`);
    await page.getByRole("button", { name: "Manage Categories" }).click();
    await dialog
      .getByLabel(`Name for ${prefix} renamed`, { exact: true })
      .fill(`${prefix} canonical`);
    await dialog
      .getByRole("region", { name: `${prefix} renamed`, exact: true })
      .getByRole("button", { name: "Rename", exact: true })
      .click();
    await expect(
      dialog.getByLabel(`Name for ${prefix} canonical`, { exact: true }),
    ).toBeVisible();
    await other
      .getByRole("region", { name: `${prefix} renamed`, exact: true })
      .getByRole("button", { name: "Rename", exact: true })
      .click();
    await expect(
      other
        .getByRole("dialog", { name: "Manage Categories", exact: true })
        .getByRole("alert"),
    ).toContainText("Someone else changed");
    await expect(
      other.getByLabel(`Name for ${prefix} renamed`, { exact: true }),
    ).toHaveValue(`${prefix} stale edit`);
    await other
      .getByRole("button", { name: "Reload latest", exact: true })
      .click();
    await expect(
      other.getByLabel(`Name for ${prefix} canonical`, { exact: true }),
    ).toHaveValue(`${prefix} canonical`);
    await dialog.getByRole("button", { name: "Close categories" }).click();
    const staffPage = await staff.newPage();
    await handleOpeningReminder(staffPage);
    await signIn(staffPage, PINS.TestServer1);
    await staffPage.goto(`/?tab=recipes&recipe=${seedSlug}`);
    await expect(
      staffPage.getByRole("heading", { name: new RegExp(seedName) }),
    ).toBeVisible();
    await page.getByRole("link", { name: new RegExp(seedName) }).click();
    let captured:
      | { url: string; action: string; contentType: string; body: string }
      | undefined;
    page.on("request", (request) => {
      const action = request.headers()["next-action"],
        body = request.postData();
      if (action && body?.includes('"archived":true'))
        captured = {
          url: request.url(),
          action,
          contentType: request.headers()["content-type"],
          body,
        };
    });
    await page
      .getByRole("button", { name: "Archive Recipe", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive Recipe", exact: true })
      .click();
    await expect(page.getByText("Archived — hidden from staff")).toBeVisible();
    await staffPage.reload();
    await expect(
      staffPage.getByRole("heading", { name: "Recipe not found", exact: true }),
    ).toBeVisible();
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
    expect(categoryRequest).toBeDefined();
    const categoryReplay = await staff.request.post(categoryRequest!.url, {
      headers: {
        "Next-Action": categoryRequest!.action,
        "Content-Type": categoryRequest!.contentType,
        Origin: new URL(categoryRequest!.url).origin,
      },
      data: categoryRequest!.body,
    });
    expect(await categoryReplay.text()).toContain("permission");
    await staffPage.goto("/?tab=recipes");
    await expect(
      staffPage.getByRole("heading", { name: "Bar Recipes", exact: true }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", {
        name: /Manage Categories|Archive Recipe|Restore Recipe/,
      }),
    ).toHaveCount(0);
    await expect(staffPage.getByLabel("Show archived")).toHaveCount(0);
    await page.getByRole("link", { name: /Bar Recipes/ }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(seedName) }),
    ).toHaveCount(0);
    await page.getByLabel("Show archived").click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Manage Categories" }).click();
    await dialog
      .getByRole("switch", { name: `Active ${prefix} category`, exact: true })
      .click();
    await expect(
      dialog.getByRole("switch", {
        name: `Active ${prefix} category`,
        exact: true,
      }),
    ).not.toBeChecked();
    await dialog.getByRole("button", { name: "Close categories" }).click();
    await page.getByRole("link", { name: new RegExp(seedName) }).click();
    await page
      .getByRole("button", { name: "Restore Recipe", exact: true })
      .click();
    const restore = page.getByRole("dialog", {
      name: "Restore Recipe?",
      exact: true,
    });
    await expect(
      restore.getByRole("button", { name: "Restore Recipe", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Restore category")
      .selectOption({ label: `${prefix} canonical` });
    await restore
      .getByRole("button", { name: "Restore Recipe", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Recipe", exact: true }),
    ).toBeVisible();
    await staffPage.goto(`/?tab=recipes&recipe=${seedSlug}`);
    await expect(
      staffPage.getByRole("heading", { name: new RegExp(seedName) }),
    ).toBeVisible();
    const persisted = await admin
      .from("bar_recipes")
      .select("id,version,is_active,category_id")
      .eq("organization_id", orgId)
      .eq("slug", seedSlug)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data!.version).toBe(4);
    expect(persisted.data!.is_active).toBe(true);
    const variant = await admin
      .from("bar_recipe_variants")
      .select("method")
      .eq("organization_id", orgId)
      .eq("recipe_id", persisted.data!.id)
      .eq("variant", "house")
      .single();
    expect(variant.data!.method).toBe(`${prefix} unsaved Perfect`);
  } finally {
    await second.close();
    await staff.close();
  }
});
