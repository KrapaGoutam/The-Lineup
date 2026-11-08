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

test.beforeAll(async () => {
  fx = await createInventoryRecipesFixture();
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
});
