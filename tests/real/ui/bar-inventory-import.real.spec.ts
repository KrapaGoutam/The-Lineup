/**
 * Bar Inventory V1 / BI-8c-2 -- real-mode Import flow (hosted DEV). A browser
 * signed in as TestManager through the real passcode flow drives Manage →
 * Import: the server action plans the file against the database, stages it
 * and commits it with the manager's own JWT. Everything created carries a
 * unique "RealImp-<stamp>" tag and is deleted afterwards (service role, DEV
 * only). The append-only change log and the system "Unassigned" vendor
 * intentionally stay in the DEV org.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import writeXlsxFile from "write-excel-file/node";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const TAG = `RealImp-${Date.now()}`;
const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";
let context: BrowserContext;
let manager: Page;
const pageErrors: string[] = [];

async function openImport(page: Page) {
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
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("tab", { name: "Import", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import from a file" }),
  ).toBeVisible();
}

const upload = (page: Page, rows: string[], name: string) =>
  page.getByLabel("CSV or Excel file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from([HEADER, ...rows].join("\n")),
  });

const NEW_ROW = () =>
  `${TAG} Dist,${TAG} Malbec,${TAG} Wine,${TAG} Red,750 mL,Bottle,${TAG}-SKU,6,2,3,,10,`;
const UPDATE_ROW = (onHand: number) =>
  `${TAG} Dist,${TAG} Malbec,,,750 mL,Bottle,,${onHand},,,,,`;

async function product() {
  const { admin, orgId, locationId } = await devLocation();
  const { data } = await admin
    .from("inventory_products")
    .select("id, name, sku")
    .eq("organization_id", orgId)
    .eq("name", `${TAG} Malbec`)
    .maybeSingle();
  if (!data) return null;
  const { data: stock } = await admin
    .from("inventory_stock")
    .select("on_hand, backup, cutoff, par, version")
    .eq("product_id", data.id)
    .eq("location_id", locationId)
    .single();
  return { ...data, stock: stock! };
}

async function cleanup() {
  const { admin, orgId } = await devLocation();
  const like = `${TAG}%`;
  // Products first: their stock and ledger rows cascade, which frees the batches.
  await admin
    .from("inventory_products")
    .delete()
    .eq("organization_id", orgId)
    .like("name", like);
  await admin
    .from("inventory_import_batches")
    .delete()
    .eq("organization_id", orgId)
    .like("filename", like);
  for (const table of [
    "inventory_subcategories",
    "inventory_categories",
    "inventory_vendors",
  ]) {
    await admin
      .from(table)
      .delete()
      .eq("organization_id", orgId)
      .like("name", like);
  }
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  context = await browser.newContext();
  manager = await context.newPage();
  manager.on("pageerror", (e) => pageErrors.push(`manager: ${e.message}`));
  await signIn(manager, PINS.TestManager);
});

test.afterAll(async () => {
  await context?.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("a new vendor, category and product are previewed, confirmed and written by the database", async () => {
  await openImport(manager);
  await upload(manager, [NEW_ROW()], `${TAG}-new.csv`);
  await expect(manager.getByTestId("import-counts")).toContainText(
    "Create 1 · Update 0 · Skip 0 · Error 0 · New vendors 1 · New categories 1 · New subcategories 1",
    { timeout: 30_000 },
  );

  // Previewing wrote nothing.
  expect(await product()).toBeNull();

  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(manager.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });

  const made = await product();
  expect(made).toMatchObject({ sku: `${TAG}-SKU` });
  expect(made?.stock).toMatchObject({
    on_hand: 6,
    backup: 2,
    cutoff: 3,
    par: 10,
  });

  // The ledger row is a bulk_import row that points at its batch.
  const { admin } = await devLocation();
  const { data: ledger } = await admin
    .from("inventory_adjustments")
    .select("source, reason, import_batch_id")
    .eq("product_id", made!.id);
  expect(ledger).toHaveLength(1);
  expect(ledger![0]).toMatchObject({
    source: "bulk_import",
    reason: "stock_count",
  });
  const { data: batch } = await admin
    .from("inventory_import_batches")
    .select("status, filename, created_count, vendors_created")
    .eq("id", ledger![0].import_batch_id)
    .single();
  expect(batch).toMatchObject({
    status: "committed",
    filename: `${TAG}-new.csv`,
    created_count: 1,
    vendors_created: 1,
  });
});

test("an update shows the change, and a double click applies it once", async () => {
  await openImport(manager);
  await upload(manager, [UPDATE_ROW(9)], `${TAG}-update.csv`);
  await expect(manager.getByTestId("import-counts")).toContainText(
    "Create 0 · Update 1",
    { timeout: 30_000 },
  );
  await expect(
    manager.getByRole("region", { name: "Import preview" }),
  ).toContainText("On hand 6 → 9 (+3)");

  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .dblclick();
  await expect(manager.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });

  const { admin } = await devLocation();
  const now = await product();
  expect(now?.stock).toMatchObject({ on_hand: 9, backup: 2, cutoff: 3 });
  const { data: ledger } = await admin
    .from("inventory_adjustments")
    .select("source")
    .eq("product_id", now!.id);
  // One row from the first import, exactly one from this one.
  expect(ledger).toHaveLength(2);
  const { data: batches } = await admin
    .from("inventory_import_batches")
    .select("id")
    .eq("filename", `${TAG}-update.csv`);
  expect(batches).toHaveLength(1);
});

test("an inventory change made after the preview is refused, and the preview refreshes", async () => {
  await openImport(manager);
  await upload(manager, [UPDATE_ROW(12)], `${TAG}-stale.csv`);
  await expect(
    manager.getByRole("region", { name: "Import preview" }),
  ).toContainText("On hand 9 → 12 (+3)", { timeout: 30_000 });

  // Someone counts the same item before the manager confirms.
  const { admin, locationId } = await devLocation();
  const before = await product();
  await admin
    .from("inventory_stock")
    .update({ on_hand: 11, version: before!.stock.version + 1 })
    .eq("product_id", before!.id)
    .eq("location_id", locationId);

  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();

  await expect(
    manager
      .getByRole("alert")
      .filter({ hasText: "The inventory changed since you previewed" })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  // Nothing was applied, and the preview now shows the new current value.
  expect((await product())?.stock.on_hand).toBe(11);
  await expect(
    manager.getByRole("region", { name: "Import preview" }),
  ).toContainText("On hand 11 → 12 (+1)");

  // Confirming the refreshed preview works.
  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(manager.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });
  expect((await product())?.stock.on_hand).toBe(12);
});

test("the batches are in the import history and the changes are in History as bulk imports", async () => {
  await openImport(manager);
  const history = manager.getByRole("region", { name: "Import history" });
  await expect(history).toContainText(`${TAG}-new.csv`, { timeout: 30_000 });
  await expect(history).toContainText(`${TAG}-update.csv`);

  await manager.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await manager.getByRole("button", { name: "Full history" }).click();
  await expect(
    manager.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
  await expect(
    manager.getByText("Bulk import").filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("an Excel workbook is read on the server, previewed, committed and recorded as xlsx", async () => {
  await openImport(manager);
  const filename = `${TAG}-book.xlsx`;
  const book = Buffer.from(
    await writeXlsxFile([
      {
        sheet: "Stock",
        data: [
          HEADER.split(",").map((value) => ({ value })),
          [
            `${TAG} Dist`,
            `${TAG} Malbec`,
            null,
            null,
            "750 mL",
            "Bottle",
            null,
            14,
            null,
            null,
            null,
            null,
            null,
          ],
        ],
      },
    ]).toBuffer(),
  );
  await manager.getByLabel("CSV or Excel file").setInputFiles({
    name: filename,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: book,
  });
  await expect(
    manager.getByRole("region", { name: "Import preview" }),
  ).toContainText("On hand 12 → 14 (+2)", { timeout: 30_000 });

  // A hostile file is refused by the server, and nothing is previewed from it.
  await manager.getByLabel("CSV or Excel file").setInputFiles({
    name: `${TAG}-fake.xlsx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("Vendor,Name\nx,y"),
  });
  await expect(
    manager.getByRole("alert").filter({ hasText: "isn't a valid .xlsx" }),
  ).toBeVisible({ timeout: 30_000 });

  await manager.getByLabel("CSV or Excel file").setInputFiles({
    name: filename,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: book,
  });
  await expect(
    manager.getByRole("region", { name: "Import preview" }),
  ).toContainText("On hand 12 → 14 (+2)", { timeout: 30_000 });
  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(manager.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });

  expect((await product())?.stock.on_hand).toBe(14);
  const { admin } = await devLocation();
  const { data: batch } = await admin
    .from("inventory_import_batches")
    .select("format, sheet, status, updated_count")
    .eq("filename", filename)
    .single();
  expect(batch).toMatchObject({
    format: "xlsx",
    sheet: "Stock",
    status: "committed",
    updated_count: 1,
  });
});
