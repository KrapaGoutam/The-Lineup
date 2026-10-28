import { expect as baseExpect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  recipePhoto,
  displayedPhotoDimensions,
} from "../../e2e/support/recipe-photo";
import {
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";
// Hosted caller-session actions include several network round trips.
const expect = baseExpect.configure({ timeout: 15000 });
const tag = Date.now().toString(36);
const prefix = `R2D UI ${tag}`;
const categorySlug = `r2d-ui-${tag}`;
const seedName = `${prefix} existing`;
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
    .in("recipe_number", [9461, 9462, 9463]);
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
      recipe_number: 9461,
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
  for (const id of recipeIds) {
    const prefix = `${orgId}/${id}`;
    const objects = await admin.storage.from("recipe-images").list(prefix);
    if (objects.error) throw new Error("Cannot inspect synthetic image prefix");
    if (objects.data.length) {
      const removed = await admin.storage
        .from("recipe-images")
        .remove(objects.data.map((o) => `${prefix}/${o.name}`));
      if (removed.error) throw new Error("Synthetic image cleanup failed");
    }
    const final = await admin.storage.from("recipe-images").list(prefix);
    if (final.error || final.data.length)
      throw new Error("Synthetic image objects remain");
  }
  console.log("R2-D hosted UI Storage prefix inspection: 0 orphan objects");
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
  console.log("R2-D synthetic cleanup counts:", JSON.stringify(cleanupCounts));
});

test("hosted R2-D image pipeline persists, replaces, removes; Staff active/archive/restore", async ({
  page,
  browser,
}) => {
  const { admin } = await devLocation();
  let mutationRequest:
    | { url: string; action: string; contentType: string; body: string }
    | undefined;
  page.on("request", (request) => {
    const action = request.headers()["next-action"],
      contentType = request.headers()["content-type"],
      body = request.postData();
    if (
      action &&
      contentType &&
      body?.includes('"expectedVersion"') &&
      !body.includes('"payload"')
    )
      mutationRequest = { url: request.url(), action, contentType, body };
  });
  await handleOpeningReminder(page);
  await signIn(page, PINS.TestManager);
  await page.goto("/?tab=recipes&mode=new");
  await page.getByLabel("Recipe number", { exact: true }).fill("9462");
  await page.getByLabel("Name", { exact: true }).fill(`${prefix} photo`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  const created = await admin
    .from("bar_recipes")
    .select("id,slug,version")
    .eq("organization_id", orgId)
    .eq("name", `${prefix} photo`)
    .single();
  expect(created.error).toBeNull();
  const recipe = created.data!;
  const detailUrl = `/?tab=recipes&recipe=${recipe.slug}`,
    editorUrl = detailUrl + "&mode=edit";
  const photo = () =>
    page.getByRole("img", { name: `${prefix} photo`, exact: true });
  await page
    .getByLabel("Recipe photo", { exact: true })
    .setInputFiles(await recipePhoto(page));
  await expect(page.getByText("Photo saved.")).toBeVisible();
  await expect(photo()).toBeVisible();
  const heroDims = await displayedPhotoDimensions(page);
  expect(Math.max(heroDims.width, heroDims.height)).toBeLessThanOrEqual(1600);
  const first = await admin
    .from("bar_recipes")
    .select("image_path,image_thumb_path,version")
    .eq("id", recipe.id)
    .single();
  expect(first.data?.version).toBe(2);
  expect(first.data?.image_path).toMatch(
    new RegExp(`^${orgId}/${recipe.id}/.+\\.webp$`),
  );
  await page.reload();
  await expect(photo()).toBeVisible();
  expect((await displayedPhotoDimensions(page)).width).toBeGreaterThan(0);
  const thumb = await admin.storage
    .from("recipe-images")
    .createSignedUrl(first.data!.image_thumb_path, 3600);
  expect(thumb.error).toBeNull();
  const dims = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, thumb.data!.signedUrl);
  expect(Math.max(...dims)).toBeLessThanOrEqual(480);
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  try {
    await handleOpeningReminder(staff);
    await signIn(staff, PINS.TestServer1);
    await staff.goto(detailUrl);
    await expect(
      staff.getByRole("img", { name: `${prefix} photo`, exact: true }),
    ).toBeVisible();
    await staff.goto(editorUrl);
    await expect(
      staff.getByRole("button", {
        name: /Add photo|Replace photo|Remove photo/,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel("Recipe photo", { exact: true })
      .setInputFiles(
        await recipePhoto(page, "image/jpeg", 600, 400, "#059669"),
      );
    await expect(page.getByText("Photo saved.")).toBeVisible();
    const replaced = await admin
      .from("bar_recipes")
      .select("image_path,image_thumb_path,version")
      .eq("id", recipe.id)
      .single();
    expect(replaced.data!.image_path).not.toBe(first.data!.image_path);
    expect(replaced.data!.version).toBe(3);
    const listed = await admin.storage
      .from("recipe-images")
      .list(`${orgId}/${recipe.id}`);
    expect(listed.error).toBeNull();
    expect(listed.data!.map((o) => o.name).sort()).toEqual(
      [replaced.data!.image_path, replaced.data!.image_thumb_path]
        .map((p) => p.split("/")[2])
        .sort(),
    );
    await page.reload();
    await expect(photo()).toBeVisible();
    await page.goto(detailUrl);
    await expect(photo()).toBeVisible();
    await displayedPhotoDimensions(page);
    await page.screenshot({
      path: "test-results/r2d-hosted-detail.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Archive Recipe", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive Recipe", exact: true })
      .click();
    await staff.goto(detailUrl);
    await expect(
      staff.getByText("Recipe not found", { exact: true }),
    ).toBeVisible();
    expect(
      (await admin.storage.from("recipe-images").list(`${orgId}/${recipe.id}`))
        .data,
    ).toHaveLength(2);
    await page.goto(detailUrl);
    await expect(photo()).toBeVisible();
    await page
      .getByRole("button", { name: "Restore Recipe", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Restore Recipe", exact: true })
      .click();
    await staff.goto(detailUrl);
    await expect(
      staff.getByRole("img", { name: `${prefix} photo`, exact: true }),
    ).toBeVisible();
    await page.goto(editorUrl);
    await page
      .getByRole("button", { name: "Remove photo", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove photo", exact: true })
      .click();
    await expect(page.getByText("Photo removed.")).toBeVisible();
    expect(mutationRequest).toBeTruthy();
    const denied = await staff.request.post(mutationRequest!.url, {
      headers: {
        "next-action": mutationRequest!.action,
        "content-type": mutationRequest!.contentType,
      },
      data: mutationRequest!.body,
    });
    expect(await denied.text()).toContain(
      "You don't have permission to manage this photo.",
    );
    await expect(page.getByTestId("recipe-image").getByRole("img")).toHaveCount(
      0,
    );
    // Actual module navigation must drop its cached photo after removal.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: new RegExp(`${prefix} photo`) }),
    ).toBeVisible();
    await expect(page.getByTestId("recipe-image").getByRole("img")).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Edit Recipe", exact: true })
      .click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
    const removed = await admin
      .from("bar_recipes")
      .select("image_path,image_thumb_path")
      .eq("id", recipe.id)
      .single();
    expect(removed.data).toEqual({ image_path: null, image_thumb_path: null });
    expect(
      (await admin.storage.from("recipe-images").list(`${orgId}/${recipe.id}`))
        .data,
    ).toEqual([]);
  } finally {
    await staffContext.close();
  }
});
