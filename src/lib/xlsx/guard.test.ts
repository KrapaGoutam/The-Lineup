// @vitest-environment node
import { strToU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";

import type { ExportSheet } from "@/lib/export/document";
import {
  edit,
  lieAboutSizes,
  skeleton,
  unzip,
  withEntry,
  zeros,
  zip,
} from "../../../tests/fixtures/bar-inventory/xlsx-builders";

import { inspectWorkbook, XLSX_LIMITS } from "./guard";

// `server-only` throws outside a server build; the writer adapter is only imported here.
vi.mock("server-only", () => ({}));
const { workbookToBuffer } = await import("./write-node");

const sheet = (name: string): ExportSheet => ({
  name,
  header: ["Vendor", "Name", "On Hand"],
  rows: [["Faust", "Gin", 3]],
});
const valid = async (...names: string[]) =>
  new Uint8Array(await workbookToBuffer(names.map(sheet)));

const rejects = (bytes: Uint8Array, code: string) => {
  const result = inspectWorkbook(bytes);
  expect(result).toMatchObject({ ok: false, code });
  return result;
};

describe("inspectWorkbook: what it accepts", () => {
  it("a workbook the app itself exports", async () => {
    const result = inspectWorkbook(await valid("Stock"));
    expect(result).toEqual({
      ok: true,
      sheets: ["Stock"],
      formulaGaps: [],
      errorCells: [],
      warnings: [],
    });
  });

  it("lists every sheet, in workbook order", async () => {
    const result = inspectWorkbook(await valid("Alpha", "Beta", "Gamma"));
    expect(result).toMatchObject({
      ok: true,
      sheets: ["Alpha", "Beta", "Gamma"],
    });
  });

  it("a formula that HAS a saved value is fine (it is read, never evaluated)", async () => {
    const book = edit(await valid("Stock"), (name, text) =>
      name === "xl/worksheets/sheet1.xml"
        ? text.replace(
            "</sheetData>",
            '<row r="9"><c r="A9"><f>1+1</f><v>2</v></c></row></sheetData>',
          )
        : undefined,
    );
    expect(inspectWorkbook(book)).toMatchObject({ ok: true, formulaGaps: [] });
  });
});

describe("inspectWorkbook: what is not a workbook", () => {
  it("plain text renamed .xlsx", () => {
    rejects(strToU8("Vendor,Name\nFaust,Gin"), "not_xlsx");
  });

  it("an empty file", () => {
    rejects(new Uint8Array(0), "not_xlsx");
  });

  it("the old binary Excel format (.xls) by its magic bytes", () => {
    rejects(
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
      "legacy_format",
    );
  });

  it("a zip that is not a workbook (no content types / workbook part)", () => {
    rejects(zip({ "readme.txt": strToU8("hi") }), "not_xlsx");
  });

  it("a workbook cut short is corrupt, not half-read", async () => {
    const book = await valid("Stock");
    rejects(book.slice(0, Math.floor(book.length * 0.6)), "corrupt");
  });

  it("a file over 5 MB is refused before it is read", () => {
    const big = new Uint8Array(XLSX_LIMITS.maxFileBytes + 1);
    big[0] = 0x50;
    big[1] = 0x4b;
    rejects(big, "too_large");
  });
});

describe("inspectWorkbook: macros, links, objects", () => {
  it("a vbaProject.bin entry is a macro workbook", async () => {
    rejects(
      withEntry(await valid("Stock"), "xl/vbaProject.bin", "x"),
      "macro_enabled",
    );
  });

  it("a macro-enabled content type is a macro workbook", async () => {
    const book = edit(await valid("Stock"), (name, text) =>
      name === "[Content_Types].xml"
        ? text.replace(
            "</Types>",
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
          )
        : undefined,
    );
    rejects(book, "macro_enabled");
  });

  it("external links and embedded objects are ignored, and said so", async () => {
    let book: Uint8Array = await valid("Stock");
    book = withEntry(book, "xl/externalLinks/externalLink1.xml", "<x/>");
    book = withEntry(book, "xl/embeddings/oleObject1.bin", "x");
    const result = inspectWorkbook(book);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.warnings).toEqual([
        "1 link(s) to other workbooks were ignored.",
        "1 embedded object(s) were ignored.",
      ]);
    }
  });
});

describe("inspectWorkbook: hostile sizes (the library alone would inflate these)", () => {
  const bomb = (entryBytes: number, entries = 1) =>
    zip(
      {
        ...skeleton(Array.from({ length: entries }, () => zeros(entryBytes))),
      },
      9,
    );

  it("a 40 MB entry from a tiny upload is stopped, fast", () => {
    const file = bomb(40 * 1024 * 1024);
    expect(file.length).toBeLessThan(200 * 1024); // it really is tiny
    const started = Date.now();
    rejects(file, "entry_too_large");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("many entries that are each fine but together too big", () => {
    // Four 20 MB sheets = 80 MB > the 50 MB archive cap, each under the 30 MB entry cap.
    rejects(bomb(20 * 1024 * 1024, 4), "archive_too_large");
  });

  it("does not trust the size the zip header declares", () => {
    const lying = lieAboutSizes(bomb(40 * 1024 * 1024));
    rejects(lying, "entry_too_large");
  });

  it("too many entries", () => {
    const files: Record<string, Uint8Array> = {
      ...skeleton([strToU8("<worksheet/>")]),
    };
    for (let i = 0; i < XLSX_LIMITS.maxEntries + 1; i += 1) {
      files[`xl/media/image${i}.png`] = strToU8("x");
    }
    rejects(zip(files), "too_many_entries");
  });

  it("more than 5 sheets", async () => {
    rejects(await valid("a", "b", "c", "d", "e", "f"), "too_many_sheets");
    expect(inspectWorkbook(await valid("a", "b", "c", "d", "e"))).toMatchObject(
      {
        ok: true,
      },
    );
  });
});

describe("inspectWorkbook: formulas with no saved value", () => {
  const noValue = (sheetFile: string) => (name: string, text: string) =>
    name === sheetFile
      ? text.replace(
          "</sheetData>",
          '<row r="9"><c r="C9"><f>SUM(A1:A8)</f></c><c r="D9"><f>1+1</f><v></v></c></row></sheetData>',
        )
      : undefined;

  it("reports each uncalculated formula cell on its own sheet", async () => {
    const book = edit(
      await valid("Stock", "Other"),
      noValue("xl/worksheets/sheet2.xml"),
    );
    const result = inspectWorkbook(book);
    expect(result).toMatchObject({
      ok: true,
      formulaGaps: [
        { sheet: "Other", cell: "C9" },
        { sheet: "Other", cell: "D9" },
      ],
    });
  });

  it("finds the right sheet even when the files are not in sheet order", () => {
    const sheets = [
      strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><f>1</f></c></row></sheetData></worksheet>',
      ),
      strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
      ),
    ];
    const files = skeleton(sheets);
    // Point S1 at sheet2.xml and S2 at sheet1.xml.
    files["xl/_rels/workbook.xml.rels"] = strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    const result = inspectWorkbook(zip(files));
    expect(result).toMatchObject({
      ok: true,
      formulaGaps: [{ sheet: "S2", cell: "A1" }],
    });
  });
});

const sheet1 = "xl/worksheets/sheet1.xml";
/** A valid one-sheet workbook with `tail` appended inside <sheetData>. */
const withSheetData = async (tail: string) =>
  edit(await valid("Stock"), (name, text) =>
    name === sheet1
      ? text.replace("</sheetData>", tail + "</sheetData>")
      : undefined,
  );

describe("inspectWorkbook: how far the data reaches (memory bound)", () => {
  it("refuses a value far to the right (a ~1 KB file that would need billions of slots)", async () => {
    rejects(
      await withSheetData('<row r="1"><c r="XFD1"><v>1</v></c></row>'),
      "sheet_too_large",
    );
  });

  it("refuses a value far down", async () => {
    rejects(
      await withSheetData(
        '<row r="1048576"><c r="A1048576"><v>1</v></c></row>',
      ),
      "sheet_too_large",
    );
  });

  it("refuses an empty row numbered far down", async () => {
    rejects(await withSheetData('<row r="900000"/>'), "sheet_too_large");
  });

  it("is not fooled by single-quoted attributes (XML allows them)", async () => {
    rejects(
      await withSheetData("<row r='1'><c r='XFD1'><v>1</v></c></row>"),
      "sheet_too_large",
    );
  });

  it("the edge of the limit is accepted: column 40, row 50,000", async () => {
    const book = await withSheetData(
      '<row r="50000"><c r="AN50000"><v>1</v></c></row>',
    );
    expect(inspectWorkbook(book)).toMatchObject({ ok: true });
  });

  it("styled empty cells far away cost nothing and are fine", async () => {
    const book = await withSheetData('<row r="1"><c r="XFD1" s="1"/></row>');
    expect(inspectWorkbook(book)).toMatchObject({ ok: true });
  });
});

describe("inspectWorkbook: cells that show an Excel error, and empty-text formulas", () => {
  it("reports an error cell (#N/A would otherwise import as blank = unchanged)", async () => {
    const book = await withSheetData(
      '<row r="9"><c r="B9" t="e"><f>VLOOKUP(1,A:B,2,0)</f><v>#N/A</v></c></row>',
    );
    expect(inspectWorkbook(book)).toMatchObject({
      ok: true,
      errorCells: [{ sheet: "Stock", cell: "B9" }],
      formulaGaps: [],
    });
  });

  it("a formula that returns the empty string is a real blank, not a gap", async () => {
    const book = await withSheetData(
      '<row r="9"><c r="B9" t="str"><f>IF(A9="","",A9)</f><v></v></c></row>',
    );
    expect(inspectWorkbook(book)).toMatchObject({ ok: true, formulaGaps: [] });
  });

  it("but an untyped or numeric formula with an empty value is still a gap", async () => {
    const book = await withSheetData(
      '<row r="9"><c r="B9"><f>1+1</f><v></v></c><c r="C9" t="n"><f>2</f></c></row>',
    );
    expect(inspectWorkbook(book)).toMatchObject({
      ok: true,
      formulaGaps: [
        { sheet: "Stock", cell: "B9" },
        { sheet: "Stock", cell: "C9" },
      ],
    });
  });
});

describe("inspectWorkbook: sheet names with numeric entities", () => {
  it("matches a name written as &#233; / &#xE9; to the library's name", () => {
    const files = skeleton([
      strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><f>1</f></c></row></sheetData></worksheet>',
      ),
    ]);
    files["xl/workbook.xml"] = strToU8(
      '<workbook><sheets><sheet name="Caf&#233; &#xE9;" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    expect(inspectWorkbook(zip(files))).toMatchObject({
      ok: true,
      sheets: ["Café é"],
      formulaGaps: [{ sheet: "Café é", cell: "A1" }],
    });
  });
});

describe("inspectWorkbook: hostile XML cannot stall the server (linear scan)", () => {
  // Each of these took seconds to hours with the earlier backtracking patterns.
  const within = (ms: number, run: () => void) => {
    const start = performance.now();
    run();
    expect(performance.now() - start).toBeLessThan(ms);
  };

  it("hundreds of thousands of unclosed <c> tags", async () => {
    const book = await withSheetData("<c>".repeat(300_000));
    within(1500, () => rejects(book, "corrupt"));
  });

  it("hundreds of thousands of '<Relationship ' with no end", () => {
    const files = skeleton([strToU8("<worksheet><sheetData/></worksheet>")]);
    files["xl/_rels/workbook.xml.rels"] = strToU8(
      "<Relationship ".repeat(200_000),
    );
    within(1500, () => rejects(zip(files), "corrupt"));
  });

  it("an enormous start tag is not a tag", async () => {
    const book = await withSheetData('<c r="A1" x="' + "a".repeat(6000) + '">');
    rejects(book, "corrupt");
  });

  it("a hundred thousand ordinary cells scan in well under a second", async () => {
    const cells = Array.from(
      { length: 100_000 },
      (_, i) => `<c r="A1"><v>${i}</v></c>`,
    ).join("");
    const book = await withSheetData(`<row r="1">${cells}</row>`);
    within(1500, () =>
      expect(inspectWorkbook(book)).toMatchObject({ ok: true }),
    );
  });
});

describe("the builders themselves", () => {
  it("a rebuilt workbook unzips to the same part names", async () => {
    const book = await valid("Stock");
    expect(
      Object.keys(unzip(withEntry(book, "extra.txt", "x"))).sort(),
    ).toEqual([...Object.keys(unzip(book)), "extra.txt"].sort());
  });
});
