import { expect, test, type Locator, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-6: the History view over the immutable ledger and the
// per-item History in the item sheet, in demo mode (the in-memory engine keeps
// the same kind of ledger; the database is covered by pgTAP and the hosted
// suites). Demo passcode 2468 = manager.

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

const isCards = (page: Page) =>
  page.getByRole("button", { name: /^Filters/ }).isVisible();

const TITOS = "Tito's Handmade Vodka";

/** Opens an item's sheet by name: rows re-sort as their statuses change. */
async function openItemSheet(page: Page, item: string): Promise<Locator> {
  await tab(page, "Inventory").click();
  const trigger = (await isCards(page))
    ? page
        .getByRole("article", { name: item })
        .getByRole("button", { name: /^Adjust/ })
    : page.getByRole("button", { name: `Adjust ${item}`, exact: true });
  await trigger.click();
  return page.getByRole("dialog", { name: item });
}

/** Sets an item's counts with a reason. */
async function adjust(
  page: Page,
  item: string,
  counts: { onHand: string; backup: string },
  reason: string,
) {
  const sheet = await openItemSheet(page, item);
  await sheet.getByLabel("On hand").fill(counts.onHand);
  await sheet.getByLabel("Backup").fill(counts.backup);
  await sheet.getByLabel("Reason").selectOption({ label: reason });
  await sheet.getByRole("button", { name: "Save count" }).click();
  await expect(sheet).toBeHidden();
}

async function openHistory(page: Page) {
  await tab(page, "Dashboard").click();
  await page.getByRole("button", { name: "Full history" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
}

/** Item names in the History view, newest first, in the table or the card list. */
async function historyItems(page: Page): Promise<string[]> {
  const list = page.getByRole("list", { name: "History list" });
  if (await list.isVisible()) {
    return list
      .getByRole("article")
      .evaluateAll((els) =>
        els.map((el) => (el.getAttribute("aria-label") ?? "").split(",")[0]),
      );
  }
  return page
    .getByRole("table", { name: "History" })
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        (row.querySelectorAll("td")[2]?.textContent ?? "")
          .replace("Archived", "")
          .trim(),
      ),
    );
}

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

test("History opens from the Dashboard and from Inventory, newest change first (BI-HIST newest-first)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await adjust(
    page,
    TITOS,
    { onHand: "10", backup: "2" },
    "Delivery / Restock",
  );

  await openHistory(page);
  expect((await historyItems(page))[0]).toBe("Tito's Handmade Vodka");
  const first = (await isCards(page))
    ? page
        .getByRole("list", { name: "History list" })
        .getByRole("article")
        .first()
    : page.getByRole("table", { name: "History" }).locator("tbody tr").first();
  await expect(first).toContainText("Delivery / Restock");
  await expect(first).toContainText("Maya Singh");
  // Tito's was 2 on hand and 1 backup: the change is +8 and +1.
  if (await isCards(page)) {
    await expect(first).toContainText("On hand 2 → 10 (+8)");
    await expect(first).toContainText("Backup 1 → 2 (+1)");
  } else {
    await expect(first).toContainText("+8");
    await expect(first).toContainText("+1");
  }
  await noPageHorizontalScroll(page);

  // Back returns to Inventory, which has its own History entry point.
  await page
    .getByTestId("bar-inventory-history")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(tab(page, "Inventory")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
});

test("History filters: reason, then search added to it, then Clear all (BI-HIST filters)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await adjust(
    page,
    TITOS,
    { onHand: "10", backup: "2" },
    "Delivery / Restock",
  );
  await adjust(page, TITOS, { onHand: "9", backup: "2" }, "Usage");

  await openHistory(page);
  const all = await historyItems(page);
  expect(all.length).toBeGreaterThanOrEqual(2);

  const panel = await openFilter(page, "Reason");
  await panel
    .getByRole("group", { name: "Reason options" })
    .getByRole("checkbox", { name: /Usage/ })
    .check();
  await closeFilter(page, panel);
  const usage = await historyItems(page);
  expect(usage.length).toBeLessThan(all.length);
  expect(usage[0]).toBe("Tito's Handmade Vodka");

  // The global search narrows what the filter left, never replaces it.
  await page
    .getByRole("searchbox", { name: "Search History" })
    .fill("nothing-matches-this");
  await expect(page.getByText("No items match these filters.")).toBeVisible();

  await page
    .getByRole("list", { name: "Active filters" })
    .getByRole("button", { name: /^Clear all/ })
    .click();
  expect(await historyItems(page)).toHaveLength(all.length);
});

test("an item's own History shows its changes with the reason and who made them (BI-HIST item detail)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await adjust(
    page,
    TITOS,
    { onHand: "10", backup: "2" },
    "Delivery / Restock",
  );

  const sheet = await openItemSheet(page, TITOS);
  const toggle = sheet.getByRole("button", { name: "History" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const latest = sheet.getByTestId("item-history-entry").first();
  await expect(latest).toContainText("On hand 2 → 10 (+8)");
  await expect(latest).toContainText("Delivery / Restock");
  await expect(latest).toContainText("Maya Singh");
});
