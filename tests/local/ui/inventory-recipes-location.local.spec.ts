import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createInventoryRecipesFixture,
  localEnv,
  must,
  type InventoryRecipesFixture,
  type TestUser,
} from "../support/inventory-recipes-fixture";

let fx: InventoryRecipesFixture;

async function authenticate(
  context: BrowserContext,
  user: TestUser,
  location: string,
) {
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(localEnv.url, localEnv.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (cookies) =>
        context.addCookies(
          cookies.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        ),
    },
  });
  must(await client.auth.setSession(session));
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: fx.org.id, l: location }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("button", { name });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) {
    await tab.click();
  }
}

async function switchTo(page: Page, location: string, label: string) {
  await page
    .getByRole("button", { name: /^Switch workspace\. Current:/ })
    .click();
  await page
    .locator(`[role="menuitemradio"][data-location-id="${location}"]`)
    .click();
  await expect(
    page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
  ).toContainText(label, { timeout: 30000 });
}

test.describe.configure({ mode: "serial" });

let seeded: { product: string; recipe: string; run: string };

async function seedModuleData() {
  const { org, locA, locB, run } = fx;
  const vendorName = `Spec Vendor ${run}`;
  must(
    await fx.managerA.client.rpc("inventory_vendor_create", {
      p_organization_id: org.id,
      p_location_id: locA,
      p_name: vendorName,
      p_notes: null as never,
    }),
  );
  const vendor = must(
    await fx.admin
      .from("inventory_vendors")
      .select("id")
      .eq("organization_id", org.id)
      .eq("name", vendorName)
      .single(),
  )!;
  const product = `Spec Vodka ${run}`;
  must(
    await fx.managerA.client.rpc("inventory_product_create", {
      p_organization_id: org.id,
      p_location_id: locA,
      p_vendor_id: vendor.id,
      p_name: product,
      p_category_id: null as never,
      p_subcategory_id: null as never,
      p_size: "750 mL",
      p_unit_type: "bottle",
      p_unit_label: null as never,
      p_sku: null as never,
      p_notes: null as never,
    }),
  );
  const prod = must(
    await fx.admin
      .from("inventory_products")
      .select("id")
      .eq("organization_id", org.id)
      .eq("name", product)
      .single(),
  )!;
  // Real RPCs as the real location managers: genuine attribution, decimal quantities.
  must(
    await fx.managerA.client.rpc("inventory_stock_adjust", {
      p_organization_id: org.id,
      p_location_id: locA,
      p_product_id: prod.id,
      p_mode: "set",
      p_on_hand: 12.5,
      p_backup: 0,
      p_reason: "stock_count",
      p_note: "spec seed A",
      p_expected_version: 1,
    }),
  );
  must(
    await fx.managerB.client.rpc("inventory_stock_adjust", {
      p_organization_id: org.id,
      p_location_id: locB,
      p_product_id: prod.id,
      p_mode: "set",
      p_on_hand: 4.75,
      p_backup: 0,
      p_reason: "stock_count",
      p_note: "spec seed B",
      p_expected_version: 1,
    }),
  );
  const category = must(
    await fx.admin
      .from("bar_recipe_categories")
      .insert({
        organization_id: org.id,
        name: `Spec Classics ${run}`,
        slug: `spec-classics-${run}`,
        display_order: 1,
        created_by: fx.owner.id,
      })
      .select("id")
      .single(),
  )!;
  const recipe = `Spec Daiquiri ${run}`;
  must(
    await fx.managerA.client.rpc("bar_recipe_save", {
      p_organization_id: org.id,
      p_recipe_id: null as never,
      p_expected_version: null as never,
      p_payload: {
        recipe_number: 1,
        name: recipe,
        category_id: category.id,
        variants: {
          perfect: {
            method: "Shake",
            ingredients: [{ ingredient_name: "White rum", amount: "2 oz" }],
            steps: [{ instruction: "Shake with ice" }],
            garnishes: [{ name: "Lime wheel" }],
          },
        },
      },
    }),
  );
  seeded = { product, recipe, run };
}

test.beforeAll(async () => {
  fx = await createInventoryRecipesFixture();
  await seedModuleData();
});

test.afterAll(async () => {
  if (fx) await fx.teardown();
});

test.describe("Bar Inventory & Recipes Location Scoping Acceptance", () => {
  test("Manager at Location A has Bar Inventory; switching to Location B updates active context while keeping Recipes", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.managerA, fx.locA);
    await page.goto(`/r/${fx.org.slug}`);

    // Expect active workspace to show Location A
    await expect(
      page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
    ).toContainText("Location A", { timeout: 45000 });

    // Open Bar Inventory tab
    await openTab(page, /^Bar Inventory(?:\s|$)/);
    await expect(page).toHaveURL(/tab=bar-inventory/);

    // Open Recipes tab
    await openTab(page, /^Recipes(?:\s|$)/);
    await expect(page).toHaveURL(/tab=recipes/);

    // Switch workspace from Location A to Location B
    await switchTo(page, fx.locB, "Location B");
    await expect(
      page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
    ).toContainText("Location B");

    // Recipes tab is still accessible at Location B
    await expect(page).toHaveURL(/tab=recipes/);
  });

  test("Manager B at Location B can access Bar Inventory and Recipes", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.managerB, fx.locB);
    await page.goto(`/r/${fx.org.slug}`);

    await expect(
      page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
    ).toContainText("Location B", { timeout: 45000 });

    // Open Bar Inventory tab
    await openTab(page, /^Bar Inventory(?:\s|$)/);
    await expect(page).toHaveURL(/tab=bar-inventory/);

    // Can access Recipes too
    await openTab(page, /^Recipes(?:\s|$)/);
    await expect(page).toHaveURL(/tab=recipes/);
  });

  test("Staff user can access Recipes but Bar Inventory is not available", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.staffA, fx.locA);
    await page.goto(`/r/${fx.org.slug}`);

    // Context indicator displays Location A
    await expect(page.getByTestId("context-indicator").first()).toContainText(
      "Location A",
      { timeout: 45000 },
    );

    // Bar Inventory should not be visible in navigation to staff
    await expect(
      page.getByRole("button", { name: /^Bar Inventory(?:\s|$)/ }),
    ).not.toBeVisible();

    // Staff user can open Recipes
    await openTab(page, /^Recipes(?:\s|$)/);
    await expect(page).toHaveURL(/tab=recipes/);
  });

  // ---- Content-level acceptance -------------------------------------------------
  // The tests above only prove navigation. These prove that the modules actually load
  // real data through the app's actor -> RPC -> RLS chain (an always-null actor would
  // render an error state instead of these rows).
  test("Manager A sees A's stock for the shared product (never B's), and the org recipe book", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.managerA, fx.locA);
    await page.goto(`/r/${fx.org.slug}`);
    await expect(
      page.getByRole("button", { name: /^Switch workspace. Current:/ }),
    ).toContainText("Location A", { timeout: 45000 });

    await openTab(page, /^Bar Inventory(?:s|$)/);
    const inventory = page.getByTestId("bar-inventory");
    await expect(inventory).toContainText(seeded.product, { timeout: 45000 });
    await expect(inventory).toContainText("12.5");
    await expect(inventory).not.toContainText("4.75");
    await expect(inventory).toContainText(fx.managerA.name);

    await openTab(page, /^Recipes(?:s|$)/);
    await expect(page.getByText(seeded.recipe).first()).toBeVisible({
      timeout: 45000,
    });
    await expect(
      page.getByRole("button", { name: /Add Recipe/ }),
    ).toBeVisible();

    // Manager A is only Staff at B. The shared navigation still offers the tab (it keys
    // off the org-role label), so the contract that matters is fail-closed: the database
    // refuses and NOTHING from either location is shown.
    await switchTo(page, fx.locB, "Location B");
    await openTab(page, /^Bar Inventory(?:s|$)/);
    // Give the (refused) data load time to settle so the absence below is meaningful.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);
    await expect(page.locator("body")).not.toContainText(seeded.product);
    await expect(page.locator("body")).not.toContainText("4.75");
    await expect(page.locator("body")).not.toContainText("12.5");
    await openTab(page, /^Recipes(?:s|$)/);
    await expect(page.getByText(seeded.recipe).first()).toBeVisible({
      timeout: 45000,
    });
  });

  test("Manager B sees B's own quantity for the same product, and the same recipe", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.managerB, fx.locB);
    await page.goto(`/r/${fx.org.slug}`);
    await expect(
      page.getByRole("button", { name: /^Switch workspace. Current:/ }),
    ).toContainText("Location B", { timeout: 45000 });

    await openTab(page, /^Bar Inventory(?:s|$)/);
    const inventory = page.getByTestId("bar-inventory");
    await expect(inventory).toContainText(seeded.product, { timeout: 45000 });
    await expect(inventory).toContainText("4.75");
    await expect(inventory).not.toContainText("12.5");

    await openTab(page, /^Recipes(?:s|$)/);
    await expect(page.getByText(seeded.recipe).first()).toBeVisible({
      timeout: 45000,
    });
  });

  test("Staff reads the shared recipe book but cannot edit it", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.staffA, fx.locA);
    await page.goto(`/r/${fx.org.slug}`);
    await expect(page.getByTestId("context-indicator").first()).toContainText(
      "Location A",
      { timeout: 45000 },
    );
    await openTab(page, /^Recipes(?:s|$)/);
    await expect(page.getByText(seeded.recipe).first()).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByRole("button", { name: /Add Recipe/ })).toHaveCount(
      0,
    );
  });

  test("A user from another organization never sees this organization's data", async ({
    context,
    page,
  }) => {
    await authenticate(context, fx.foreignUser, fx.foreignLoc);
    await page.goto(`/r/${fx.org.slug}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);
    const body = page.locator("body");
    await expect(body).not.toContainText(seeded.product);
    await expect(body).not.toContainText(seeded.recipe);
    await expect(body).not.toContainText(fx.managerA.name);
  });
});
