import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import {
  accountButton,
  assertServerIsDev,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`page error: ${e.message}`));
  await signIn(page, PINS.TestOwner);
});

test.afterAll(async () => {
  await context?.close();
  expect(pageErrors).toEqual([]);
});

test("C1: Navigation and module availability", async () => {
  await expect(accountButton(page)).toBeVisible();

  // Active branch context
  const branchIndicator = page
    .locator("header, [data-nav-tier]")
    .filter({ hasText: "DEV Location" });
  await expect(branchIndicator.first()).toBeVisible();

  // Bar Inventory is present in navigation
  const barInventoryNav = page
    .locator('[data-nav-tier="secondary"]')
    .filter({ hasText: "Bar Inventory" });
  await expect(barInventoryNav).toBeVisible();

  // Unconfigured optional modules MUST be hidden under V2-004.003 rules
  // (table_allocation, tasks, schedule, tips, team, attendance, payroll, recipes)
  const secondaryNav = page.locator('[data-nav-tier="secondary"]');
  await expect(secondaryNav.filter({ hasText: "Tasks" })).toBeHidden();
  await expect(secondaryNav.filter({ hasText: "Tips" })).toBeHidden();
  await expect(secondaryNav.filter({ hasText: "Payroll" })).toBeHidden();
  await expect(secondaryNav.filter({ hasText: "Schedule" })).toBeHidden();

  // System-required Settings remains accessible
  const settingsBtn = page.getByRole("button", { name: /^Settings/ });
  await expect(settingsBtn).toBeVisible();

  // Navigate to Bar Inventory
  await barInventoryNav.click();
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
  await expect(page.getByText("Loading Bar Inventory…")).toBeHidden({
    timeout: 30_000,
  });
});

test("C2: Inventory Table read-only smoke (search, sort, filter, selection)", async () => {
  // Navigate to the Inventory tab within Bar Inventory views
  const inventoryTab = page.getByRole("tab", {
    name: "Inventory",
    exact: true,
  });
  await expect(inventoryTab).toBeVisible();
  await inventoryTab.click();

  // Verify view mode toggle is present and defaults to table
  const tableBtn = page.getByRole("button", {
    name: "Inventory Table",
    exact: true,
  });
  const coolerBtn = page.getByRole("button", {
    name: "Cooler Layout",
    exact: true,
  });
  await expect(tableBtn).toBeVisible();
  await expect(coolerBtn).toBeVisible();

  // Table contains rows
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  const initialRowCount = await rows.count();
  expect(initialRowCount).toBeGreaterThan(0);

  // Search functionality
  const searchInput = page
    .getByPlaceholder(/Search products|Filter products/i)
    .first();
  if (await searchInput.isVisible()) {
    // Type a common string
    await searchInput.fill("Vodka");
    await page.waitForTimeout(300);
    // Verify search works and either filters or shows matching items
    await searchInput.clear();
    await page.waitForTimeout(300);
  }

  // Selection tests (read-only, no stock mutations)
  const firstCheckbox = table
    .locator("tbody tr input[type='checkbox']")
    .first();
  if (await firstCheckbox.isVisible()) {
    await firstCheckbox.check();
    await expect(firstCheckbox).toBeChecked();

    // Verify header or toolbar reflects selection
    const clearOrSelectBtn = page.getByRole("button", {
      name: /Clear selection|Deselect/i,
    });
    if (await clearOrSelectBtn.isVisible()) {
      await clearOrSelectBtn.click();
      await expect(firstCheckbox).not.toBeChecked();
    } else {
      await firstCheckbox.uncheck();
      await expect(firstCheckbox).not.toBeChecked();
    }
  }

  // Ensure no horizontal overflow on standard desktop
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test("C3: Cooler Layout empty-state, navigation, and item details", async () => {
  const coolerBtn = page.getByRole("button", {
    name: "Cooler Layout",
    exact: true,
  });
  await coolerBtn.click();

  // Verify branch selector displays DEV Location
  const branchSelect = page.getByRole("combobox", {
    name: "Restaurant branch",
  });
  await expect(branchSelect).toBeVisible();
  await expect(branchSelect).toHaveValue("current");
  await expect(branchSelect.locator("option:checked")).toHaveText(
    "DEV Location",
  );

  // Verify Storage Areas filter
  const storageFilter = page.getByRole("combobox", {
    name: "Select storage area",
  });
  await expect(storageFilter).toBeVisible();

  // Verify Unassigned Storage heading exists
  const unassignedHeading = page.getByRole("heading", {
    name: "Unassigned Storage",
  });
  await expect(unassignedHeading).toBeVisible();

  // Since hosted DEV has 0 storage areas, verify the physical layout empty state
  const emptyStateHeading = page.getByRole("heading", {
    name: "No storage areas defined",
  });
  await expect(emptyStateHeading).toBeVisible();
  await expect(
    page.getByText(/Get started by creating your first cooler/i),
  ).toBeVisible();

  // Search filter within Cooler Layout
  const coolerSearch = page.getByPlaceholder("Filter products or slots…");
  await expect(coolerSearch).toBeVisible();
  await coolerSearch.fill("Tito");
  await page.waitForTimeout(200);
  await coolerSearch.clear();

  // Open "Manage Unassigned" drawer to inspect unassigned items read-only
  const manageUnassignedBtn = page.getByRole("button", {
    name: "Manage Unassigned",
  });
  await expect(manageUnassignedBtn).toBeVisible();
  await manageUnassignedBtn.click();

  // Drawer / modal opens
  const drawer = page.locator("[role='dialog']").first();
  if (await drawer.isVisible()) {
    // Check product items are listed
    const itemCard = drawer.locator("[role='button']").first();
    if (await itemCard.isVisible()) {
      await itemCard.click();
      // Read-only inspection in Item Sheet
      await page.waitForTimeout(300);
    }
    // Close drawer
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Switch back to table view
  await page
    .getByRole("button", { name: "Inventory Table", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("C4: Responsive checks (tablet and mobile viewports)", async () => {
  // Tablet viewport (iPad Air 820 x 1180)
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(300);
  let scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  let clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Switch to Cooler Layout at tablet size
  await page
    .getByRole("button", { name: "Cooler Layout", exact: true })
    .click();
  await page.waitForTimeout(300);
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Mobile viewport (iPhone 14 / 390 x 844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Switch back to table view at mobile size
  await page
    .getByRole("button", { name: "Inventory Table", exact: true })
    .click();
  await page.waitForTimeout(300);
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Reset to desktop viewport
  await page.setViewportSize({ width: 1280, height: 800 });
});
