import { describe, expect, it } from "vitest";

import { CSV_LIMITS, decodeCsvBytes, parseCsv } from "./read";
import { toCsv } from "./write";

const ok = (text: string) => {
  const result = parseCsv(text);
  if (!result.ok) throw new Error(result.error);
  return result;
};
const values = (text: string) => {
  const r = ok(text);
  return [r.header.cells, ...r.rows.map((row) => row.cells)];
};

describe("parseCsv", () => {
  it("reads plain rows and numbers them like a spreadsheet (header = 1)", () => {
    const r = ok("a,b\n1,2\n3,4\n");
    expect(r.header).toEqual({ rowNumber: 1, cells: ["a", "b"] });
    expect(r.rows.map((x) => x.rowNumber)).toEqual([2, 3]);
  });

  it("handles quoted fields, doubled quotes and embedded commas", () => {
    expect(values('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("keeps a newline inside a quoted cell as one record", () => {
    const r = ok('a,b\n"line1\nline2",x\nnext,y\n');
    expect(r.rows[0].cells).toEqual(["line1\nline2", "x"]);
    expect(r.rows[1].rowNumber).toBe(3);
  });

  it.each([
    ["CRLF", "a,b\r\n1,2\r\n"],
    ["LF", "a,b\n1,2\n"],
    ["CR", "a,b\r1,2\r"],
    ["no trailing newline", "a,b\n1,2"],
  ])("accepts %s line ends", (_name, text) => {
    expect(values(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a byte-order mark", () => {
    expect(values("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });

  it("sniffs a semicolon or tab delimiter", () => {
    expect(ok("a;b\n1;2").delimiter).toBe(";");
    expect(values("a;b\n1;2")[1]).toEqual(["1", "2"]);
    expect(ok("a\tb\n1\t2").delimiter).toBe("\t");
    expect(ok("a,b\n1,2").delimiter).toBe(",");
  });

  it("does not sniff a delimiter from inside quotes", () => {
    expect(ok('"a;b;c",d\n1,2').delimiter).toBe(",");
  });

  it("drops fully blank lines but keeps the row numbers true", () => {
    const r = ok("a,b\n\n1,2\n,\n3,4\n");
    expect(r.rows.map((x) => [x.rowNumber, x.cells])).toEqual([
      [3, ["1", "2"]],
      [5, ["3", "4"]],
    ]);
  });

  it("keeps blank cells as empty strings (blank is meaningful for imports)", () => {
    expect(values("a,b,c\n1,,3")[1]).toEqual(["1", "", "3"]);
  });

  it("strips control characters from cells", () => {
    expect(values("a\n" + "x\u0000y\u0007z")[1]).toEqual(["xyz"]);
  });

  it("round-trips what the writer produces", () => {
    const rows = [
      ["Name", "Note"],
      ["Tito's, 750 mL", 'a "quoted"\nline'],
      ["=cmd", ""],
    ];
    const parsed = values(toCsv(rows));
    expect(parsed[1]).toEqual(["Tito's, 750 mL", 'a "quoted"\nline']);
    // The writer guards a formula-looking text; the reader gives back what is in the file.
    expect(parsed[2][0]).toBe("'=cmd");
  });

  it("refuses an empty file and an unclosed quote", () => {
    expect(parseCsv("")).toEqual({ ok: false, error: "That file is empty." });
    expect(parseCsv('a,b\n"open,1\n')).toMatchObject({ ok: false });
  });

  it("enforces the row, column and cell caps", () => {
    const tooMany = "a\n" + "x\n".repeat(CSV_LIMITS.maxRows + 1);
    expect(parseCsv(tooMany)).toMatchObject({
      ok: false,
      error: expect.stringContaining("5,000"),
    });
    const atLimit = "a\n" + "x\n".repeat(CSV_LIMITS.maxRows);
    expect(parseCsv(atLimit).ok).toBe(true);

    const wide = Array.from({ length: CSV_LIMITS.maxColumns + 1 }, (_, i) => i);
    expect(parseCsv(wide.join(","))).toMatchObject({ ok: false });

    expect(parseCsv("a\n" + "y".repeat(CSV_LIMITS.maxCell + 1))).toMatchObject({
      ok: false,
      error: expect.stringContaining("Row 2"),
    });
  });

  it("refuses a file over 5 MB without parsing it", () => {
    const big = "a".repeat(CSV_LIMITS.maxBytes + 1);
    expect(parseCsv(big)).toMatchObject({ ok: false });
  });
});

describe("decodeCsvBytes", () => {
  const enc = (text: string) => new TextEncoder().encode(text);

  it("decodes UTF-8, with or without a BOM", () => {
    expect(decodeCsvBytes(enc("café"))).toMatchObject({
      ok: true,
      text: "café",
    });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("a")]);
    expect(decodeCsvBytes(withBom)).toMatchObject({ ok: true });
  });

  it("decodes UTF-16 LE and BE by their byte-order mark", () => {
    const le = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x2c, 0x00, 0x62, 0x00]);
    expect(decodeCsvBytes(le)).toMatchObject({ ok: true, text: "a,b" });
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0x2c, 0x00, 0x62]);
    expect(decodeCsvBytes(be)).toMatchObject({ ok: true, text: "a,b" });
  });

  it("warns when bytes are not valid UTF-8", () => {
    const result = decodeCsvBytes(new Uint8Array([0x61, 0xff, 0x62]));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.warnings).toHaveLength(1);
  });

  it("refuses a file over 5 MB", () => {
    expect(
      decodeCsvBytes(new Uint8Array(CSV_LIMITS.maxBytes + 1)),
    ).toMatchObject({ ok: false });
  });
});
