import { readFile } from "node:fs/promises";

import { expect, test, type Download, type Page } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

// Bar Inventory V1 / BI-8a: CSV and XLSX exports in demo mode (the browser
// builds the same file the server action builds in real mode). Demo seed:
// Tito's 2+1 (Critical), Modelo 3 (Low), Casamigos 6+2 (Healthy), Gin 5 (no
// cutoff); back-dated history (see DEMO_HISTORY). Demo passcode 2468 = manager.

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

/** Clicks Export → a format, and returns the downloaded file's path and name. */
async function exportAs(
  page: Page,
  button: string,
  format: "CSV" | "Excel (.xlsx)",
): Promise<{ path: string; name: string }> {
  await page.getByRole("button", { name: button, exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${format}` }).click();
  const file: Download = await download;
  return {
    path: (await file.path()) as string,
    name: file.suggestedFilename(),
  };
}

const csvLines = async (path: string) =>
  (await readFile(path, "utf8")).replace(/^﻿/, "").trimEnd().split("\r\n");

test("Inventory exports every active item as CSV, numbers plain", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await tab(page, "Inventory").click();

  const file = await exportAs(page, "Export inventory", "CSV");
  expect(file.name).toMatch(
    /^bar-inventory_.+_inventory_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const lines = await csvLines(file.path);
  expect(lines[0]).toContain("Vendor,Name,Category");
  expect(lines).toHaveLength(5);
  // Critical first; counts are plain numbers.
  expect(lines[1]).toContain("Faust,Tito's Handmade Vodka");
  expect(lines[1]).toContain(",2,1,3,4,");
  expect(await readFile(file.path, "utf8")).not.toContain("Archived");
});

test("Inventory exports an .xlsx with real numbers (read back through the reader)", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await tab(page, "Inventory").click();

  const file = await exportAs(page, "Export inventory", "Excel (.xlsx)");
  expect(file.name).toMatch(/\.xlsx$/);
  const sheets = await readXlsxFile(file.path);
  expect(sheets.map((s) => s.sheet)).toEqual(["Inventory"]);
  const [header, first] = sheets[0].data;
  expect(header.slice(0, 2)).toEqual(["Vendor", "Name"]);
  const at = (title: string) => first[header.indexOf(title)];
  expect(at("Name")).toBe("Tito's Handmade Vodka");
  expect(at("On hand")).toBe(2);
  expect(at("Backup")).toBe(1);
  expect(at("Total")).toBe(3);
  expect(at("Status")).toBe("Critical");
  expect(sheets[0].data).toHaveLength(5);
});

test("a filtered export holds exactly the rows on screen; the person may still take all", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await tab(page, "Inventory").click();
  await page
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("modelo");

  await page
    .getByRole("button", { name: "Export inventory", exact: true })
    .click();
  await expect(page.getByLabel("Filtered rows (1)")).toBeChecked();
  const filtered = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const filteredFile = await filtered;
  expect(filteredFile.suggestedFilename()).toContain("inventory-filtered");
  const lines = await csvLines((await filteredFile.path()) as string);
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain("Modelo Especial");

  // All rows, even with the search still on.
  await page
    .getByRole("button", { name: "Export inventory", exact: true })
    .click();
  await page.getByLabel("All rows").check();
  const all = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const allFile = await all;
  expect(allFile.suggestedFilename()).not.toContain("filtered");
  expect(await csvLines((await allFile.path()) as string)).toHaveLength(5);
});

test("History exports the ledger, newest first, with signed numeric changes", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await page.getByRole("button", { name: "Full history" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory history" }),
  ).toBeVisible();
  await page.getByLabel("History range").selectOption({ label: "Everything" });
  await expect(
    page.getByRole("button", { name: "Export history" }),
  ).toBeVisible();

  const file = await exportAs(page, "Export history", "Excel (.xlsx)");
  expect(file.name).toMatch(/_history_/);
  const [sheet] = await readXlsxFile(file.path);
  expect(sheet.sheet).toBe("Inventory history");
  const [header, ...rows] = sheet.data;
  const dates = rows.map((r) => String(r[header.indexOf("Date (ISO)")]));
  expect(dates).toEqual([...dates].sort().reverse());
  expect(rows.length).toBeGreaterThan(20);
  expect(typeof rows[0][header.indexOf("Change on hand")]).toBe("number");
  expect(header).toContain("Date (local)");
});

test("Analytics exports the item table for the chosen period", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await page.getByRole("button", { name: "See analytics" }).click();
  await expect(page.getByTestId("an-stat-depletion")).toBeVisible();

  const file = await exportAs(page, "Export analytics", "CSV");
  expect(file.name).toMatch(/_analytics_/);
  const lines = await csvLines(file.path);
  expect(lines[0]).toContain("Average per day");
  expect(lines[0]).toContain("Period from");
  const tito = lines.find((l) => l.includes("Tito's Handmade Vodka"))!;
  expect(tito).toContain(",0.4,2.8,");
  expect(tito).toContain("At or below cutoff");
  // Too little history: blank, not a made-up rate.
  expect(lines.find((l) => l.includes("House Rail Gin"))).toContain(
    "Not enough history",
  );
});

test("Order recommendations export a workbook with a Summary and one sheet per vendor", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  const region = page.getByRole("region", { name: "Order soon" });
  await region.getByRole("button", { name: "Export recommendations" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel (.xlsx)" }).click();
  const file = await download;
  const sheets = await readXlsxFile((await file.path()) as string);
  expect(sheets.map((s) => s.sheet)).toEqual(["Summary", "Faust", "Del Papa"]);
  expect(sheets[0].data[1]).toEqual(["Faust", 1, 1, 0, 9, 0]);
  const faustItems = sheets[1].data.slice(1).map((r) => r[1]);
  expect(faustItems).toEqual(["Tito's Handmade Vodka"]);
});

test("the export menu closes with Escape and reports nothing when dismissed", async ({
  page,
}) => {
  await signIn(page);
  await openBarInventory(page);
  await tab(page, "Inventory").click();
  const button = page.getByRole("button", {
    name: "Export inventory",
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});
