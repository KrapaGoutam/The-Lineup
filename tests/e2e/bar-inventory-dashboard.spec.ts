import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-4: the Dashboard (six tiles, Order soon, Recently
// changed) in demo mode. Seeded counts: Tito's 3 (Critical) · Modelo 3 (Low) ·
// Casamigos 8 (Healthy) · House Rail Gin 5 (No cutoff). Demo passcode 2468 =
// manager.

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

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

/** Item names in a Dashboard section, in the table or the phone card list. */
async function namesIn(page: Page, section: string): Promise<string[]> {
  const region = page.getByRole("region", { name: section });
  if (section === "Order soon") {
    // Vendor groups: one item row per product, in group order.
    return region
      .getByTestId("order-item")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-name") ?? ""),
      );
  }
  const list = region.getByRole("list", { name: `${section} list` });
  if (await list.isVisible()) {
    return list
      .getByRole("article")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") ?? ""),
      );
  }
  return region
    .getByRole("table", { name: section })
    .locator("tbody tr")
    .evaluateAll(
      (rows, nameColumn) =>
        rows.map(
          (row) =>
            row.querySelectorAll("td")[nameColumn]?.textContent?.trim() ?? "",
        ),
      // Recently changed: Name, Vendor …
      0,
    );
}

async function inventoryNames(page: Page): Promise<string[]> {
  const list = page.getByRole("list", { name: "Inventory list" });
  if (await list.isVisible()) {
    return list
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

async function noPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

const tile = (page: Page, id: string) => page.getByTestId(`kpi-${id}`);

test("Dashboard is the landing view with the six tiles from the stock rules (BI-DASH-001, BI-DASH-005)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await expect(tab(page, "Dashboard")).toHaveAttribute("aria-selected", "true");

  const expected: Record<string, [string, number]> = {
    active: ["Active items", 4],
    critical: ["Critical", 1],
    low: ["Low", 1],
    healthy: ["Healthy", 1],
    noCutoff: ["No cutoff", 1],
    // The demo stamps its four seeded rows with the load time.
    recent: ["Recently changed", 4],
  };
  for (const [id, [label, count]] of Object.entries(expected)) {
    await expect(tile(page, id)).toContainText(label);
    await expect(tile(page, id)).toHaveAttribute(
      "aria-label",
      new RegExp(`^${label}: ${count}\\.`),
    );
  }
  await noPageHorizontalScroll(page);
});

test("Order soon lists only Critical and Low, most urgent first, with the suggested quantity", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  expect(await namesIn(page, "Order soon")).toEqual([
    "Tito's Handmade Vodka",
    "Modelo Especial",
  ]);
  const region = page.getByRole("region", { name: "Order soon" });
  // Tito's: Par 12 - Total 3 = 9 (the same figure the Inventory view shows).
  await expect(
    region.getByTestId("order-item").filter({ hasText: "Tito's Handmade" }),
  ).toContainText("Order 9");
  await expect(region.getByText("Healthy", { exact: true })).toHaveCount(0);

  // The shared table kit: global search adds to the filters.
  await region
    .getByRole("searchbox", { name: "Search Order soon" })
    .fill("modelo");
  expect(await namesIn(page, "Order soon")).toEqual(["Modelo Especial"]);
});

test("a tile opens Inventory with exactly the rows it counted (BI-DASH-006)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);

  await tile(page, "critical").click();
  await expect(tab(page, "Inventory")).toHaveAttribute("aria-selected", "true");
  expect(await inventoryNames(page)).toEqual(["Tito's Handmade Vodka"]);
  expect(page.url()).toContain("inv.f.status");

  await tab(page, "Dashboard").click();
  await tile(page, "low").click();
  expect(await inventoryNames(page)).toEqual(["Modelo Especial"]);

  await tab(page, "Dashboard").click();
  await tile(page, "active").click();
  expect(await inventoryNames(page)).toHaveLength(4);
  expect(page.url()).not.toContain("inv.f.status");
});

test("a count change shows up under Recently changed and in its tile", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  expect(await namesIn(page, "Recently changed")).toHaveLength(4);

  await tab(page, "Inventory").click();
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

  await tab(page, "Dashboard").click();
  await expect(tile(page, "recent")).toHaveAttribute(
    "aria-label",
    /^Recently changed: 4\./,
  );
  // Total 12 is above the warning level: Healthy now, so it left Order soon.
  await expect(tile(page, "critical")).toHaveAttribute(
    "aria-label",
    /^Critical: 0\./,
  );
  expect(await namesIn(page, "Order soon")).toEqual(["Modelo Especial"]);
  // Newest first: the item just counted leads the list.
  expect((await namesIn(page, "Recently changed"))[0]).toBe(
    "Tito's Handmade Vodka",
  );

  await tile(page, "recent").click();
  expect(await inventoryNames(page)).toHaveLength(4);
  expect(page.url()).toContain("inv.f.updated");
});

test("the movement insights rank real ledger movement (BI-7)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  const insights = page.getByRole("region", { name: "Movement insights" });
  const fastest = insights.getByRole("list", { name: "Fastest moving" });
  await expect(fastest.getByTestId("insight-item")).toHaveText([
    /Modelo Especial.*1\.5\/day/,
    /Tito's Handmade Vodka.*0\.4\/day/,
    /Casamigos Blanco.*0\.17\/day/,
  ]);
  const hitting = insights.getByRole("list", {
    name: "Frequently hitting cutoff",
  });
  await expect(hitting.getByTestId("insight-item")).toHaveText([
    /Tito's Handmade Vodka.*2×/,
  ]);
});

const orderRegion = (page: Page) =>
  page.getByRole("region", { name: "Order soon" });

test("Order soon is grouped by vendor with counts and a suggested total; groups collapse (BI-DASH-002)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  const groups = orderRegion(page).getByTestId("order-group");
  await expect(groups).toHaveCount(2);
  // Most Critical items first: Faust (1 critical) before Del Papa (1 low).
  await expect(groups.nth(0)).toHaveAttribute("data-vendor", "Faust");
  await expect(groups.nth(1)).toHaveAttribute("data-vendor", "Del Papa");
  await expect(groups.nth(0)).toContainText(
    "1 needs attention · 1 critical · 0 low",
  );
  await expect(groups.nth(0)).toContainText("suggested total 9");
  await expect(groups.nth(1)).toContainText(
    "1 needs attention · 0 critical · 1 low",
  );

  const toggle = groups.nth(0).getByRole("button", { name: /Faust/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(groups.nth(0).getByTestId("order-item")).toHaveCount(0);
  await toggle.click();
  await expect(groups.nth(0).getByTestId("order-item")).toHaveCount(1);
  await noPageHorizontalScroll(page);
});

test("the column filters work on the grouped view at every width", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  const region = orderRegion(page);
  await region.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet
    .getByRole("group", { name: "Vendor options" })
    .getByRole("checkbox", { name: /Del Papa/ })
    .check();
  await sheet.getByRole("button", { name: /^Show \d+ rows?$/ }).click();
  expect(await namesIn(page, "Order soon")).toEqual(["Modelo Especial"]);
  await expect(region.getByTestId("order-group")).toHaveCount(1);
  await region.getByRole("button", { name: "Clear all (1)" }).click();
  expect(await namesIn(page, "Order soon")).toHaveLength(2);
});

test("exporting recommendations downloads what is shown, and only that (BI-DASH-004)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  const region = orderRegion(page);

  const all = page.waitForEvent("download");
  await region.getByRole("button", { name: "Export recommendations" }).click();
  await page.getByRole("button", { name: "Download CSV" }).click();
  const full = await all;
  expect(full.suggestedFilename()).toMatch(
    /^bar-inventory_.+_order-recommendations_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const fullText = await readFile((await full.path()) as string, "utf8");
  expect(fullText).toContain("Faust,Tito's Handmade Vodka");
  expect(fullText).toContain("Del Papa,Modelo Especial");
  expect(fullText).not.toContain("Casamigos");

  // With a search on, the person can still export everything, or just what is shown.
  await region
    .getByRole("searchbox", { name: "Search Order soon" })
    .fill("modelo");
  await region.getByRole("button", { name: "Export recommendations" }).click();
  await expect(page.getByLabel("Filtered rows (1)")).toBeChecked();
  const filtered = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const filteredDownload = await filtered;
  expect(filteredDownload.suggestedFilename()).toContain("-filtered");
  const filteredText = await readFile(
    (await filteredDownload.path()) as string,
    "utf8",
  );
  expect(filteredText).toContain("Del Papa,Modelo Especial");
  expect(filteredText).not.toContain("Tito's");
});
