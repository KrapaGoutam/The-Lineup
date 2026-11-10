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

test("C2: Inventory Table read-only smoke (search, sort, selection)", async () => {
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
  expect(initialRowCount).toBeGreaterThan(1);

  // --- 1. Search Functionality ---
  const searchInput = page.getByPlaceholder("Search…");
  await expect(searchInput).toBeVisible();

  // Capture name of first product to test matching
  const firstProductName = (
    await rows.first().locator("span.font-medium").innerText()
  ).trim();
  expect(firstProductName.length).toBeGreaterThan(0);

  // Filter with matching product name
  await searchInput.fill(firstProductName);
  // Matching product remains displayed
  await expect(
    table
      .locator("tbody tr span.font-medium")
      .filter({ hasText: firstProductName })
      .first(),
  ).toBeVisible();
  const matchingCount = await rows.count();
  expect(matchingCount).toBeGreaterThanOrEqual(1);
  expect(matchingCount).toBeLessThanOrEqual(initialRowCount);

  // Nonmatching query excludes all products and renders empty state
  await searchInput.fill("__NON_EXISTENT_PRODUCT_XYZ__");
  await expect(page.getByText("No items match these filters.")).toBeVisible();
  expect(await rows.count()).toBe(0);

  // Clearing search restores expected initial results
  await searchInput.clear();
  await expect(rows).toHaveCount(initialRowCount);

  // --- 2. Sorting by Name Column (Header Toggle & Preset) ---
  const collator = new Intl.Collator("en", {
    sensitivity: "base",
    numeric: true,
  });

  const nameTh = table
    .getByRole("columnheader")
    .filter({ hasText: "Name" })
    .first();
  await expect(nameTh).toBeVisible();
  const nameSortBtn = nameTh.getByRole("button", { name: "Name", exact: true });
  await expect(nameSortBtn).toBeVisible();

  // Click sort to toggle to descending
  await nameSortBtn.click();
  let currentSort = await nameTh.getAttribute("aria-sort");
  if (currentSort !== "descending") {
    await nameSortBtn.click();
    currentSort = await nameTh.getAttribute("aria-sort");
  }
  await expect(nameTh).toHaveAttribute("aria-sort", "descending");

  const descNames = await table
    .locator("tbody tr span.font-medium")
    .allInnerTexts();
  expect(descNames.length).toBe(initialRowCount);
  for (let i = 0; i < descNames.length - 1; i++) {
    expect(
      collator.compare(descNames[i], descNames[i + 1]),
    ).toBeGreaterThanOrEqual(0);
  }

  // Sort ascending via Sort order preset ("Name A–Z")
  const sortOrderSelect = page.getByRole("combobox", { name: "Sort order" });
  await expect(sortOrderSelect).toBeVisible();
  await sortOrderSelect.selectOption({ label: "Name A–Z" });
  await expect(nameTh).toHaveAttribute("aria-sort", "ascending");

  const ascNames = await table
    .locator("tbody tr span.font-medium")
    .allInnerTexts();
  expect(ascNames.length).toBe(initialRowCount);
  for (let i = 0; i < ascNames.length - 1; i++) {
    expect(collator.compare(ascNames[i], ascNames[i + 1])).toBeLessThanOrEqual(
      0,
    );
  }

  // Restore default preset ("Critical first")
  await sortOrderSelect.selectOption({ label: "Critical first" });

  // --- 3. Selection Functionality (Mandatory Assertions, Non-Mutating) ---
  const rowCheckboxes = table.locator("tbody tr input[type='checkbox']");
  const rowCheckboxCount = await rowCheckboxes.count();
  expect(rowCheckboxCount).toBe(initialRowCount);

  const firstCheckbox = rowCheckboxes.first();
  await expect(firstCheckbox).toBeVisible();
  await expect(firstCheckbox).not.toBeChecked();

  // Individual selection
  await firstCheckbox.check();
  await expect(firstCheckbox).toBeChecked();

  // Selection state reflects 1 selected
  const statusSelected = page
    .getByRole("status")
    .filter({ hasText: /1 selected/i });
  await expect(statusSelected).toBeVisible();

  // Header checkbox displays indeterminate state
  const headerCheckbox = table.locator(
    "thead input[type='checkbox'][aria-label='Select all visible products']",
  );
  await expect(headerCheckbox).toBeVisible();
  const isIndeterminate = await headerCheckbox.evaluate(
    (el: HTMLInputElement) => el.indeterminate,
  );
  expect(isIndeterminate).toBe(true);
  await expect(headerCheckbox).not.toBeChecked();

  // Select all shown
  await headerCheckbox.click();
  await expect(headerCheckbox).toBeChecked();
  const isIndeterminateAfterAll = await headerCheckbox.evaluate(
    (el: HTMLInputElement) => el.indeterminate,
  );
  expect(isIndeterminateAfterAll).toBe(false);
  const checkedRowCount = await table
    .locator("tbody tr input[type='checkbox']:checked")
    .count();
  expect(checkedRowCount).toBe(rowCheckboxCount);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: new RegExp(`${rowCheckboxCount} selected`, "i") }),
  ).toBeVisible();

  // Clear selection
  const clearSelectionBtn = page.getByRole("button", {
    name: "Clear selection",
    exact: true,
  });
  await expect(clearSelectionBtn).toBeVisible();
  await clearSelectionBtn.click();
  await expect(firstCheckbox).not.toBeChecked();
  await expect(headerCheckbox).not.toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: /0 selected/i }),
  ).toBeVisible();
  await expect(clearSelectionBtn).toBeHidden();

  // Ensure no horizontal overflow on standard desktop
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test("C3: Cooler Layout empty-state, navigation, and item read-only inspection", async () => {
  // Toggle to Cooler Layout
  const coolerBtn = page.getByRole("button", {
    name: "Cooler Layout",
    exact: true,
  });
  await expect(coolerBtn).toBeVisible();
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

  // Verify Storage Areas filter is present with All Storage Areas
  const storageFilter = page.getByRole("combobox", {
    name: "Select storage area",
  });
  await expect(storageFilter).toBeVisible();
  await expect(storageFilter.locator("option").first()).toHaveText(
    "All Storage Areas",
  );

  // Verify Unassigned Storage section exists
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
  await coolerSearch.fill("NonExistentTermXYZ");
  await coolerSearch.clear();

  // Open Manage Unassigned view
  const manageUnassignedBtn = page.getByRole("button", {
    name: "Manage Unassigned",
  });
  await expect(manageUnassignedBtn).toBeVisible();
  await manageUnassignedBtn.click();

  // Unassigned Storage view heading renders
  await expect(
    page.getByRole("heading", { name: "Unassigned Storage", level: 2 }),
  ).toBeVisible();

  // Read-only item inspection: click the first unassigned product card button
  const productButton = page
    .locator(".space-y-6 div.grid .bg-card button")
    .filter({ hasText: /.+/ })
    .first();
  await expect(productButton).toBeVisible();
  const targetProductName = (await productButton.innerText()).trim();
  expect(targetProductName.length).toBeGreaterThan(0);

  // Open ItemSheet
  await productButton.click();

  // Assert item sheet dialog opens with correct product identity
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: targetProductName }),
  ).toBeVisible();
  await expect(dialog.getByLabel("On hand")).toBeVisible();
  await expect(dialog.getByLabel("Backup")).toBeVisible();
  await expect(dialog.getByLabel("Reason")).toBeVisible();

  // Close read-only inspection dialog via Close button without saving data
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toBeHidden();

  // Switch back to table view
  const tableBtn = page.getByRole("button", {
    name: "Inventory Table",
    exact: true,
  });
  await expect(tableBtn).toBeVisible();
  await tableBtn.click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("C4: Responsive checks (tablet and mobile viewports in test browser)", async () => {
  // Tablet viewport (820 x 1180, iPad Air dimensions evaluated in test browser)
  await page.setViewportSize({ width: 820, height: 1180 });
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
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Mobile viewport (390 x 844, iPhone 14 dimensions evaluated in test browser)
  await page.setViewportSize({ width: 390, height: 844 });
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Switch back to table view at mobile size
  await page
    .getByRole("button", { name: "Inventory Table", exact: true })
    .click();
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Reset to desktop viewport
  await page.setViewportSize({ width: 1280, height: 800 });
});
