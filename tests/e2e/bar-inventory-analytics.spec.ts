import { expect, test, type Locator, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-7: Analytics from the ledger, in demo mode. The demo
// seeds back-dated, deterministic chains per product (see DEMO_HISTORY):
//   Tito's   12 units in 30 d = 0.4/day, 2.8/week, 2 cutoff hits, at/below cutoff
//   Modelo   45 units in 30 d = 1.5/day, runs out in "0–1 days"
//   Casamigos 5 units in 30 d, "17–30 days"
//   Gin      only 2 uses: not enough history, no cutoff
// Demo passcode 2468 = manager.

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

async function openAnalytics(page: Page) {
  await page.getByRole("button", { name: "See analytics" }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByTestId("an-stat-depletion")).toBeVisible();
}

const itemRegion = (page: Page) =>
  page.getByRole("region", { name: "Item movement" });
const vendorRegion = (page: Page) =>
  page.getByRole("region", { name: "Vendor demand" });
const stat = (page: Page, id: string) => page.getByTestId(`an-stat-${id}`);

const isCards = (region: Locator) =>
  region.getByRole("button", { name: /^Filters/ }).isVisible();

/** The item (or vendor) row/card, whichever the width shows. */
async function rowFor(region: Locator, name: string): Promise<Locator> {
  return (await isCards(region))
    ? region.getByRole("article", { name })
    : region.getByRole("row", { name: new RegExp(name) });
}

/** Names in order, from table rows (column `nameColumn`) or phone cards. */
async function namesIn(region: Locator, nameColumn: number): Promise<string[]> {
  if (await isCards(region)) {
    return region
      .getByRole("article")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") ?? ""),
      );
  }
  return region.locator("tbody tr").evaluateAll(
    (rows, col) =>
      rows.map((r) =>
        (r.querySelectorAll("td")[col]?.textContent ?? "")
          .trim()
          // The item cell carries its size ("Modelo Especial 12 oz").
          .replace(/ \d[\d.]* ?(?:mL|oz|L)$/, ""),
      ),
    nameColumn,
  );
}

async function noPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the Analytics view totals the last 30 days from the ledger, split Confirmed vs Observed", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);

  // 12 + 5 + 45 + 3 units; Confirmed 55 (explicit Usage), Observed 10 (count variances).
  await expect(stat(page, "depletion")).toContainText("65");
  await expect(stat(page, "depletion")).toContainText("Confirmed 55");
  await expect(stat(page, "depletion")).toContainText("Observed 10");
  await expect(stat(page, "perDay")).toContainText("2.17");
  await expect(stat(page, "perWeek")).toContainText("15.17");
  // Restocks in the window: Tito's +10 and Modelo +24 (Casamigos' was 30 days ago).
  await expect(stat(page, "restocked")).toContainText("34");
  await expect(stat(page, "restocks")).toContainText("2");
  await expect(stat(page, "hits")).toContainText("2");
  await noPageHorizontalScroll(page);
});

test("the observed-depletion toggle removes count variances from the totals only", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);

  await page.getByLabel("Include observed depletion").uncheck();
  await expect(stat(page, "depletion")).toContainText("55");
  await expect(stat(page, "perDay")).toContainText("1.83");
  // Restocks are not consumption either way.
  await expect(stat(page, "restocked")).toContainText("34");
  await page.getByLabel("Include observed depletion").check();
  await expect(stat(page, "depletion")).toContainText("65");
});

test("items rank by movement; thin data has no rate and no estimate", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);
  const region = itemRegion(page);

  // Default order is "Fastest moving"; unranked items fall to the bottom.
  expect(await namesIn(region, 1)).toEqual([
    "Modelo Especial",
    "Tito's Handmade Vodka",
    "Casamigos Blanco",
    "House Rail Gin",
  ]);

  const modelo = await rowFor(region, "Modelo Especial");
  await expect(modelo).toContainText("1.5");
  await expect(modelo).toContainText("0–1 days");
  const tito = await rowFor(region, "Tito's Handmade Vodka");
  await expect(tito).toContainText("0.4");
  await expect(tito).toContainText("2.8");
  await expect(tito).toContainText("At or below cutoff");
  const casa = await rowFor(region, "Casamigos Blanco");
  await expect(casa).toContainText("17–30 days");
  const gin = await rowFor(region, "House Rail Gin");
  await expect(gin).toContainText("Not enough history");
  await expect(gin).not.toContainText(/\d+–\d+ days/);
});

test("a shorter period re-reads the window; an inverted custom range is refused", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);

  await page.getByLabel("Analytics period").selectOption("7");
  // Last 7 days: Modelo 14 (days 5, 3, 1) + Casamigos 2 (days 5, 2).
  await expect(stat(page, "depletion")).toContainText("16");
  await expect(stat(page, "perDay")).toContainText("2.29");

  await page.getByLabel("Analytics period").selectOption("custom");
  await page.getByLabel("From").fill("2099-01-01");
  await expect(
    page.getByText("Choose a start date on or before the end date."),
  ).toBeVisible();
});

test("the item filters narrow the table and the totals together", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);
  const region = itemRegion(page);

  if (await isCards(region)) {
    await region.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet
      .getByRole("group", { name: "Vendor options" })
      .getByRole("checkbox", { name: /Del Papa/ })
      .check();
    await sheet.getByRole("button", { name: /^Show \d+ rows?$/ }).click();
  } else {
    await region
      .getByRole("button", { name: "Filter Vendor", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Vendor filter" });
    await panel
      .getByRole("group", { name: "Vendor options" })
      .getByRole("checkbox", { name: /Del Papa/ })
      .check();
    await panel.getByRole("button", { name: "Done" }).click();
  }
  expect(await namesIn(region, 1)).toEqual(["Modelo Especial"]);
  // Modelo alone: 41 confirmed + 4 observed = 45.
  await expect(stat(page, "depletion")).toContainText("45");
  await expect(stat(page, "depletion")).toContainText("Confirmed 41");
});

test("vendor demand adds depletion, what to order now, and restocks per vendor", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);
  const region = vendorRegion(page);

  // Most depletion first: Del Papa 45, Faust 20.
  expect(await namesIn(region, 0)).toEqual(["Del Papa", "Faust"]);
  const delPapa = await rowFor(region, "Del Papa");
  await expect(delPapa).toContainText("45");
  // Modelo is Low (3 vs par 12): order 9 now.
  await expect(delPapa).toContainText("9");
  const faust = await rowFor(region, "Faust");
  await expect(faust).toContainText("20");
  await noPageHorizontalScroll(page);
});

test("the Dashboard's See analytics opens it and Back returns", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await openAnalytics(page);
  await page
    .getByTestId("bar-inventory-analytics")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Dashboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
