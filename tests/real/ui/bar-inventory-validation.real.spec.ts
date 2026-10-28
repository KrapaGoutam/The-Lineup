/**
 * Bar Inventory V1 / BI-10 -- hosted DEV validation of the real-mode READS the
 * demo suites cannot prove: Dashboard / Order soon, History, Analytics, and the
 * CSV and XLSX exports, each compared with what the database holds; plus the
 * same views on a phone-sized browser. Everything is created by a signed-in
 * manager through the real UI (a CSV import, then inline Usage counts) and
 * carries "RealVal-<stamp>"; it is deleted afterwards (service role, DEV only).
 */
import { readFile } from "node:fs/promises";

import {
  devices,
  expect,
  test,
  type BrowserContext,
  type Download,
  type Page,
} from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const TAG = `RealVal-${Date.now()}`;
const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";
const [LOW, USED, FINE] = ["Low", "Used", "Fine"].map(
  (suffix) => `${TAG} ${suffix}`,
);
const VENDOR = `${TAG} Dist`;

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

const tab = (p: Page, name: string) =>
  p.getByRole("tab", { name, exact: true });

async function openModule(p: Page) {
  await expect(accountButton(p)).toBeVisible();
  const dock = p.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await p
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Bar Inventory" })
      .click();
  } else {
    await p
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" })
      .click();
  }
  await expect(p.getByRole("heading", { name: "Bar Inventory" })).toBeVisible();
  await expect(p.getByText("Loading Bar Inventory…")).toBeHidden({
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

async function exportAs(
  p: Page,
  button: string,
  format: "CSV" | "Excel (.xlsx)",
) {
  await p.getByRole("button", { name: button, exact: true }).click();
  const pending = p.waitForEvent("download");
  await p.getByRole("button", { name: `Download ${format}` }).click();
  const file: Download = await pending;
  return {
    path: (await file.path()) as string,
    name: file.suggestedFilename(),
  };
}

const csvLines = async (path: string) =>
  (await readFile(path, "utf8")).replace(/^﻿/, "").trimEnd().split("\r\n");

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`manager: ${e.message}`));
  await signIn(page, PINS.TestManager);
});

test.afterAll(async () => {
  await context?.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("setup: a manager imports three items, then logs two Usage counts through the UI", async () => {
  await openModule(page);
  await tab(page, "Manage").click();
  await tab(page, "Import").click();
  const rows = [
    // on hand 2 <= cutoff 3: Critical, so it is on the order list
    `${VENDOR},${LOW},${TAG} Wine,${TAG} Red,750 mL,Bottle,,2,0,3,6,10,`,
    `${VENDOR},${USED},${TAG} Wine,${TAG} Red,750 mL,Bottle,,20,0,3,6,24,`,
    `${VENDOR},${FINE},${TAG} Wine,${TAG} White,750 mL,Bottle,,12,2,3,6,24,`,
  ];
  await page.getByLabel("CSV or Excel file").setInputFiles({
    name: `${TAG}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from([HEADER, ...rows].join("\n")),
  });
  await expect(page.getByTestId("import-counts")).toContainText("Create 3", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /^Review and import/ }).click();
  await page
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(page.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });

  // Two Usage counts on USED: 20 -> 15 -> 9 (confirmed usage 11).
  await tab(page, "Inventory").click();
  await page.getByRole("searchbox", { name: "Search Inventory" }).fill(TAG);
  for (const [from, to] of [
    [20, 15],
    [15, 9],
  ]) {
    await page
      .getByRole("button", {
        name: `Edit On hand for ${USED}, currently ${from}`,
      })
      .click();
    await page.getByLabel(`On hand for ${USED}`).fill(String(to));
    await page.getByLabel(`On hand for ${USED}`).press("Enter");
    const reason = page.getByRole("group", {
      name: "Reason for changing On hand",
    });
    await reason.getByLabel("Reason").selectOption({ label: "Usage" });
    await reason.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("button", {
        name: `Edit On hand for ${USED}, currently ${to}`,
      }),
    ).toBeVisible({ timeout: 30_000 });
  }
});

test("Dashboard reads the database: the critical item is on the order list", async () => {
  await tab(page, "Dashboard").click();
  const orderSoon = page.getByRole("region", { name: /Order soon/i });
  await expect(orderSoon).toContainText(LOW, { timeout: 30_000 });
  await expect(orderSoon).not.toContainText(FINE);
});

test("Inventory export (CSV and XLSX) equals the database", async () => {
  const { admin, locationId } = await devLocation();
  const { data: stock } = await admin
    .from("inventory_stock")
    .select("on_hand, backup, product:inventory_products!inner(name)")
    .eq("location_id", locationId)
    .like("product.name", `${TAG}%`);
  const truth = new Map(
    (stock ?? []).map((s) => {
      const product = s.product as unknown as { name: string };
      return [product.name, { onHand: s.on_hand, backup: s.backup }];
    }),
  );
  expect(truth.size).toBe(3);
  expect(truth.get(USED)).toEqual({ onHand: 9, backup: 0 });

  await tab(page, "Inventory").click();
  await page.getByRole("searchbox", { name: "Search Inventory" }).fill("");
  const csv = await exportAs(page, "Export inventory", "CSV");
  const lines = await csvLines(csv.path);
  const header = lines[0].split(",");
  const tagged = lines.filter((l) => l.includes(TAG));
  expect(tagged).toHaveLength(3);
  for (const [name, values] of truth) {
    const row = tagged.find((l) => l.includes(`${name},`))!.split(",");
    expect(Number(row[header.indexOf("On hand")])).toBe(values.onHand);
    expect(Number(row[header.indexOf("Backup")])).toBe(values.backup);
  }

  const xlsx = await exportAs(page, "Export inventory", "Excel (.xlsx)");
  const sheets = await readXlsxFile(xlsx.path);
  const [head, ...body] = sheets[0].data;
  const mine = body.filter((r) =>
    String(r[head.indexOf("Name")]).includes(TAG),
  );
  expect(mine).toHaveLength(3);
  for (const r of mine) {
    const name = String(r[head.indexOf("Name")]);
    expect(r[head.indexOf("On hand")]).toBe(truth.get(name)!.onHand);
    expect(typeof r[head.indexOf("Total")]).toBe("number");
  }
});

test("Order soon export lists exactly the item that needs ordering", async () => {
  await tab(page, "Dashboard").click();
  const csv = await exportAs(page, "Export recommendations", "CSV");
  const tagged = (await csvLines(csv.path)).filter((l) => l.includes(TAG));
  expect(tagged).toHaveLength(1);
  expect(tagged[0]).toContain(LOW);
});

test("History reads the ledger: bulk import and both Usage counts, with signed changes; the export matches", async () => {
  await page.getByRole("button", { name: "Full history" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: /Search/ })
    .first()
    .fill(USED);
  const table = page.getByRole("table", { name: /history/i });
  await expect(table.getByRole("row", { name: new RegExp(USED) })).toHaveCount(
    3,
    { timeout: 30_000 },
  );
  await expect(table).toContainText("Bulk import");
  await expect(table).toContainText("−5");
  await expect(table).toContainText("−6");

  const csv = await exportAs(page, "Export history", "CSV");
  const lines = (await csvLines(csv.path)).filter((l) => l.includes(USED));
  expect(lines.length).toBe(3);
  expect(lines.join("\n")).toMatch(/,-5,|,"-5"/);
});

test("the item sheet's own history shows the same three entries", async () => {
  await page.getByRole("button", { name: "Back" }).first().click();
  await tab(page, "Inventory").click();
  await page.getByRole("searchbox", { name: "Search Inventory" }).fill(USED);
  await page.getByRole("button", { name: `Adjust ${USED}` }).click();
  const sheet = page.getByRole("dialog", { name: USED });
  await sheet.getByRole("button", { name: "History", exact: true }).click();
  const entries = sheet.getByTestId("item-history-entry");
  await expect(entries).toHaveCount(3, { timeout: 30_000 });
  await expect(sheet).toContainText("Bulk import");
  await expect(sheet).toContainText("Usage");
  await page.keyboard.press("Escape");
});

test("Analytics reads the ledger: confirmed usage of 11 for the item that was used", async () => {
  await tab(page, "Dashboard").click();
  await page
    .getByRole("button", { name: /analytics/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Analytics" }).first(),
  ).toBeVisible();
  const row = page
    .getByRole("listitem")
    .filter({ hasText: USED })
    .or(page.getByLabel(USED))
    .first();
  await expect(row).toContainText("Used 11", { timeout: 30_000 });

  const csv = await exportAs(page, "Export analytics", "CSV");
  const lines = (await csvLines(csv.path)).filter((l) => l.includes(USED));
  expect(lines.length).toBeGreaterThanOrEqual(1);
  expect(lines.join("\n")).toContain("11");
});

test.describe("on a phone", () => {
  test("every view reads the database and fits the screen", async ({
    browser,
  }) => {
    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const p = await phone.newPage();
    p.on("pageerror", (e) => pageErrors.push(`phone: ${e.message}`));
    try {
      await signIn(p, PINS.TestManager);
      await openModule(p);
      const noSideScroll = async (where: string) => {
        const wide = await p.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(wide, `${where} scrolls sideways`).toBe(false);
      };

      await expect(
        p.getByRole("region", { name: /Order soon/i }),
      ).toContainText(LOW, { timeout: 30_000 });
      await noSideScroll("Dashboard");

      await tab(p, "Inventory").click();
      await p.getByRole("searchbox", { name: "Search Inventory" }).fill(TAG);
      await expect(
        p.getByRole("article", { name: USED }).filter({ visible: true }),
      ).toContainText("On hand 9");
      await noSideScroll("Inventory");

      await tab(p, "Dashboard").click();
      await p.getByRole("button", { name: "Full history" }).click();
      await expect(
        p.getByRole("heading", { name: "Inventory history" }),
      ).toBeVisible();
      await noSideScroll("History");

      await p.getByRole("button", { name: "Back" }).first().click();
      await tab(p, "Dashboard").click();
      await p
        .getByRole("button", { name: /analytics/i })
        .first()
        .click();
      await expect(
        p.getByRole("heading", { name: "Analytics" }).first(),
      ).toBeVisible();
      await noSideScroll("Analytics");
    } finally {
      await phone.close();
    }
  });
});

test("History and its export go past the API's 1,000-row cap, end to end", async () => {
  // 1,200 more ledger rows for one item, spread over the last 25 days, written
  // with the service role (the ledger is append-only for everyone else). The
  // product delete in cleanup() cascades them.
  const { admin, orgId, locationId } = await devLocation();
  const { data: product } = await admin
    .from("inventory_products")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", USED)
    .single();
  const { data: existing } = await admin
    .from("inventory_adjustments")
    .select("actor_profile_id")
    .eq("product_id", product!.id)
    .limit(1)
    .single();
  const now = Date.now();
  const rows = Array.from({ length: 1200 }, (_, i) => ({
    organization_id: orgId,
    location_id: locationId,
    product_id: product!.id,
    source: "manual_edit",
    reason: "stock_count",
    prev_on_hand: 9 + (i % 2),
    new_on_hand: 10 - (i % 2),
    prev_backup: 0,
    new_backup: 0,
    status_after: "healthy",
    actor_profile_id: existing!.actor_profile_id,
    created_at: new Date(now - (i + 1) * 1800_000).toISOString(),
    stock_version_after: 100 + i,
  }));
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await admin
      .from("inventory_adjustments")
      .insert(rows.slice(i, i + 400));
    expect(error).toBeNull();
  }

  await page.reload();
  await openModule(page);
  await tab(page, "Dashboard").click();
  await page.getByRole("button", { name: "Full history" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: /Search/ })
    .first()
    .fill(USED);
  const csv = await exportAs(page, "Export history", "CSV");
  const lines = (await csvLines(csv.path)).filter((l) => l.includes(USED));
  // 1,200 new rows + the 3 from the earlier tests; the old code stopped at 1,000.
  expect(lines.length).toBe(1203);
  // History must not claim a cut when nothing was cut.
  await expect(page.getByText(/most recent changes/i)).toHaveCount(0);
});
