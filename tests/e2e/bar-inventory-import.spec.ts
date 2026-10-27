import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-8c-2: the Import flow in demo mode (the browser plans
// and commits with the same pure functions the server action uses; the
// database half is covered by pgTAP and the hosted suites). Demo seed: Faust
// and Del Papa; Tito's 2+1, Modelo 3, Casamigos 6+2, House Rail Gin 5.
// Demo passcode 2468 = manager.

const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";

async function signIn(page: Page, passcode = "2468") {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openImport(page: Page) {
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
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("tab", { name: "Import", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import from a file" }),
  ).toBeVisible();
}

const upload = (
  page: Page,
  rows: string[],
  header = HEADER,
  name = "stock.csv",
) =>
  page.getByLabel("CSV file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from([header, ...rows].join("\n")),
  });

const counts = (page: Page) => page.getByTestId("import-counts");

async function noPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

const preview = (page: Page) =>
  page.getByRole("region", { name: "Import preview" });

test("a file is previewed, confirmed once, and lands in Inventory and History (BI-IMP flow)", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(page, [
    "Faust,Tito's Handmade Vodka,,,750 mL,,,10,2,,,,",
    "New Dist,Malbec,Wine,Red,750 mL,Bottle,,6,2,3,,10,",
  ]);

  await expect(counts(page)).toContainText(
    "Create 1 · Update 1 · Skip 0 · Error 0 · New vendors 1 · New categories 1 · New subcategories 1",
  );
  // The update shows Current → Imported → Delta; the new vendor is flagged.
  await expect(preview(page)).toContainText("On hand 2 → 10 (+8)");
  await expect(preview(page)).toContainText("Backup 1 → 2 (+1)");
  await expect(preview(page)).toContainText("New vendor");
  await noPageHorizontalScroll(page);

  // Nothing has changed yet: confirming is a separate, deliberate step.
  await page.getByRole("button", { name: /^Review and import/ }).click();
  const dialog = page.getByRole("dialog", { name: "Import these changes?" });
  await expect(dialog).toContainText("1 new items will be created");
  await expect(dialog).toContainText("1 existing items will be updated");
  await dialog.getByRole("button", { name: "Import now" }).click();

  await expect(page.getByText("Import complete")).toBeVisible();
  await expect(page.getByText(/stock.csv: 1 created, 1 updated/)).toBeVisible();

  // It is in the import history...
  const history = page.getByRole("region", { name: "Import history" });
  await expect(history).toContainText("stock.csv");

  // ...in Inventory...
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByText("Malbec").filter({ visible: true }).first(),
  ).toBeVisible();

  // ...and in History as bulk imports.
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Bulk import").filter({ visible: true }).first(),
  ).toBeVisible();
});

test("rows with problems are explained, never imported, and can be downloaded as a report", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(page, [
    "Faust,Tito's Handmade Vodka,,,750 mL,,,10,,,,,",
    ",No Vendor,,,,,,1,,,,,",
    'Faust,Big Number,,,1 L,,,"1,200",,,,,',
  ]);
  await expect(counts(page)).toContainText("Update 1 · Skip 0 · Error 2");
  await expect(preview(page)).toContainText("Vendor is required.");
  await expect(preview(page)).toContainText("thousand separators");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download error report" }).click();
  const report = await readFile(
    (await (await download).path()) as string,
    "utf8",
  );
  expect(report).toContain("Row,Problem,Original row");
  expect(report).toContain("Vendor is required.");
  expect(report).toContain("1,200");
});

test("a name close to an existing vendor must be chosen before importing", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(page, ["Fuast,House Gin,,,1 L,,,3,,,,,"]);

  const check = page.getByRole("region", { name: "Check these names" });
  await expect(check).toContainText("“Fuast”");
  await expect(check).toContainText("“Faust”");
  const confirm = page.getByRole("button", { name: /^Review and import/ });
  await expect(confirm).toBeDisabled();

  // A click, not check(): the choice re-plans the file and the radio goes away.
  await check.getByLabel("Use “Faust”").click();
  await expect(check).toBeHidden();
  await expect(confirm).toBeEnabled();
  // It now belongs to the existing vendor and proposes no new one.
  await expect(counts(page)).toContainText("New vendors 0");
  await expect(
    preview(page).getByText("New vendor", { exact: true }),
  ).toHaveCount(0);
});

test("a column the file names differently can be matched by hand", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(
    page,
    ["Faust,House Gin,6,1,2"],
    "Vendor,Name,On Hand,Spare,Floor",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Backup, Cutoff Limit" }),
  ).toBeVisible();

  await page
    .getByLabel("Use column Spare as")
    .selectOption({ label: "Backup" });
  await page
    .getByLabel("Use column Floor as")
    .selectOption({ label: "Cutoff Limit" });
  await expect(counts(page)).toContainText("Create 1");
});

test("unticking a row leaves it out", async ({ page }) => {
  await signIn(page);
  await openImport(page);
  await upload(page, [
    "Faust,Rum One,,,1 L,,,1,,,,,",
    "Faust,Rum Two,,,1 L,,,2,,,,,",
  ]);
  await expect(
    page.getByRole("button", { name: "Review and import (2)" }),
  ).toBeVisible();
  await page
    .getByLabel("Include row 3: Rum Two")
    .filter({ visible: true })
    .uncheck();
  await page.getByRole("button", { name: "Review and import (1)" }).click();
  await page
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(page.getByText("stock.csv: 1 created")).toBeVisible();

  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByText("Rum One").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Rum Two").filter({ visible: true })).toHaveCount(
    0,
  );
});

test("double-clicking Import applies the file once", async ({ page }) => {
  await signIn(page);
  await openImport(page);
  await upload(page, ["Faust,Twice Gin,,,1 L,,,4,,,,,"]);
  await page.getByRole("button", { name: /^Review and import/ }).click();
  await page
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .dblclick();
  await expect(page.getByText("Import complete")).toBeVisible();

  const rows = page
    .getByRole("region", { name: "Import history" })
    .getByText("stock.csv")
    .filter({ visible: true });
  await expect(rows).toHaveCount(1);

  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByText("Twice Gin").filter({ visible: true }),
  ).toHaveCount(1);
});

test("an Excel file is turned away with what to do instead", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await page.getByLabel("CSV file").setInputFiles({
    name: "stock.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Save As → CSV" }),
  ).toBeVisible();
});

test("the template downloads with the approved columns", async ({ page }) => {
  await signIn(page);
  await openImport(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  const text = await readFile(
    (await (await download).path()) as string,
    "utf8",
  );
  expect(text.replace(/^﻿/, "").split("\r\n")[0]).toBe(
    "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes",
  );
});
