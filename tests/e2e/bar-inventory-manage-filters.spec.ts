import { expect, test, type Locator, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-3: every Manage table has a type-appropriate filter per
// column (BI-FLT-009), filter state is kept in the URL (BI-FLT-007).
// Demo passcode 2468 = manager. Seeded: vendors Faust (3 products) and Del Papa
// (1) plus the system Unassigned; categories Spirits (Vodka, Tequila) and Beer.

async function signIn(page: Page, passcode = "2468") {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openBarInventory(page: Page) {
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Bar Inventory" })
      .click();
  } else {
    await page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
}

async function openManage(page: Page, section: string) {
  await openBarInventory(page);
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("tab", { name: section, exact: true }).click();
}

const phone = (page: Page) =>
  page.getByRole("button", { name: /^Filters/ }).isVisible();

async function openFilter(page: Page, label: string): Promise<Locator> {
  if (await phone(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    return page.getByRole("dialog", { name: "Filters" });
  }
  await page
    .getByRole("button", { name: `Filter ${label}`, exact: true })
    .click();
  return page.getByRole("dialog", { name: `${label} filter` });
}

async function closeFilter(page: Page, panel: Locator) {
  if (await phone(page)) {
    await panel.getByRole("button", { name: /^Show \d+ rows?$/ }).click();
  } else {
    await panel.getByRole("button", { name: "Done" }).click();
  }
}

const rowCount = (page: Page, table: string) =>
  page.getByRole("table", { name: table }).locator("tbody tr").count();

test("Products: a filter on every kind of column (BI-FLT-009)", async ({
  page,
}) => {
  await signIn(page);
  await openManage(page, "Products");
  expect(await rowCount(page, "Products")).toBe(4);

  // multi-select: vendor
  let panel = await openFilter(page, "Vendor");
  await panel
    .getByRole("group", { name: "Vendor options" })
    .getByRole("checkbox", { name: /Del Papa/ })
    .check();
  await closeFilter(page, panel);
  expect(await rowCount(page, "Products")).toBe(1);
  await page.getByRole("button", { name: /^Clear all/ }).click();

  // text: SKU (starts with)
  panel = await openFilter(page, "SKU");
  await panel.getByLabel("SKU match").selectOption("startsWith");
  await panel.getByLabel("SKU text").fill("tit");
  await closeFilter(page, panel);
  expect(await rowCount(page, "Products")).toBe(1);
  await page.getByRole("button", { name: /^Clear all/ }).click();

  // text: Notes exists and matches nothing in the seed
  panel = await openFilter(page, "Notes");
  await panel.getByLabel("Notes text").fill("zzz");
  await closeFilter(page, panel);
  await expect(page.getByText("No items match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear all filters" }).click();
  expect(await rowCount(page, "Products")).toBe(4);
});

test("Vendors: numeric filter on Items; Status select (BI-FLT-009)", async ({
  page,
}) => {
  await signIn(page);
  await openManage(page, "Vendors");
  expect(await rowCount(page, "Vendors")).toBe(3);

  let panel = await openFilter(page, "Items");
  await panel.getByLabel("Items comparison").selectOption("gte");
  await panel.getByLabel("Items value").fill("2");
  await closeFilter(page, panel);
  expect(await rowCount(page, "Vendors")).toBe(1);
  await expect(
    page
      .getByRole("table", { name: "Vendors" })
      .getByRole("row", { name: /Faust/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Remove filter Items/ }).click();

  panel = await openFilter(page, "Status");
  await panel
    .getByRole("group", { name: "Status options" })
    .getByRole("checkbox", { name: /Active/ })
    .check();
  await closeFilter(page, panel);
  expect(await rowCount(page, "Vendors")).toBe(3);
});

test("Categories: subcategory filter; filters survive leaving the module and coming back (BI-FLT-007)", async ({
  page,
}) => {
  await signIn(page);
  await openManage(page, "Categories");
  const panel = await openFilter(page, "Subcategory");
  await panel
    .getByRole("group", { name: "Subcategory options" })
    .getByRole("checkbox", { name: /^Vodka/ })
    .check();
  await closeFilter(page, panel);
  expect(await rowCount(page, "Categories")).toBe(1);

  // the URL carries the state, scoped to this organization
  await expect.poll(() => page.url()).toContain("cat.f.subcategory");
  await expect.poll(() => page.url()).toContain("bi.org=");

  // leave Bar Inventory (Tasks is a primary module) and come back
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  const tasks = (await dock.isVisible())
    ? dock.getByRole("button", { name: "Tasks" })
    : page.getByRole("button", { name: "Tasks", exact: true });
  await tasks.click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await openManage(page, "Categories");
  expect(await rowCount(page, "Categories")).toBe(1);
  await expect(
    page.getByRole("button", { name: /Remove filter Subcategory/ }),
  ).toBeVisible();
});

test("a filter in the URL for another organization is ignored", async ({
  page,
}) => {
  await page.goto("/?bi.org=some-other-restaurant&prod.f.vendor=s%3AFaust");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
  await openManage(page, "Products");
  expect(await rowCount(page, "Products")).toBe(4);
  await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(
    0,
  );
});
