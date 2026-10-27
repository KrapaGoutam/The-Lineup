import { strToU8, zipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import writeXlsxFile from "write-excel-file/node";

// Bar Inventory V1 / BI-8d: importing an .xlsx in demo mode. The workbook goes
// through the same bounded guard and reader as on the server, then is exactly
// the CSV import (same preview, same commit). Demo seed: Faust and Del Papa;
// Tito's 2+1. Demo passcode 2468 = manager.

const HEADER = [
  "Vendor",
  "Name",
  "Category",
  "Subcategory",
  "Size",
  "Unit",
  "SKU",
  "On Hand",
  "Backup",
  "Cutoff Limit",
  "Warning Level",
  "Par Level",
  "Notes",
];
type Row = (string | number | null)[];

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

/** A workbook with the given sheets (each: a name and its rows under the header). */
async function workbook(sheets: { name: string; rows: Row[] }[]) {
  return Buffer.from(
    await writeXlsxFile(
      sheets.map((s) => ({
        sheet: s.name,
        data: [HEADER.map((h) => ({ value: h })), ...s.rows],
      })),
    ).toBuffer(),
  );
}

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const upload = (page: Page, buffer: Buffer, name = "stock.xlsx") =>
  page
    .getByLabel("CSV or Excel file")
    .setInputFiles({ name, mimeType: XLSX_TYPE, buffer });

const counts = (page: Page) => page.getByTestId("import-counts");
const preview = (page: Page) =>
  page.getByRole("region", { name: "Import preview" });
const problem = (page: Page, text: string | RegExp) =>
  page.getByRole("alert").filter({ hasText: text });

const TITOS: Row = [
  "Faust",
  "Tito's Handmade Vodka",
  null,
  null,
  "750 mL",
  null,
  null,
  10,
  2,
  null,
  null,
  null,
  null,
];
const MALBEC: Row = [
  "New Dist",
  "Malbec",
  "Wine",
  "Red",
  "750 mL",
  "Bottle",
  "M-1",
  6,
  0,
  3,
  null,
  10,
  "Bold",
];

test("a workbook previews exactly like the same CSV, then imports and is recorded as Excel", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(
    page,
    await workbook([{ name: "Stock", rows: [TITOS, MALBEC] }]),
  );

  await expect(counts(page)).toContainText(
    "Create 1 · Update 1 · Skip 0 · Error 0 · New vendors 1 · New categories 1 · New subcategories 1",
  );
  await expect(preview(page)).toContainText("On hand 2 → 10 (+8)");
  // A 0 in the workbook is zero (Malbec's backup), not "leave unchanged".
  await expect(preview(page)).toContainText("Backup 0");

  await page.getByRole("button", { name: /^Review and import/ }).click();
  await page
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(page.getByText("Import complete")).toBeVisible();

  const history = page.getByRole("region", { name: "Import history" });
  await expect(history).toContainText("stock.xlsx");
  await expect(history).toContainText("Excel");
});

test("blank cells leave values alone; zero sets zero (D4), straight from a workbook", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(
    page,
    await workbook([
      {
        name: "Stock",
        // Tito's: on hand 9, backup left blank -> unchanged (stays 1).
        rows: [
          [
            "Faust",
            "Tito's Handmade Vodka",
            null,
            null,
            "750 mL",
            null,
            null,
            9,
            null,
            null,
            null,
            null,
            null,
          ],
        ],
      },
    ]),
  );
  const row = preview(page);
  await expect(row).toContainText("On hand 2 → 9 (+7)");
  // The column mapping also says "Backup"; a backup *change* reads "Backup <n>".
  await expect(row).not.toContainText(/Backup \d/);
});

test("a workbook with several sheets asks which one, and re-reads on a change", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  await upload(
    page,
    await workbook([
      { name: "Bar", rows: [TITOS] },
      {
        name: "Cellar",
        rows: [
          MALBEC,
          [
            "Faust",
            "Cellar Gin",
            null,
            null,
            "1 L",
            null,
            null,
            4,
            null,
            null,
            null,
            null,
            null,
          ],
        ],
      },
    ]),
  );
  // The first sheet with data is read, and the picker shows each sheet's size.
  await expect(counts(page)).toContainText("Update 1");
  const picker = page.getByLabel("Sheet", { exact: true });
  await expect(picker.locator("option")).toHaveText([
    "Bar (1 row)",
    "Cellar (2 rows)",
  ]);

  await picker.selectOption("Cellar");
  await expect(counts(page)).toContainText("Create 2 · Update 0");
});

test("a damaged, hostile or macro workbook is refused in plain words and nothing is previewed", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);

  // Text renamed .xlsx.
  await upload(page, Buffer.from("Vendor,Name\nFaust,Gin"), "fake.xlsx");
  await expect(problem(page, "isn't a valid .xlsx")).toBeVisible();

  // Cut short.
  const real = await workbook([{ name: "Stock", rows: [TITOS] }]);
  await upload(page, real.subarray(0, Math.floor(real.length / 2)), "cut.xlsx");
  await expect(problem(page, "isn't a valid .xlsx")).toBeVisible();

  // A tiny file that would inflate to 40 MB (a zip bomb), generated here.
  const bomb = Buffer.from(
    zipSync(
      {
        "[Content_Types].xml": strToU8("<Types/>"),
        "xl/workbook.xml": strToU8("<workbook/>"),
        "xl/worksheets/sheet1.xml": new Uint8Array(40 * 1024 * 1024),
      },
      { level: 9 },
    ),
  );
  expect(bomb.length).toBeLessThan(200 * 1024);
  await upload(page, bomb, "bomb.xlsx");
  await expect(problem(page, "more data than can be imported")).toBeVisible();

  // A workbook carrying a macro project.
  await upload(
    page,
    Buffer.from(
      zipSync({
        "[Content_Types].xml": strToU8("<Types/>"),
        "xl/workbook.xml": strToU8("<workbook/>"),
        "xl/vbaProject.bin": strToU8("x"),
      }),
    ),
    "macro.xlsx",
  );
  await expect(problem(page, "macros")).toBeVisible();

  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toHaveCount(0);
});

test("a workbook missing required columns offers the same column matching as a CSV", async ({
  page,
}) => {
  await signIn(page);
  await openImport(page);
  const book = Buffer.from(
    await writeXlsxFile([
      {
        sheet: "Stock",
        data: [
          ["Vendor", "Name", "On Hand", "Spare", "Floor"].map((value) => ({
            value,
          })),
          ["Faust", "House Gin", 6, 1, 2],
        ],
      },
    ]).toBuffer(),
  );
  await upload(page, book);
  await expect(problem(page, "Backup, Cutoff Limit")).toBeVisible();
  await page
    .getByLabel("Use column Spare as")
    .selectOption({ label: "Backup" });
  await page
    .getByLabel("Use column Floor as")
    .selectOption({ label: "Cutoff Limit" });
  await expect(counts(page)).toContainText("Create 1");
});
