import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./write";

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks, doubling inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("leaves plain text alone and writes blanks for null / undefined", () => {
    expect(csvCell("Tito's 750 mL")).toBe("Tito's 750 mL");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("neutralises formula starts in text", () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe('"\'\rx"');
  });

  it("keeps real numbers as numbers, including negatives and zero", () => {
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(3.5)).toBe("3.5");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("is BOM + CRLF rows", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", 1],
      ]),
    ).toBe("﻿a,b\r\nc,1\r\n");
  });
});
