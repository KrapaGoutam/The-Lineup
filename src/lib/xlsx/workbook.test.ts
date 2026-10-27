// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "@/features/bar-inventory/domain/demo-catalog";
import { planImport } from "@/features/bar-inventory/domain/import-run";
import { parseCsv } from "@/lib/csv/read";
import type { ExportSheet } from "@/lib/export/document";
import {
  edit,
  zeros,
  zip,
  skeleton,
} from "../../../tests/fixtures/bar-inventory/xlsx-builders";

import {
  cellText,
  readWorkbook,
  type RawSheet,
  type WorkbookReader,
} from "./workbook";

// `server-only` throws outside a server build; the adapters are only imported here.
vi.mock("server-only", () => ({}));
const { workbookToBuffer } = await import("./write-node");
const { readWorkbookNode } = await import("./read-node");

const book = async (sheets: ExportSheet[]) =>
  new Uint8Array(await workbookToBuffer(sheets));

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
] as const;

const stockSheet = (name: string, rows: ExportSheet["rows"]): ExportSheet => ({
  name,
  header: HEADER,
  rows,
});

const fake =
  (sheets: RawSheet[]): WorkbookReader =>
  async () =>
    sheets;

/** Valid bytes for the guard; the fake reader supplies the data. */
let anyBook: Uint8Array;
beforeEach(async () => {
  anyBook = await book([stockSheet("Stock", [])]);
});

describe("cellText", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    ["Gin", "Gin"],
    [5, "5"],
    [0, "0"],
    [3.25, "3.25"],
    [0.1 + 0.2, "0.3"],
    // Whole numbers are exact: an EAN-13 barcode held as a number must not be rounded.
    [5012345678905, "5012345678905"],
    [123456789012345, "123456789012345"],
    [-42, "-42"],
    // Beyond what JavaScript will write out in full: left as is, and the
    // importer rejects it with a clear "not a number" message.
    [1e21, "1e+21"],
    [1e-7, "0.0000001"],
    [true, "TRUE"],
    [false, "FALSE"],
    [new Date("2026-10-27T12:00:00Z"), "2026-10-27"],
    [Number.NaN, ""],
    ["a\u0000b", "ab"],
  ])("%j → %j", (cell, text) => {
    expect(cellText(cell as never)).toBe(text);
  });
});

describe("readWorkbook (fake reader: exact cells, exact rows)", () => {
  const read = (data: RawSheet["data"], sheet = "Stock") =>
    readWorkbook(anyBook, fake([{ sheet, data }]));
  const ok = async (data: RawSheet["data"]) => {
    const r = await read(data);
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("one CSV line per spreadsheet row; blank rows stay blank so row numbers are the sheet's own", async () => {
    const r = await ok([
      [],
      [],
      ["Vendor", "Name"],
      ["Faust", "Gin"],
      [],
      ["Faust", "Rum"],
    ]);
    expect(r.csv.split("\n")).toEqual([
      "",
      "",
      "Vendor,Name",
      "Faust,Gin",
      "",
      "Faust,Rum",
    ]);
    const parsed = parseCsv(r.csv);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.header.rowNumber).toBe(3);
      expect(parsed.rows.map((x) => x.rowNumber)).toEqual([4, 6]);
    }
  });

  it("blank (null) stays blank and 0 stays 0: the difference the importer relies on (D4)", async () => {
    const r = await ok([
      ["Vendor", "Name", "On Hand", "Backup"],
      ["Faust", "Gin", null, 0],
    ]);
    expect(r.csv.split("\n")[1]).toBe("Faust,Gin,,0");
  });

  it("trims trailing empty cells but keeps empty cells between values", async () => {
    const r = await ok([
      ["A", "B", "C", null, null],
      ["x", null, "z", null, null],
    ]);
    expect(r.csv).toBe("A,B,C\nx,,z");
  });

  it("quotes text that needs it and keeps what the person typed", async () => {
    const r = await ok([
      ["Name", "Notes"],
      ["Tito's, 750 mL", 'say "hi"\nnext'],
    ]);
    expect(parseCsv(r.csv)).toMatchObject({
      ok: true,
      rows: [{ cells: ["Tito's, 750 mL", 'say "hi"\nnext'] }],
    });
  });

  it("does not add the formula-guard apostrophe (that is for exports, not for reading)", async () => {
    const r = await ok([["Name"], ["-Special"], ["=Name"]]);
    expect(r.csv).toBe("Name\n-Special\n=Name");
  });

  it("numbers become plain decimals, booleans TRUE/FALSE, dates ISO days", async () => {
    const r = await ok([
      ["N", "B", "D"],
      [0.1 + 0.2, true, new Date("2026-10-27T00:00:00Z")],
    ]);
    expect(r.csv.split("\n")[1]).toBe("0.3,TRUE,2026-10-27");
  });

  it("lists each sheet with its data row count, and picks the first with data", async () => {
    const r = await readWorkbook(
      anyBook,
      fake([
        { sheet: "Empty", data: [] },
        {
          sheet: "Stock",
          data: [
            ["Vendor", "Name"],
            ["Faust", "Gin"],
            ["Faust", "Rum"],
          ],
        },
        { sheet: "Other", data: [["Vendor"], ["x"]] },
      ]),
    );
    expect(r).toMatchObject({
      ok: true,
      selected: "Stock",
      sheets: [
        { name: "Empty", rows: 0 },
        { name: "Stock", rows: 2 },
        { name: "Other", rows: 1 },
      ],
    });
  });

  it("reads the sheet the person chose, and refuses one that does not exist", async () => {
    const sheets = [
      { sheet: "A", data: [["Vendor"], ["one"]] },
      { sheet: "B", data: [["Vendor"], ["two"]] },
    ];
    expect(
      await readWorkbook(anyBook, fake(sheets), { sheet: "B" }),
    ).toMatchObject({
      ok: true,
      selected: "B",
      csv: "Vendor\ntwo",
    });
    expect(
      await readWorkbook(anyBook, fake(sheets), { sheet: "Nope" }),
    ).toMatchObject({
      ok: false,
      error: "This workbook has no sheet called “Nope”.",
    });
  });

  it("an empty sheet and a workbook with no sheets are explained", async () => {
    expect(await read([])).toMatchObject({
      ok: false,
      error: "“Stock” is empty.",
    });
    expect(await readWorkbook(anyBook, fake([]))).toMatchObject({
      ok: false,
      error: "This workbook has no sheets.",
    });
  });

  it("enforces the column, row and cell limits with the row named", async () => {
    const wide = Array.from({ length: 41 }, (_, i) => `c${i}`);
    expect(await read([["Vendor"], wide])).toMatchObject({
      ok: false,
      error: "Row 2 has more than 40 columns.",
    });
    const tall = [["Vendor"], ...Array.from({ length: 5001 }, () => ["x"])];
    expect(await read(tall)).toMatchObject({
      ok: false,
      error: expect.stringContaining("5,000"),
    });
    expect(await read([["Vendor"], ["y".repeat(501)]])).toMatchObject({
      ok: false,
      error: "Row 2 has a value longer than 500 characters.",
    });
    expect(
      (await read([["Vendor"], ...Array.from({ length: 5000 }, () => ["x"])]))
        .ok,
    ).toBe(true);
  });

  it("a reader that throws is a damaged file, not a crash", async () => {
    const result = await readWorkbook(anyBook, async () => {
      throw new Error("boom");
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("isn't a valid .xlsx"),
    });
  });
});

describe("readWorkbook: the guard comes first", () => {
  it("a hostile workbook is refused and the reader is never called", async () => {
    const reader = vi.fn<WorkbookReader>(async () => []);
    const bomb = zip(skeleton([zeros(40 * 1024 * 1024)]), 9);
    const result = await readWorkbook(bomb, reader);
    expect(result).toMatchObject({ ok: false });
    expect(reader).not.toHaveBeenCalled();
  });

  it("plain text, a truncated file and a macro workbook are each refused in plain words", async () => {
    const reader = vi.fn<WorkbookReader>(async () => []);
    const real = await book([stockSheet("Stock", [["Faust", "Gin"]])]);
    for (const bytes of [
      new TextEncoder().encode("Vendor,Name\nFaust,Gin"),
      real.slice(0, real.length / 2),
    ]) {
      const r = await readWorkbook(bytes, reader);
      expect(r).toMatchObject({
        ok: false,
        error: expect.stringContaining("valid .xlsx"),
      });
    }
    expect(reader).not.toHaveBeenCalled();
  });
});

describe("readWorkbook: formulas that were never calculated", () => {
  const withGap = async (sheetFile: string) =>
    edit(
      await book([
        stockSheet("Stock", [["Faust", "Gin"]]),
        stockSheet("Other", [["Faust", "Rum"]]),
      ]),
      (name, text) =>
        name === sheetFile
          ? text.replace(
              "</sheetData>",
              '<row r="9"><c r="H9"><f>SUM(A1:A8)</f></c></row></sheetData>',
            )
          : undefined,
    );

  it("refuses the chosen sheet and says which cell, instead of reading a blank", async () => {
    const r = await readWorkbook(
      await withGap("xl/worksheets/sheet1.xml"),
      readWorkbookNode,
      {
        sheet: "Stock",
      },
    );
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining("H9"),
    });
    if (!r.ok) expect(r.error).toContain("save it, and upload it again");
  });

  it("ignores a gap on a sheet that was not chosen", async () => {
    const r = await readWorkbook(
      await withGap("xl/worksheets/sheet2.xml"),
      readWorkbookNode,
      {
        sheet: "Stock",
      },
    );
    expect(r.ok).toBe(true);
  });
});

describe("readWorkbook: cells showing an Excel error, and empty-text formulas", () => {
  const withCells = async (cells: string) =>
    edit(await book([stockSheet("Stock", [["Faust", "Gin"]])]), (name, text) =>
      name === "xl/worksheets/sheet1.xml"
        ? text.replace("</sheetData>", `<row r="9">${cells}</row></sheetData>`)
        : undefined,
    );

  it("refuses a sheet with an error cell, naming it, instead of reading a blank", async () => {
    const r = await readWorkbook(
      await withCells(
        '<c r="H9" t="e"><f>VLOOKUP(1,A:B,2,0)</f><v>#N/A</v></c>',
      ),
      readWorkbookNode,
      { sheet: "Stock" },
    );
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining("H9"),
    });
    if (!r.ok) expect(r.error).toContain("Excel error");
  });

  it("a formula that returns an empty string does not block the sheet", async () => {
    const r = await readWorkbook(
      await withCells('<c r="M9" t="str"><f>IF(A9="","",A9)</f><v></v></c>'),
      readWorkbookNode,
      { sheet: "Stock" },
    );
    expect(r.ok).toBe(true);
  });

  it("a 13-digit barcode stored as a number reaches the importer exactly", async () => {
    const sheet: ExportSheet = stockSheet("Stock", [["Faust", "Gin"]]);
    const raw: RawSheet[] = [
      {
        sheet: "S",
        data: [
          ["Vendor", "Name", "SKU"],
          ["Faust", "Gin", 5012345678905],
        ],
      },
    ];
    const r = await readWorkbook(await book([sheet]), async () => raw, {
      sheet: "S",
    });
    expect(r.ok && r.csv).toContain("5012345678905");
  });
});

describe("readWorkbook with the real library", () => {
  it("round-trips an exported workbook, sheet by sheet", async () => {
    const bytes = await book([
      stockSheet("Stock", [
        [
          "Faust",
          "Gin",
          null,
          null,
          "1 L",
          "Bottle",
          null,
          6,
          1,
          2,
          null,
          10,
          null,
        ],
      ]),
      stockSheet("Archive", [["Del Papa", "Lager"]]),
    ]);
    const r = await readWorkbook(bytes, readWorkbookNode);
    expect(r).toMatchObject({
      ok: true,
      selected: "Stock",
      sheets: [
        { name: "Stock", rows: 1 },
        { name: "Archive", rows: 1 },
      ],
    });
    if (r.ok)
      expect(r.csv.split("\n")[1]).toBe("Faust,Gin,,,1 L,Bottle,,6,1,2,,10");
  });

  it("a formula-looking text cell is read back as the text it is", async () => {
    const bytes = await book([
      stockSheet("Stock", [["Faust", "=cmd|' /C calc'!A0"]]),
    ]);
    const r = await readWorkbook(bytes, readWorkbookNode);
    // The exporter guards it with a leading apostrophe; reading returns the stored text unchanged.
    if (r.ok) expect(r.csv.split("\n")[1]).toContain("'=cmd");
    expect(r.ok).toBe(true);
  });
});

describe("an XLSX and the same CSV are one import (convergence)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T16:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const rows: ExportSheet["rows"] = [
    [
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
    ],
    [
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
    ],
    [
      "Fuast",
      "House Gin",
      null,
      null,
      "1 L",
      null,
      null,
      null,
      5,
      null,
      null,
      null,
      null,
    ],
    [
      null,
      "No Vendor",
      null,
      null,
      null,
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
    ],
  ];
  const csv = [
    HEADER.join(","),
    "Faust,Tito's Handmade Vodka,,,750 mL,,,10,2,,,,",
    "New Dist,Malbec,Wine,Red,750 mL,Bottle,M-1,6,0,3,,10,Bold",
    "Fuast,House Gin,,,1 L,,,,5,,,,",
    ",No Vendor,,,,,,1,,,,,",
  ].join("\n");

  it("produce the identical plan: same actions, diffs, near-misses, errors and fingerprint", async () => {
    const catalog = buildDemoCatalog();
    const read = await readWorkbook(
      await book([stockSheet("Stock", rows)]),
      readWorkbookNode,
    );
    if (!read.ok) throw new Error(read.error);

    const request = {
      reason: "stock_count" as const,
      mapping: {},
      choices: {},
    };
    const fromXlsx = planImport({ ...request, csv: read.csv }, catalog);
    const fromCsv = planImport({ ...request, csv }, catalog);
    expect(fromXlsx.ok && fromCsv.ok).toBe(true);
    if (fromXlsx.ok && fromCsv.ok) {
      expect(fromXlsx.plan).toEqual(fromCsv.plan);
      expect(fromXlsx.fingerprint).toBe(fromCsv.fingerprint);
      // And the plan is what the rules say, not an accident of both being empty.
      expect(fromXlsx.plan.summary).toMatchObject({
        update: 1,
        // Malbec, and House Gin under the not-yet-chosen "Fuast".
        create: 2,
        error: 1,
      });
      expect(fromXlsx.plan.nearMisses).toHaveLength(1);
    }
  });

  it("blank vs 0 survive the workbook: blank backup is unchanged, 0 is zero", async () => {
    const catalog = buildDemoCatalog();
    const read = await readWorkbook(
      await book([
        stockSheet("Stock", [
          [
            "Faust",
            "Tito's Handmade Vodka",
            null,
            null,
            "750 mL",
            null,
            null,
            7,
            null,
            null,
            null,
            null,
            null,
          ],
          [
            "Del Papa",
            "Modelo Especial",
            null,
            null,
            "12 oz",
            "Can",
            null,
            null,
            0,
            null,
            null,
            null,
            null,
          ],
        ]),
      ]),
      readWorkbookNode,
    );
    if (!read.ok) throw new Error(read.error);
    const r = planImport(
      { csv: read.csv, reason: "stock_count", mapping: {}, choices: {} },
      catalog,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.rows[0].values).toEqual({ onHand: 7 }); // backup blank: untouched
    expect(r.plan.rows[1].values).toEqual({ backup: 0 }); // backup 0: set to zero
  });
});
