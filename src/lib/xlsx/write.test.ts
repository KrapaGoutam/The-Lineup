// @vitest-environment node
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it, vi } from "vitest";

import type { ExportSheet } from "@/lib/export/document";

// `server-only` throws outside a server build; the adapter is only imported here.
vi.mock("server-only", () => ({}));

const { workbookToBuffer } = await import("./write-node");

const sheets: ExportSheet[] = [
  {
    name: "Summary",
    header: ["Vendor", "Suggested total"],
    rows: [
      ["Faust", 24],
      ["Del Papa", 0],
    ],
  },
  {
    name: "Faust",
    header: ["Item", "Total", "Note"],
    rows: [
      ["=cmd|' /C calc'!A0", -2, null],
      ["Tito's 750 mL", 3.5, "ok"],
    ],
  },
];

describe("workbookToBuffer (round trip through the approved reader)", () => {
  it("writes a real .xlsx (a zip) the reader can open, one sheet per entry", async () => {
    const buffer = await workbookToBuffer(sheets);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const read = await readXlsxFile(buffer);
    expect(read.map((s) => s.sheet)).toEqual(["Summary", "Faust"]);
  });

  it("keeps numbers as numbers, including negatives, zero and decimals", async () => {
    const read = await readXlsxFile(await workbookToBuffer(sheets));
    expect(read[0].data[1]).toEqual(["Faust", 24]);
    expect(read[0].data[2]).toEqual(["Del Papa", 0]);
    expect(read[1].data[1][1]).toBe(-2);
    expect(read[1].data[2][1]).toBe(3.5);
  });

  it("stores a formula-looking name as guarded text, never a formula", async () => {
    const read = await readXlsxFile(await workbookToBuffer(sheets));
    expect(read[1].data[1][0]).toBe("'=cmd|' /C calc'!A0");
    expect(read[1].data[1][2]).toBeNull();
  });

  it("opens with a bold header row of plain text", async () => {
    const read = await readXlsxFile(await workbookToBuffer(sheets));
    expect(read[1].data[0]).toEqual(["Item", "Total", "Note"]);
  });
});
