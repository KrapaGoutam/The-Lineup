import { expect, test, type Page } from "@playwright/test";

// Tasks V1.1 / T-1 (TS-001..TS-005): a normal launch lands on Tasks -> Today,
// an explicit `?tab=` module is respected, and history navigation works.
// Demo passcodes: 2468 Maya Singh (manager), 1357 Mia Chen (staff).

async function signInAt(page: Page, url: string, passcode: string) {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

const tasksHeading = (page: Page) =>
  page.getByRole("heading", { name: "Tasks", exact: true });

/** Open a module from the nav, using "More" when it is not a direct button. */
async function openModule(page: Page, name: string) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.first().isVisible()) {
    await direct.first().click();
    return;
  }
  const more = page.getByRole("button", { name: "More" });
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("TS-001: sign-in with no requested module lands on Tasks -> Today", async ({
  page,
}) => {
  await signInAt(page, "/", "2468");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  // Staff land there too.
  await page
    .getByRole("button", { name: "Account and quick settings" })
    .first()
    .click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByLabel("Restaurant passcode")).toBeVisible();
  await page.getByLabel("Restaurant passcode").fill("1357");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
});

test("TS-002: ?tab=allocation opens Table Allocation, and a reload keeps it", async ({
  page,
}) => {
  await signInAt(page, "/?tab=allocation", "2468");
  await expect(
    page.getByRole("heading", { name: "Table allocation rotation" }),
  ).toBeVisible();

  // Demo state lives in memory, so a reload returns to the sign-in screen;
  // the requested module must survive it.
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("heading", { name: "Table allocation rotation" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=allocation/);
});

test("TS-003: ?tab=schedule opens Schedule", async ({ page }) => {
  await signInAt(page, "/?tab=schedule", "2468");
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
});

test("TS-004: switching modules updates the URL and back/forward follow it", async ({
  page,
}) => {
  await signInAt(page, "/", "2468");
  await expect(tasksHeading(page)).toBeVisible();

  await openModule(page, "Schedule");
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=schedule/);

  await page.goBack();
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page).not.toHaveURL(/tab=/);

  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
});

test("TS-005: a module the role cannot open falls back to Tasks", async ({
  page,
}) => {
  await signInAt(page, "/?tab=bar-inventory", "1357");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toHaveCount(0);
  // The URL must not keep naming a module the viewer is not looking at.
  await expect(page).not.toHaveURL(/tab=/);
});

test("TS-002: ?tab=tasks opens Tasks -> Today", async ({ page }) => {
  await signInAt(page, "/?tab=tasks", "2468");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
});

test("TS-006: an invalid ?tab= falls back to Tasks and the URL is corrected", async ({
  page,
}) => {
  await signInAt(page, "/?tab=not-a-module&x=1", "2468");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  // The bad value is dropped; unrelated parameters survive.
  await expect(page).toHaveURL(/\/\?x=1$/);
});

test("TS-008: /r/<slug>?tab= keeps the restaurant route and selects the module", async ({
  page,
}) => {
  await signInAt(page, "/r/the-monks?tab=schedule", "2468");
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/r\/the-monks\?tab=schedule$/);

  // Switching modules keeps the restaurant path.
  await openModule(page, "Tasks");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/r\/the-monks$/);
  await openModule(page, "Schedule");
  await expect(page).toHaveURL(/\/r\/the-monks\?tab=schedule$/);

  // Back follows the same path.
  await page.goBack();
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/r\/the-monks$/);
});

test("TS-008: the bare restaurant route lands on Tasks", async ({ page }) => {
  await signInAt(page, "/r/the-monks", "2468");
  await expect(tasksHeading(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
});

test("TS-007: ?tab=bar-inventory opens Bar Inventory for a manager and survives a reload", async ({
  page,
}) => {
  await signInAt(page, "/?tab=bar-inventory", "2468");
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();

  // Demo state is in memory, so a reload returns to the passcode screen; the
  // requested module must survive it (same as TS-002).
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=bar-inventory/);
});

test("TS-009: the mobile dock highlights Tasks on a default launch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAt(page, "/", "2468");
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(dock.getByRole("button", { name: /^Tasks/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    dock.getByRole("button", { name: /Allocation/ }),
  ).not.toHaveAttribute("aria-current", "page");
});
