import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  // MUST wait for hydration BEFORE filling the input, otherwise React
  // hydration resets the value (see tests/e2e/dashboard.spec.ts).
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

// Settings is reachable two different ways depending on viewport: a
// direct "Settings" button on desktop's second nav row, or "More" ->
// "Settings" in the mobile sheet (whose accessible name also carries a
// subtitle, so it can't use an exact match the way the desktop button
// can -- see restaurant-operations-app.tsx's mobile "More" sheet item).
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

test("manager sees the full Settings page and store hours changes persist", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openSettings(page);

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shift hours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Store hours" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  // Playwright's own webServer always runs in demo mode (see
  // playwright.config.ts), which has no data source for payroll yet --
  // Pay rates is correctly absent here, the same way the Payroll tab
  // itself is absent from nav in demo mode.
  await expect(page.getByRole("heading", { name: "Pay rates" })).toHaveCount(0);

  // Edit store hours and confirm the change round-trips back into the
  // page's own read model (the same operatingHours state the header
  // countdown pill reads from -- see saveScheduleConfig).
  await page.getByRole("button", { name: "Edit hours" }).click();
  await expect(
    page.getByRole("heading", { name: "Restaurant hours" }),
  ).toBeVisible();
  const mondayOpening = page.getByLabel("Mon opening");
  await mondayOpening.fill("09:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(
    page.getByRole("heading", { name: "Restaurant hours" }),
  ).toHaveCount(0);
  await expect(page.getByText("09:00 – 23:00")).toBeVisible();
});

test("Team quick-link card navigates and Back returns to the operational view", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openSettings(page);
  await page
    .getByRole("button", { name: "Team Rename, set designation" })
    .click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();

  await openSettings(page);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toHaveCount(0);
});

test("staff sees only their account settings and read-only store hours", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openSettings(page);

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shift hours" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Schedule" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pay rates" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit hours" })).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Store hours" }),
  ).toBeVisible();
  // Scoped to the Settings page's own Passcode card -- mobile also has a
  // separate "Change your passcode" icon button in the header itself.
  await expect(
    page
      .locator("#settings-passcode")
      .getByRole("button", { name: "Change your passcode" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
});
