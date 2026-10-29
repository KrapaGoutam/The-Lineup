import { expect, test, type Page } from "@playwright/test";
const TITO = "Tito's Handmade Vodka";
async function open(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-28T18:00:00Z"));
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Bar Inventory" })
      .click();
  } else
    await page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" })
      .click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
}
async function dates(page: Page) {
  await page
    .getByRole("button", { name: `Date tracking for ${TITO}`, exact: true })
    .click();
  return page.getByRole("dialog", {
    name: `${TITO} — Date Tracking`,
    exact: true,
  });
}
test("bulk count selects filtered rows, reviews blank/zero semantics and writes history", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("checkbox", { name: `Select ${TITO}`, exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Modelo Especial", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk Count", exact: true });
  await dialog.getByLabel(`New On Hand: ${TITO}`, { exact: true }).fill("0");
  await dialog
    .getByLabel("New On Hand: Modelo Especial", { exact: true })
    .fill("7.25");
  await dialog
    .getByRole("button", { name: "Review Changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: /2 changed of 2 selected/ }),
  ).toBeVisible();
  await expect(dialog).toContainText("Backup: 1 → 1");
  await dialog
    .getByRole("button", { name: "Confirm 2 Changes", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Adjust " + TITO, exact: true })
    .click();
  const adjust = page.getByRole("dialog");
  await expect(adjust).toContainText("0");
  await adjust
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Stock Count", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});
test("select filtered and clear selection stay scoped to active results", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("Modelo");
  await page
    .getByRole("button", { name: "Select filtered results", exact: true })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
});
test("columns reorder with keyboard, persist, and reset without clearing search", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("searchbox", { name: "Search Inventory" }).fill("Tito");
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Choose columns" });
  await expect(
    menu.getByRole("checkbox", { name: "Name", exact: true }),
  ).toBeDisabled();
  await menu.getByRole("checkbox", { name: "SKU", exact: true }).uncheck();
  await menu
    .getByRole("button", { name: "Move Vendor down", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  if (test.info().project.name !== "server-mobile")
    await expect(
      page
        .getByRole("table", { name: "Inventory", exact: true })
        .locator("thead th")
        .first(),
    ).toContainText("Name");
  await menu
    .getByRole("button", { name: "Reset to Default", exact: true })
    .click();
  await expect(
    menu.getByRole("checkbox", { name: "SKU", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("Tito");
});
test("saved view lifecycle, owned state and dashboard precedence", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("Modelo");
  await page.getByRole("button", { name: "Save View", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Save View", exact: true });
  await dialog.getByLabel("View name", { exact: true }).fill("Weekly count");
  await dialog.getByLabel("Make my default Inventory view").check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("searchbox", { name: "Search Inventory" }).fill("Tito");
  await page
    .getByRole("combobox", { name: "Saved Views", exact: true })
    .selectOption({ label: "Weekly count (default)" });
  await expect(
    page.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("Modelo");
  await page.getByText("Manage view", { exact: true }).click();
  await page.getByRole("button", { name: "Rename view", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Rename view", exact: true });
  await dialog.getByLabel("View name", { exact: true }).fill("Renamed count");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Saved Views", exact: true }),
  ).toContainText("Renamed count");
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await page.getByTestId("kpi-active").click();
  await expect(
    page.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Saved Views", exact: true }),
  ).toHaveValue("");
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await page.getByTestId("date-kpi-expired").click();
  await expect(
    page.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Expiration filter", exact: true }),
  ).toHaveValue("Expired");
  await page
    .getByRole("combobox", { name: "Saved Views", exact: true })
    .selectOption({ label: "Renamed count (default)" });
  await page.getByText("Manage view", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove default", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Saved Views", exact: true }),
  ).not.toContainText("(default)");
  await page.getByRole("button", { name: "Delete view", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Saved Views", exact: true }),
  ).not.toContainText("Renamed count");
});
test("multiple date groups, partial precision, archive, export and dashboard drilldown", async ({
  page,
}) => {
  await open(page);
  let dialog = await dates(page);
  await dialog
    .getByRole("button", { name: "Add Date Entry", exact: true })
    .click();
  await dialog.getByLabel("Manufactured", { exact: true }).fill("01/26");
  await dialog.getByLabel("Expires", { exact: true }).fill("10/29/26");
  await dialog.getByLabel("Quantity (optional)", { exact: true }).fill("1");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await expect(dialog).toContainText("Expires in 1 days · Urgent");
  await dialog
    .getByRole("button", { name: "Add Date Entry", exact: true })
    .click();
  await dialog.getByLabel("Expires", { exact: true }).fill("11/2026");
  await dialog.getByLabel("Quantity (optional)", { exact: true }).fill("5");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await expect(dialog).toContainText("2 date groups");
  await expect(dialog).toContainText("Expires: 11/26");
  await expect(dialog).toContainText("Dated quantity exceeds inventory by 3");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export date groups", exact: true })
    .click();
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("date_groups");
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await expect(page.getByTestId("date-kpi-urgent")).toContainText("1 products");
  await page.getByTestId("date-kpi-urgent").click();
  await expect(
    page.getByRole("combobox", { name: "Expiration filter", exact: true }),
  ).toHaveValue("Within 7 days");
  dialog = await dates(page);
  await dialog
    .getByRole("button", { name: "Edit date entry", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Expires", { exact: true }).fill("10/27/26");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await expect(dialog).toContainText("Expired 1 days ago · Critical");
  await dialog
    .getByRole("button", { name: "Archive date entry", exact: true })
    .first()
    .click();
  await expect(dialog).toContainText("1 date groups");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("configured manufacture rule produces a freshness-limit dashboard alert", async ({
  page,
}) => {
  await open(page);
  let dialog = await dates(page);
  await dialog
    .getByRole("button", { name: "Add Date Entry", exact: true })
    .click();
  await dialog.getByLabel("Manufactured", { exact: true }).fill("01/26");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("tab", { name: "Freshness Rules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add freshness rule", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Add freshness rule",
    exact: true,
  });
  await dialog
    .getByLabel("Subcategory", { exact: true })
    .selectOption({ label: "Spirits / Vodka" });
  await dialog.getByLabel("Maximum age (months)", { exact: true }).fill("9");
  await dialog
    .getByLabel("Warn before limit (months)", { exact: true })
    .fill("1");
  await dialog
    .getByRole("button", { name: "Save freshness rule", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await expect(page.getByTestId("date-kpi-limit")).toContainText("1 products");
  await page.getByTestId("date-kpi-limit").click();
  await expect(
    page.getByRole("combobox", {
      name: "Manufacture freshness filter",
      exact: true,
    }),
  ).toHaveValue("Freshness Limit");
});
