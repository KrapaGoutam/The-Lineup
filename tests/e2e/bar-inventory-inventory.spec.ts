import { expect, test, type Locator, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-3: the Inventory table, column filters, sorting, inline
// edit and the phone card layout, in demo mode (the in-memory engine mirrors
// the RPCs; the database is covered by pgTAP and the hosted suites).
// Seeded counts: Tito's 3 (Critical) · Modelo 3 (Low) · Casamigos 8 (Healthy)
// · House Rail Gin 5 (No cutoff). Demo passcode 2468 = manager.

async function signIn(page: Page, passcode = "2468") {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openInventory(page: Page) {
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
  // The module lands on the Dashboard; these tests are about the Inventory view.
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Inventory", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}

// Phones (below md) show cards plus a Filters button instead of the table.
const isCards = (page: Page) =>
  page.getByRole("button", { name: /^Filters/ }).isVisible();

/** Item names in the order shown, in the table or the card list. */
async function names(page: Page): Promise<string[]> {
  if (await isCards(page)) {
    return page
      .getByRole("list", { name: "Inventory list" })
      .getByRole("article")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") ?? ""),
      );
  }
  return page
    .getByRole("table", { name: "Inventory" })
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map(
        (row) => row.querySelectorAll("td")[1]?.textContent?.trim() ?? "",
      ),
    );
}

/** A column's filter panel: header popover on desktop/tablet, the sheet on phones. */
async function openFilter(page: Page, label: string): Promise<Locator> {
  if (await isCards(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    return page.getByRole("dialog", { name: "Filters" });
  }
  await page
    .getByRole("button", { name: `Filter ${label}`, exact: true })
    .click();
  return page.getByRole("dialog", { name: `${label} filter` });
}

async function closeFilter(page: Page, panel: Locator) {
  if (await isCards(page)) {
    await panel.getByRole("button", { name: /^Show \d+ rows?$/ }).click();
  } else {
    await panel.getByRole("button", { name: "Done" }).click();
  }
}

async function noPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Critical first; status shown as icon + text; counts from the golden rules (BI-INV-001, BI-CALC-004)", async ({
  page,
}) => {
  await signIn(page);
  await openInventory(page);
  expect(await names(page)).toEqual([
    "Tito's Handmade Vodka",
    "Modelo Especial",
    "Casamigos Blanco",
    "House Rail Gin",
  ]);
  const shown = (await isCards(page))
    ? page.getByRole("list", { name: "Inventory list" })
    : page.getByRole("table", { name: "Inventory" });
  for (const status of ["Critical", "Low", "Healthy", "No cutoff"]) {
    await expect(
      shown.getByText(status, { exact: true }).first(),
    ).toBeVisible();
  }
  if (await isCards(page)) {
    const tito = page.getByRole("article", { name: "Tito's Handmade Vodka" });
    await expect(tito).toContainText("Total 3");
    await expect(tito).toContainText("Order 9");
  } else {
    const row = page
      .getByRole("table", { name: "Inventory" })
      .getByRole("row", { name: /Tito's Handmade Vodka/ });
    await expect(row).toContainText("Critical");
    await expect(row).toContainText("9");
  }
  await noPageHorizontalScroll(page);
});

test("filters: text, multi-select, numeric, status, date; chips; Clear filter / Clear all (BI-FLT-001..006)", async ({
  page,
}) => {
  await signIn(page);
  await openInventory(page);

  // text: contains
  let panel = await openFilter(page, "Name");
  await panel.getByLabel("Name text").fill("gin");
  await closeFilter(page, panel);
  expect(await names(page)).toEqual(["House Rail Gin"]);
  await expect(
    page.getByRole("button", { name: /Remove filter Name contains “gin”/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Remove filter Name contains/ })
    .click();
  expect(await names(page)).toHaveLength(4);

  // multi-select vendor
  panel = await openFilter(page, "Vendor");
  await panel
    .getByRole("group", { name: "Vendor options" })
    .getByRole("checkbox", { name: /Faust/ })
    .check();
  await closeFilter(page, panel);
  expect(await names(page)).toEqual([
    "Tito's Handmade Vodka",
    "Casamigos Blanco",
    "House Rail Gin",
  ]);

  // numeric AND across columns: Faust AND total <= 5
  panel = await openFilter(page, "Total");
  await panel.getByLabel("Total comparison").selectOption("lte");
  await panel.getByLabel("Total value").fill("5");
  await closeFilter(page, panel);
  expect(await names(page)).toEqual([
    "Tito's Handmade Vodka",
    "House Rail Gin",
  ]);
  await expect(page.getByText("2 of 4 rows match")).toBeVisible();

  // status
  panel = await openFilter(page, "Status");
  await panel
    .getByRole("group", { name: "Status options" })
    .getByRole("checkbox", { name: /^Critical/ })
    .check();
  await closeFilter(page, panel);
  expect(await names(page)).toEqual(["Tito's Handmade Vodka"]);

  // Clear all removes every chip at once
  await page.getByRole("button", { name: /^Clear all/ }).click();
  expect(await names(page)).toHaveLength(4);
  await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(
    0,
  );

  // date: everything was updated today; a custom range in the past matches nothing
  panel = await openFilter(page, "Last updated");
  await panel.getByRole("radio", { name: "Today" }).check();
  await closeFilter(page, panel);
  expect(await names(page)).toHaveLength(4);
  panel = await openFilter(page, "Last updated");
  await panel.getByRole("radio", { name: "Custom range" }).check();
  await panel.getByLabel("Last updated from").fill("2000-01-01");
  await panel.getByLabel("Last updated to").fill("2000-01-02");
  await closeFilter(page, panel);
  await expect(page.getByText("No items match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear all filters" }).click();
  expect(await names(page)).toHaveLength(4);
});

test("the global search adds to the column filters, never replaces them", async ({
  page,
}) => {
  await signIn(page);
  await openInventory(page);
  const panel = await openFilter(page, "Vendor");
  await panel
    .getByRole("group", { name: "Vendor options" })
    .getByRole("checkbox", { name: /Faust/ })
    .check();
  await closeFilter(page, panel);
  await page
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("blanco");
  expect(await names(page)).toEqual(["Casamigos Blanco"]);
  await page
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("modelo");
  await expect(page.getByText("No items match these filters.")).toBeVisible();
});

test("sorting by header and by preset (BI-FLT-008)", async ({ page }) => {
  await signIn(page);
  await openInventory(page);
  await page
    .getByRole("combobox", { name: "Sort order" })
    .selectOption({ label: "Name A–Z" });
  expect(await names(page)).toEqual([
    "Casamigos Blanco",
    "House Rail Gin",
    "Modelo Especial",
    "Tito's Handmade Vodka",
  ]);
  await page
    .getByRole("combobox", { name: "Sort order" })
    .selectOption({ label: "Lowest stock first" });
  expect((await names(page))[3]).toBe("Casamigos Blanco");
  if (!(await isCards(page))) {
    const total = page.getByRole("columnheader", { name: /^Total/ });
    await total.getByRole("button", { name: /^Total/ }).click();
    await expect(total).toHaveAttribute("aria-sort", /ascending|descending/);
  }
});

test("inline edit: reason step, validation, Escape, silent level edit (BI-INV-002/006)", async ({
  page,
}) => {
  await signIn(page);
  await openInventory(page);
  test.skip(
    await isCards(page),
    "phones edit through the item sheet (next test)",
  );

  const cell = (text: RegExp) => page.getByRole("button", { name: text });
  const onHandGin = /Edit On hand for House Rail Gin, currently (\d+)/;

  // Escape reverts without saving
  await cell(/Edit On hand for House Rail Gin, currently 5/).click();
  await page.getByLabel("On hand for House Rail Gin").fill("9");
  await page.getByLabel("On hand for House Rail Gin").press("Escape");
  await expect(
    cell(/Edit On hand for House Rail Gin, currently 5/),
  ).toBeVisible();

  // validation: no more than two decimals
  await cell(onHandGin).click();
  await page.getByLabel("On hand for House Rail Gin").fill("1.234");
  await page.getByLabel("On hand for House Rail Gin").press("Enter");
  await expect(page.getByText("Use at most two decimal places.")).toBeVisible();
  await page.getByLabel("On hand for House Rail Gin").press("Escape");

  // quantity edit: Enter -> reason group -> save
  await cell(/Edit On hand for House Rail Gin, currently 5/).click();
  await page.getByLabel("On hand for House Rail Gin").fill("4");
  await page.getByLabel("On hand for House Rail Gin").press("Enter");
  const reason = page.getByRole("group", {
    name: "Reason for changing On hand",
  });
  await expect(reason).toBeVisible();
  await reason.getByLabel("Reason").selectOption({ label: "Usage" });
  await reason.getByRole("button", { name: "Save" }).click();
  await expect(
    cell(/Edit On hand for House Rail Gin, currently 4/),
  ).toBeVisible();

  // levels commit silently; the status follows (total 4 vs cutoff 6 -> Critical)
  await cell(/Edit Cutoff for House Rail Gin, currently —/).click();
  await page.getByLabel("Cutoff for House Rail Gin").fill("6");
  await page.getByLabel("Cutoff for House Rail Gin").press("Enter");
  await expect(
    cell(/Edit Cutoff for House Rail Gin, currently 6/),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Inventory" })
      .getByRole("row", { name: /House Rail Gin/ }),
  ).toContainText("Critical");
});

test("item sheet and quick adjust work on every size; phones get cards without page scroll (BI-INV-001/005)", async ({
  page,
}) => {
  await signIn(page);
  await openInventory(page);

  if (await isCards(page)) {
    const gin = page.getByRole("article", { name: "House Rail Gin" });
    await gin.getByRole("button", { name: /One used: House Rail Gin/ }).click();
    await expect(gin).toContainText("Total 4");
    await gin
      .getByRole("button", { name: /One received: House Rail Gin/ })
      .click();
    await expect(gin).toContainText("Total 5");
  }

  await page
    .getByRole("button", { name: /^Adjust/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Tito's Handmade Vodka" });
  await sheet.getByLabel("On hand").fill("10");
  await sheet.getByLabel("Backup").fill("2");
  await sheet
    .getByLabel("Reason")
    .selectOption({ label: "Delivery / Restock" });
  await sheet.getByRole("button", { name: "Save count" }).click();
  await expect(sheet).toBeHidden();
  // total 12 > warning 6 -> Healthy now
  const status = (await isCards(page))
    ? page.getByRole("article", { name: "Tito's Handmade Vodka" })
    : page
        .getByRole("table", { name: "Inventory" })
        .getByRole("row", { name: /Tito's Handmade Vodka/ });
  await expect(status).toContainText("Healthy");
  await noPageHorizontalScroll(page);
});

test("the column chooser hides a column (desktop/tablet)", async ({ page }) => {
  await signIn(page);
  await openInventory(page);
  test.skip(await isCards(page), "phones use cards");
  const table = page.getByRole("table", { name: "Inventory" });
  await expect(
    table.getByRole("columnheader", { name: /^Vendor/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Columns" }).click();
  await page
    .getByRole("dialog", { name: "Choose columns" })
    .getByRole("checkbox", { name: "Vendor", exact: true })
    .uncheck();
  await expect(
    table.getByRole("columnheader", { name: /^Vendor/ }),
  ).toHaveCount(0);
});
