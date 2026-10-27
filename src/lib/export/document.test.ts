import { describe, expect, it } from "vitest";

import {
  exportFilename,
  safeSheetName,
  sheetToCsv,
  workbookSheets,
  type ExportSheet,
} from "./document";

describe("safeSheetName", () => {
  const name = (raw: string, used = new Set<string>()) =>
    safeSheetName(raw, used);

  it("keeps an ordinary name", () => {
    expect(name("Faust")).toBe("Faust");
  });
  it("removes the characters Excel forbids", () => {
    expect(name("A/B\\C:D*E?F[G]H")).toBe("A B C D E F G H");
  });
  it("trims, collapses spaces and strips edge apostrophes", () => {
    expect(name("  'Del   Papa'  ")).toBe("Del Papa");
  });
  it("is at most 31 characters", () => {
    expect(name("x".repeat(50))).toHaveLength(31);
  });
  it("never returns a blank or the reserved name History", () => {
    expect(name("")).toBe("Sheet");
    expect(name("///")).toBe("Sheet");
    expect(name("History")).toBe("History sheet");
    expect(name("history")).toBe("history sheet");
  });
  it("makes names unique, case-insensitively, within the limit", () => {
    const used = new Set<string>();
    expect(safeSheetName("Faust", used)).toBe("Faust");
    expect(safeSheetName("FAUST", used)).toBe("FAUST (2)");
    expect(safeSheetName("faust", used)).toBe("faust (3)");
    const long = "y".repeat(40);
    expect(safeSheetName(long, used)).toHaveLength(31);
    const second = safeSheetName(long, used);
    expect(second).toHaveLength(31);
    expect(second.endsWith("(2)")).toBe(true);
  });
});

describe("exportFilename", () => {
  it("is bar-inventory_<restaurant>_<what>_<date>.<ext>", () => {
    expect(
      exportFilename({
        slug: "the-monks",
        what: "history",
        date: "2026-10-27",
        format: "xlsx",
      }),
    ).toBe("bar-inventory_the-monks_history_2026-10-27.xlsx");
  });
});

const sheet: ExportSheet = {
  name: "Inventory",
  header: ["Name", "On hand", "Note"],
  rows: [
    ["=cmd|' /C calc'!A0", 3, null],
    ["Tito's, 750 mL", -2, "line1\nline2"],
    ["+1", 0, "@SUM(A1)"],
  ],
};

describe("sheetToCsv", () => {
  it("writes the header and rows, guarding text and keeping numbers", () => {
    const lines = sheetToCsv(sheet).replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Name,On hand,Note");
    expect(lines[1]).toBe("'=cmd|' /C calc'!A0,3,");
    expect(lines[2]).toBe(`"Tito's, 750 mL",-2,"line1\nline2"`);
    // A real -2 stays -2; text that merely starts with "+" is guarded.
    expect(sheetToCsv(sheet)).toContain("'+1,0,'@SUM(A1)");
  });
});

describe("workbookSheets", () => {
  const [one] = workbookSheets([sheet]);

  it("names the sheet and keeps the header bold", () => {
    expect(one.sheet).toBe("Inventory");
    expect(one.data[0][0]).toEqual({ value: "Name", fontWeight: "bold" });
  });
  it("leaves numbers as numbers (including negatives and zero) and blanks as null", () => {
    expect(one.data[1][1]).toBe(3);
    expect(one.data[2][1]).toBe(-2);
    expect(one.data[3][1]).toBe(0);
    expect(one.data[1][2]).toBeNull();
  });
  it("guards text that could be read as a formula, the same as CSV", () => {
    expect(one.data[1][0]).toBe("'=cmd|' /C calc'!A0");
    expect(one.data[3][0]).toBe("'+1");
    expect(one.data[3][2]).toBe("'@SUM(A1)");
  });
  it("gives every sheet a safe, unique name", () => {
    const sheets = workbookSheets([
      { name: "Faust", header: ["a"], rows: [] },
      { name: "faust", header: ["a"], rows: [] },
      { name: "History", header: ["a"], rows: [] },
    ]);
    expect(sheets.map((s) => s.sheet)).toEqual([
      "Faust",
      "faust (2)",
      "History sheet",
    ]);
  });
});
