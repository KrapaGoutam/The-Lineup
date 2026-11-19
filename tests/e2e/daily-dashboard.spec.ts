import { expect, test, type Page } from "@playwright/test";

// V2.0.9 Daily Operations Dashboard, demo workspace (sample data, no database).
// Real-database reconciliation of each figure is covered by the focused unit/action tests.

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  // Wait for hydration BEFORE filling the input (see dashboard.spec.ts).
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

// Behind the mobile "More" sheet on narrow viewports.
async function goToTab(page: Page, name: string) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const more = page.getByRole("button", { name: "More" });
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("manager Dashboard: cards, shortcuts, deep links and Back/Forward", async ({
  page,
}) => {
  await signIn(page, "2468");
  // The default landing is unchanged.
  await expect(page).not.toHaveURL(/tab=dashboard/);
  await goToTab(page, "Dashboard");

  await expect(page.getByTestId("dashboard-module")).toBeVisible();
  await expect(page).toHaveURL(/tab=dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/Sample data/)).toBeVisible();

  // Demo has no Payroll tab, so no Payroll card or shortcut.
  await expect(page.getByTestId("dashboard-card-attendance")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-tips")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-lowStock")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-payroll")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-card-tips-value")).toHaveText(
    "$180.01",
  );
  await expect(page.getByTestId("dashboard-card-lowStock-value")).toHaveText(
    "5",
  );
  await noHorizontalOverflow(page);

  // A card opens its real module and a reload keeps the destination.
  await page.getByTestId("dashboard-card-tips").getByRole("link").click();
  await expect(page).toHaveURL(/tab=tips/);
  await expect(
    page.getByRole("heading", { name: /Tip/i }).first(),
  ).toBeVisible();

  // Back returns to the Dashboard; Forward returns to Tips.
  await page.goBack();
  await expect(page).toHaveURL(/tab=dashboard/);
  await expect(page.getByTestId("dashboard-module")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/tab=tips/);

  // A direct dashboard URL lands on the Dashboard once signed in (the demo session itself
  // does not survive a full reload, so the sign-in happens after the navigation).
  await page.goto("/?tab=dashboard");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(page.getByTestId("dashboard-module")).toBeVisible({
    timeout: 60000,
  });
  await expect(page).toHaveURL(/tab=dashboard/);
});

test("manager Dashboard shortcuts open Tasks and Table Allocation", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Dashboard");
  await expect(page.getByTestId("dashboard-action-tasks")).toBeVisible();
  await page.getByTestId("dashboard-action-tasks").click();
  await expect(page).not.toHaveURL(/tab=dashboard/);
  await goToTab(page, "Dashboard");
  await page.getByTestId("dashboard-action-allocation").click();
  await expect(page).toHaveURL(/tab=allocation/);
});

test("staff Dashboard shows only their own tips and no management data", async ({
  page,
}) => {
  await signIn(page, "1357");
  await goToTab(page, "Dashboard");
  await expect(page.getByTestId("dashboard-module")).toBeVisible();
  await expect(page.getByText("My tips today")).toBeVisible();
  await expect(page.getByTestId("dashboard-card-tips-value")).toHaveText(
    "$45.00",
  );
  for (const hidden of ["attendance", "payroll", "lowStock"]) {
    await expect(page.getByTestId(`dashboard-card-${hidden}`)).toHaveCount(0);
  }
  await expect(page.getByTestId("dashboard-action-inventory")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-action-payroll")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-action-reporting")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-action-tips")).toContainText(
    "My Tips",
  );
  await noHorizontalOverflow(page);
});
