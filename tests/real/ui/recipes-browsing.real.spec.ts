import { expect as baseExpect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

const expect = baseExpect.configure({ timeout: 15000 });
const tag = Date.now().toString(36);
const prefix = `R2E UI ${tag}`;
const categorySlug = `r2e-ui-${tag}`;
let orgId = "";
let attempted = false;

async function handleOpeningReminder(page: Page) {
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

  // Collision check for reserved test numbers 9471, 9472, 9473
  const collision = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", org)
    .in("recipe_number", [9471, 9472, 9473]);
  if (collision.error || collision.data?.length) {
    throw new Error(
      "Synthetic recipe numbers are occupied; refusing fixture creation",
    );
  }

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
      name: `${prefix} Citrus`,
      recipe_number: 9471,
      category_slug: categorySlug,
      is_popular: true,
      is_menu_item: true,
      is_alcoholic: true,
    },
    {
      ...payload.recipes[0],
      name: `${prefix} Highball`,
      recipe_number: 9472,
      category_slug: categorySlug,
      is_popular: false,
      is_menu_item: true,
      is_alcoholic: false,
    },
    {
      ...payload.recipes[0],
      name: `${prefix} Archived`,
      recipe_number: 9473,
      category_slug: categorySlug,
      is_popular: false,
      is_menu_item: false,
      is_alcoholic: true,
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
  if (imported.error)
    throw new Error("Synthetic browsing fixture import failed");
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
    const prefixPath = `${orgId}/${id}`;
    const objects = await admin.storage.from("recipe-images").list(prefixPath);
    if (!objects.error && objects.data.length) {
      await admin.storage
        .from("recipe-images")
        .remove(objects.data.map((o) => `${prefixPath}/${o.name}`));
    }
  }

  if (recipeIds.length) {
    await admin.from("bar_recipes").delete().in("id", recipeIds);
  }
  const categoryIds = categories.data.map((c) => c.id);
  if (categoryIds.length) {
    await admin.from("bar_recipe_categories").delete().in("id", categoryIds);
  }

  // Verify 0 residue
  const remaining = await admin
    .from("bar_recipes")
    .select("id")
    .eq("organization_id", orgId)
    .like("name", `${prefix}%`);
  expect(remaining.data?.length ?? 0).toBe(0);
});

test("hosted DEV: view toggle, filter chips, sorting, Picture Book search-flat, and role isolation", async ({
  page,
  browser,
}) => {
  await handleOpeningReminder(page);

  // 1. Sign in as TestManager
  await signIn(page, PINS.TestManager);
  const recipesBtn = page.getByRole("button", {
    name: "Recipes",
    exact: true,
  });
  if (!(await recipesBtn.first().isVisible())) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await recipesBtn.first().click();
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();

  // 2. Initial view is List
  const listBtn = page.getByRole("button", { name: "List", exact: true });
  const picBtn = page.getByRole("button", {
    name: "Picture Book",
    exact: true,
  });
  await expect(listBtn).toHaveAttribute("aria-pressed", "true");
  await expect(picBtn).toHaveAttribute("aria-pressed", "false");

  // 3. Switch to Picture Book
  await picBtn.click();
  await expect(picBtn).toHaveAttribute("aria-pressed", "true");
  await expect(listBtn).toHaveAttribute("aria-pressed", "false");

  // Verify category section and recipe cards are visible
  await expect(
    page.getByRole("heading", { name: new RegExp(`${prefix} category`) }),
  ).toBeVisible();
  const citrusCard = page.getByRole("link", {
    name: new RegExp(`${prefix} Citrus`),
  });
  const highballCard = page.getByRole("link", {
    name: new RegExp(`${prefix} Highball`),
  });
  await expect(citrusCard).toBeVisible();
  await expect(highballCard).toBeVisible();

  // Popular star is visible on Citrus, not on Highball
  await expect(citrusCard.locator('[aria-label="Popular"]')).toBeVisible();
  await expect(highballCard.locator('[aria-label="Popular"]')).toHaveCount(0);

  // 4. Filter chips: Popular
  const popChip = page.getByRole("button", { name: /Popular/i });
  const nonAlcChip = page.getByRole("button", { name: /Non-alcoholic/i });
  const menuChip = page.getByRole("button", { name: /On menu/i });
  const allChip = page.getByRole("button", { name: "All", exact: true });

  await popChip.click();
  await expect(popChip).toHaveAttribute("aria-pressed", "true");
  await expect(citrusCard).toBeVisible();
  await expect(highballCard).toHaveCount(0);

  // Filter chip: Non-alcoholic
  await nonAlcChip.click();
  await expect(nonAlcChip).toHaveAttribute("aria-pressed", "true");
  await expect(highballCard).toBeVisible();
  await expect(citrusCard).toHaveCount(0);

  // Filter chip: On menu
  await menuChip.click();
  await expect(menuChip).toHaveAttribute("aria-pressed", "true");
  await expect(citrusCard).toBeVisible();
  await expect(highballCard).toBeVisible();

  // Filter chip: All
  await allChip.click();
  await expect(allChip).toHaveAttribute("aria-pressed", "true");
  await expect(citrusCard).toBeVisible();
  await expect(highballCard).toBeVisible();

  // 5. Sort controls: Book order vs A-Z
  const bookSortBtn = page.getByRole("button", {
    name: "Book order",
    exact: true,
  });
  const azSortBtn = page.getByRole("button", { name: "A–Z", exact: true });
  await expect(bookSortBtn).toHaveAttribute("aria-pressed", "true");
  await azSortBtn.click();
  await expect(azSortBtn).toHaveAttribute("aria-pressed", "true");

  // 6. Search in Picture Book transforms into flat Results grid with category caption
  const searchInput = page.getByLabel("Search recipes");
  await searchInput.fill(`${prefix} Highball`);
  await expect(
    page.getByRole("heading", { name: "Results (1)" }),
  ).toBeVisible();
  await expect(page.getByText(`${prefix} category`)).toBeVisible();
  await expect(highballCard).toBeVisible();
  await expect(citrusCard).toHaveCount(0);

  // Clear search
  await searchInput.fill("");

  // 7. Management Show archived control
  // First, archive recipe 9473 via the UI
  const archivedCard = page.getByRole("link", {
    name: new RegExp(`${prefix} Archived`),
  });
  await archivedCard.click();
  await page
    .getByRole("button", { name: "Archive Recipe", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive Recipe", exact: true })
    .click();
  await expect(page.getByText("Archived — hidden from staff")).toBeVisible();
  await page.getByRole("link", { name: /‹ Bar Recipes/i }).click();

  // Show archived defaults to off: archivedCard not in DOM
  const showArchivedBox = page.getByLabel("Show archived");
  await expect(showArchivedBox).toBeVisible();
  await expect(archivedCard).toHaveCount(0);

  // Toggle Show archived ON: archivedCard appears dimmed with Archived badge
  await showArchivedBox.check();
  await expect(archivedCard).toBeVisible();
  await expect(
    archivedCard.getByText("Archived", { exact: true }),
  ).toBeVisible();
  await expect(archivedCard.locator("..")).toHaveClass(/opacity-60/);

  // Toggle Show archived OFF: archivedCard disappears
  await showArchivedBox.uncheck();
  await expect(archivedCard).toHaveCount(0);

  // 8. View preference persistence across reload
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');

  // Picture Book remains active after reload
  await expect(
    page.getByRole("button", { name: "Picture Book", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Switch back to List and verify reload preserves List
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await expect(
    page.getByRole("button", { name: "List", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // 9. Staff session: cannot see Show archived or archived recipe
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  try {
    await handleOpeningReminder(staffPage);
    await signIn(staffPage, PINS.TestServer1);
    const staffRecipesBtn = staffPage.getByRole("button", {
      name: "Recipes",
      exact: true,
    });
    if (!(await staffRecipesBtn.first().isVisible())) {
      await staffPage
        .getByRole("button", { name: "More", exact: true })
        .click();
    }
    await staffRecipesBtn.first().click();

    // Staff can toggle to Picture Book
    const staffPicBtn = staffPage.getByRole("button", {
      name: "Picture Book",
      exact: true,
    });
    await staffPicBtn.click();
    await expect(staffPicBtn).toHaveAttribute("aria-pressed", "true");

    // Staff sees active cards
    await expect(
      staffPage.getByRole("link", { name: new RegExp(`${prefix} Citrus`) }),
    ).toBeVisible();

    // Staff CANNOT see Show archived checkbox or the archived recipe
    await expect(staffPage.getByLabel("Show archived")).toHaveCount(0);
    await expect(
      staffPage.getByRole("link", { name: new RegExp(`${prefix} Archived`) }),
    ).toHaveCount(0);
  } finally {
    await staffContext.close();
  }
});
