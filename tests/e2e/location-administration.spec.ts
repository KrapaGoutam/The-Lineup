import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

async function openSettings(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const desktopButton = page.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name: /^Settings/ }).click();
}

test.describe("Location Administration (V2-002.003)", () => {
  test("manager navigates to Locations, searches, and returns to Settings", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await openSettings(page);

    // Manager should see the Locations card in Settings
    const locationsCard = page.locator("#settings-locations");
    await expect(locationsCard).toBeVisible();
    await locationsCard.click();

    // Verify Location Administration view
    await expect(
      page.getByRole("heading", { name: "Locations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Manage restaurant branches, addresses, time zones and operating hours.",
      ),
    ).toBeVisible();

    // Verify existing locations are listed
    await expect(page.getByText("Webster Branch")).toBeVisible();
    await expect(page.getByText("NASA Branch")).toBeVisible();

    // Test search filter
    const searchInput = page.getByLabel("Search locations");
    await searchInput.fill("NASA");
    await expect(page.getByText("NASA Branch")).toBeVisible();
    await expect(page.getByText("Webster Branch")).toHaveCount(0);

    // Clear search filter
    await searchInput.fill("");
    await expect(page.getByText("Webster Branch")).toBeVisible();
    await expect(page.getByText("NASA Branch")).toBeVisible();

    // Return to Settings
    await page.getByRole("button", { name: "Back to Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
  });

  test("manager opens Add Location dialog and creates a new branch in demo mode", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await openSettings(page);
    await page.locator("#settings-locations").click();

    // Open Add Location dialog
    await page.getByRole("button", { name: "Add Location" }).click();
    await expect(
      page.getByRole("heading", { name: "Add New Location" }),
    ).toBeVisible();

    // Fill the location form
    await page.getByLabel("Location Name").fill("Clear Lake Branch");
    await page.getByLabel("Street Address").fill("1000 Bay Area Blvd");
    await page.getByLabel("City").fill("Houston");
    await page.getByLabel("State / Region").fill("TX");
    await page.getByLabel("Postal Code").fill("77058");

    // Submit form
    await page.getByRole("button", { name: "Create Location" }).click();

    // Dialog closes and new location is in the list
    await expect(
      page.getByRole("heading", { name: "Add New Location" }),
    ).toHaveCount(0);
    await expect(page.getByText("Clear Lake Branch")).toBeVisible();
    await expect(
      page.getByText("1000 Bay Area Blvd, Houston, TX, 77058"),
    ).toBeVisible();
  });

  test("manager opens Manage Location dialog and inspects Operating Hours", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await openSettings(page);
    await page.locator("#settings-locations").click();

    // Open manage dialog for Webster Branch
    await page.getByRole("button", { name: "Manage Webster Branch" }).click();
    await expect(
      page.getByRole("heading", { name: "Manage Webster Branch" }),
    ).toBeVisible();

    // Verify Edit Location Details tab
    await expect(page.getByLabel("Location Name")).toHaveValue(
      "Webster Branch",
    );

    // Switch to Operating Hours tab
    await page.getByRole("button", { name: "Hours" }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly Operating Hours" }),
    ).toBeVisible();
    await expect(page.getByText("Sunday")).toBeVisible();
    await expect(page.getByText("Monday")).toBeVisible();
    await expect(page.getByText("Saturday")).toBeVisible();

    // Close dialog
    await page.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("heading", { name: "Manage Webster Branch" }),
    ).toHaveCount(0);
  });

  test("staff does not see Locations quick-link card in Settings", async ({
    page,
  }) => {
    await signIn(page, "1357");
    await openSettings(page);

    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#settings-locations")).toHaveCount(0);
    await expect(page.getByText("Locations")).toHaveCount(0);
  });
});
