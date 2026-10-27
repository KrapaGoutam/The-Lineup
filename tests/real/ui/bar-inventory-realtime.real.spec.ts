/**
 * Bar Inventory V1 / BI-9 -- Realtime notify -> refetch, in real mode (hosted
 * DEV). Two isolated manager windows through the real passcode flow. Window A
 * changes inventory (a CSV import, an inline count edit); window B never
 * reloads and must show the database's answer. Window B counts its own server
 * action calls: a change costs a handful of re-reads, a quiet minute costs
 * none (BI-RT-002 / BI-RT-004). Everything created carries "RealRT-<stamp>"
 * and is deleted afterwards (service role, DEV only).
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

const TAG = `RealRT-${Date.now()}`;
const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";
const NAMES = [1, 2, 3].map((n) => `${TAG} Item ${n}`);

let contexts: BrowserContext[] = [];
let a: Page;
let b: Page;
const pageErrors: string[] = [];
let readsByB = 0;

async function open(context: BrowserContext, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
  await signIn(page, PINS.TestManager);
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

const editButton = (page: Page, name: string, current: number) =>
  page.getByRole("button", {
    name: `Edit On hand for ${name}, currently ${current}`,
  });

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  contexts = [await browser.newContext(), await browser.newContext()];
  a = await open(contexts[0], "A");
  b = await open(contexts[1], "B");
  // Count B's server action calls (every read is a POST with a next-action id).
  b.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      readsByB += 1;
    }
  });
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("B is looking at Inventory; A imports three items; they appear in B without a reload", async () => {
  await openBarInventory(b);
  await b.getByRole("tab", { name: "Inventory", exact: true }).click();
  await b.getByRole("searchbox", { name: "Search Inventory" }).fill(TAG);
  // Nothing matches yet (the table is an empty state).
  await expect(b.getByText(NAMES[0])).toHaveCount(0);

  // Past the initial read and the join read, then a baseline.
  await b.waitForTimeout(3000);
  const before = readsByB;

  await openBarInventory(a);
  await a.getByRole("tab", { name: "Manage", exact: true }).click();
  await a.getByRole("tab", { name: "Import", exact: true }).click();
  const rows = NAMES.map(
    (name) =>
      `${TAG} Dist,${name},${TAG} Wine,${TAG} Red,750 mL,Bottle,,5,1,2,3,10,`,
  );
  await a.getByLabel("CSV or Excel file").setInputFiles({
    name: `${TAG}-rt.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from([HEADER, ...rows].join("\n")),
  });
  await expect(a.getByTestId("import-counts")).toContainText("Create 3", {
    timeout: 30_000,
  });
  await a.getByRole("button", { name: /^Review and import/ }).click();
  await a
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(a.getByText("Import complete")).toBeVisible({ timeout: 30_000 });

  // B was not touched: no reload, no click. The rows arrive through Realtime.
  for (const name of NAMES) {
    await expect(editButton(b, name, 5)).toBeVisible({ timeout: 20_000 });
  }
  // A 3-row import is a burst of events: it costs a few re-reads, not one per event.
  expect(readsByB - before).toBeGreaterThanOrEqual(1);
  expect(readsByB - before).toBeLessThanOrEqual(4);
});

test("a quiet period costs B no reads at all (no reload storm, no resubscribe loop)", async () => {
  await b.waitForTimeout(2000);
  const before = readsByB;
  await b.waitForTimeout(10_000);
  expect(readsByB - before).toBe(0);
});

test("a change made behind the app's back reaches B as the database's value", async () => {
  const { admin, locationId } = await devLocation();
  const { data: product } = await admin
    .from("inventory_products")
    .select("id")
    .eq("name", NAMES[0])
    .single();
  const { data: stock } = await admin
    .from("inventory_stock")
    .select("version")
    .eq("product_id", product!.id)
    .eq("location_id", locationId)
    .single();
  await admin
    .from("inventory_stock")
    .update({ on_hand: 11, version: stock!.version + 1 })
    .eq("product_id", product!.id)
    .eq("location_id", locationId);

  await expect(editButton(b, NAMES[0], 11)).toBeVisible({ timeout: 20_000 });
});

test("A edits a count in its own window; B shows it without a reload", async () => {
  await a.getByRole("tab", { name: "Inventory", exact: true }).click();
  await a.getByRole("searchbox", { name: "Search Inventory" }).fill(TAG);
  await expect(editButton(a, NAMES[1], 5)).toBeVisible({ timeout: 30_000 });
  await editButton(a, NAMES[1], 5).click();
  await a.getByLabel(`On hand for ${NAMES[1]}`).fill("2");
  await a.getByLabel(`On hand for ${NAMES[1]}`).press("Enter");
  await a
    .getByRole("group", { name: "Reason for changing On hand" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(editButton(a, NAMES[1], 2)).toBeVisible({ timeout: 30_000 });

  await expect(editButton(b, NAMES[1], 2)).toBeVisible({ timeout: 20_000 });
});

test("a burst of changes is folded into a few re-reads, and B ends on the final values", async () => {
  const { admin, locationId } = await devLocation();
  const { data: products } = await admin
    .from("inventory_products")
    .select("id, name")
    .like("name", `${TAG}%`);
  const before = readsByB;
  for (let round = 1; round <= 3; round += 1) {
    for (const product of products!) {
      const { data: stock } = await admin
        .from("inventory_stock")
        .select("version")
        .eq("product_id", product.id)
        .eq("location_id", locationId)
        .single();
      await admin
        .from("inventory_stock")
        .update({ on_hand: 20 + round, version: stock!.version + 1 })
        .eq("product_id", product.id)
        .eq("location_id", locationId);
    }
  }
  // 9 updates -> the final value shows, after a handful of reads at most.
  for (const name of NAMES) {
    await expect(editButton(b, name, 23)).toBeVisible({ timeout: 20_000 });
  }
  await b.waitForTimeout(2000);
  expect(readsByB - before).toBeLessThanOrEqual(5);
});

test("B's History follows too: the ledger entries from A's count are there without a reload", async () => {
  await b.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await b.getByRole("button", { name: "Full history" }).click();
  await expect(
    b.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
  await expect(
    b.getByText(NAMES[1]).filter({ visible: true }).first(),
  ).toBeVisible({
    timeout: 30_000,
  });
});
