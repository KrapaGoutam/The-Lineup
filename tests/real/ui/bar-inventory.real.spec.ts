/**
 * Bar Inventory V1 / BI-1 -- real-mode browser scenarios (hosted DEV). Two
 * isolated contexts signed in through the real passcode flow: TestManager
 * (manager+) and TestServer1 (staff). Everything created carries a unique
 * "RealUI-<stamp>" tag and is deleted afterwards (service role, DEV only).
 * The append-only change log and the system "Unassigned" vendor intentionally
 * stay in the DEV org. Scenario ids (BI-xxx) match
 * docs/features/bar-inventory-v1/TEST_MATRIX.md.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const TAG = `RealUI-${Date.now()}`;
let manager: Page;
let staff: Page;
let contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

async function open(context: BrowserContext, pin: string, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
  await signIn(page, pin);
  return page;
}

async function openBarInventory(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  await page
    .locator('[data-nav-tier="secondary"]')
    .filter({ hasText: "Bar Inventory" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
  await expect(page.getByText("Loading Bar Inventory…")).toBeHidden({
    timeout: 30_000,
  });
}

async function cleanup() {
  const { admin, orgId } = await devLocation();
  const like = `${TAG}%`;
  await admin
    .from("inventory_products")
    .delete()
    .eq("organization_id", orgId)
    .like("name", like);
  await admin
    .from("inventory_subcategories")
    .delete()
    .eq("organization_id", orgId)
    .like("name", like);
  await admin
    .from("inventory_categories")
    .delete()
    .eq("organization_id", orgId)
    .like("name", like);
  await admin
    .from("inventory_vendors")
    .delete()
    .eq("organization_id", orgId)
    .like("name", like);
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  contexts = [await browser.newContext(), await browser.newContext()];
  manager = await open(contexts[0], PINS.TestManager, "manager");
  staff = await open(contexts[1], PINS.TestServer1, "staff");
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("BI-NAV-003: staff never see Bar Inventory", async () => {
  await expect(accountButton(staff)).toBeVisible();
  await expect(
    staff
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" }),
  ).toHaveCount(0);
});

test("BI-CAT: a manager builds a catalog that survives a reload; duplicates are refused by the database", async () => {
  await openBarInventory(manager);
  // The system vendor is bootstrapped by the first read.
  await manager.getByRole("tab", { name: "Vendors" }).click();
  await expect(
    manager
      .getByRole("table", { name: "Vendors" })
      .getByRole("row", { name: /Unassigned/ }),
  ).toContainText("System");

  await manager.getByRole("button", { name: "Add vendor" }).click();
  let dialog = manager.getByRole("dialog", { name: "Add vendor" });
  await dialog.getByLabel("Vendor name").fill(`${TAG} Faust`);
  await dialog.getByRole("button", { name: "Add vendor" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // Spelling variant: refused with the existing vendor named (server message).
  await manager.getByRole("button", { name: "Add vendor" }).click();
  dialog = manager.getByRole("dialog", { name: "Add vendor" });
  await dialog.getByLabel("Vendor name").fill(`${TAG.toLowerCase()}faust`);
  await dialog.getByRole("button", { name: "Add vendor" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    `A vendor named "${TAG} Faust" already exists.`,
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await manager.getByRole("tab", { name: "Categories" }).click();
  await manager.getByRole("button", { name: "Add category" }).first().click();
  dialog = manager.getByRole("dialog", { name: "Add category" });
  await dialog.getByLabel("Category name").fill(`${TAG} Spirits`);
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await manager
    .getByRole("button", { name: `Add subcategory to ${TAG} Spirits` })
    .click();
  dialog = manager.getByRole("dialog", { name: "Add subcategory" });
  await dialog.getByLabel("Subcategory name").fill(`${TAG} Vodka`);
  await dialog.getByRole("button", { name: "Add subcategory" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await manager.getByRole("tab", { name: "Products" }).click();
  await manager.getByRole("button", { name: "Add product" }).first().click();
  dialog = manager.getByRole("dialog", { name: "Add product" });
  await dialog
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: `${TAG} Faust` });
  await dialog.getByLabel("Product name").fill(`${TAG} Tito's`);
  await dialog
    .getByLabel("Category (optional)", { exact: true })
    .selectOption({ label: `${TAG} Spirits` });
  await dialog
    .getByLabel("Subcategory (optional)", { exact: true })
    .selectOption({ label: `${TAG} Vodka` });
  await dialog.getByLabel("Size").fill("750 mL");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // Same identity, different formatting: the DATABASE refuses it.
  await manager.getByRole("button", { name: "Add product" }).first().click();
  dialog = manager.getByRole("dialog", { name: "Add product" });
  await dialog
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: `${TAG} Faust` });
  await dialog.getByLabel("Product name").fill(`${TAG} TITOS`);
  await dialog.getByLabel("Size").fill("750ml");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "That product already exists",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // A reload re-reads everything from the database.
  await manager.reload();
  await openBarInventory(manager);
  await manager.getByRole("tab", { name: "Products" }).click();
  await expect(
    manager
      .getByRole("table", { name: "Products" })
      .getByRole("row", { name: new RegExp(`${TAG} Tito's`) }),
  ).toContainText(`${TAG} Faust`);
});

test("BI-ADJ-005: a stale edit from a second window is refused, not silently applied", async () => {
  // Window A opens the vendor editor; window B (same user, fresh page) renames
  // it first; A then saves from its stale version.
  await manager.getByRole("tab", { name: "Vendors" }).click();
  const row = manager
    .getByRole("table", { name: "Vendors" })
    .getByRole("row", { name: new RegExp(`${TAG} Faust`) });
  await row.getByRole("button", { name: `Edit ${TAG} Faust` }).click();
  const dialog = manager.getByRole("dialog", { name: "Edit vendor" });

  const secondContext = await contexts[0].browser()!.newContext();
  const second = await secondContext.newPage();
  await signIn(second, PINS.TestManager);
  await openBarInventory(second);
  await second.getByRole("tab", { name: "Vendors" }).click();
  await second.getByRole("button", { name: `Edit ${TAG} Faust` }).click();
  const secondDialog = second.getByRole("dialog", { name: "Edit vendor" });
  await secondDialog.getByLabel("Vendor name").fill(`${TAG} Faust Dist`);
  await secondDialog.getByRole("button", { name: "Save vendor" }).click();
  await expect(secondDialog).toBeHidden({ timeout: 30_000 });
  await secondContext.close();

  await dialog.getByLabel("Vendor name").fill(`${TAG} Faust Mine`);
  await dialog.getByRole("button", { name: "Save vendor" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/changed this vendor/);
  await expect(
    dialog.getByRole("button", { name: "Save over their change" }),
  ).toBeVisible();

  // Intentional retry applies the person's own value on top of the latest.
  await dialog.getByRole("button", { name: "Save over their change" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(
    manager
      .getByRole("table", { name: "Vendors" })
      .getByRole("row", { name: new RegExp(`${TAG} Faust Mine`) }),
  ).toBeVisible();
});
