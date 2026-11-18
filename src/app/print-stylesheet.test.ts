import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the print-stylesheet guarantees established by the V2.0.7 browser PDF checks. These
 * are source-level assertions only: the REAL pagination evidence comes from the Chromium PDF
 * run recorded in the handoff, not from this test.
 */
const css = fs.readFileSync(
  path.join(import.meta.dirname, "globals.css"),
  "utf8",
);
const printBlocks = [...css.matchAll(/@media print\s*\{([\s\S]*?)\n\}/g)].map(
  (m) => m[1],
);
const print = printBlocks.join("\n");

describe("print stylesheet", () => {
  it("forces the ROOT element white as well as the body (a dark theme must never print dark)", () => {
    // Found in the V2.0.7 PDF run: under the dark theme `html` kept the dark app background.
    expect(print).toMatch(
      /html,\s*body\s*\{[^}]*background:\s*white\s*!important/,
    );
  });

  it("gives the combined report a named Letter page with real margins", () => {
    expect(css).toMatch(/@page report\s*\{[^}]*size:\s*letter portrait/);
    expect(css).toMatch(/@page report\s*\{[^}]*margin:\s*12mm/);
    expect(print).toMatch(/\.report-document\s*\{[^}]*page:\s*report/);
  });

  it("starts each report section on a new page without a blank first page", () => {
    expect(print).toMatch(/\.report-section\s*\{[^}]*break-before:\s*page/);
    expect(print).toMatch(
      /\.report-section:first-child\s*\{[^}]*break-before:\s*auto/,
    );
  });

  it("repeats table headers, never splits a row and keeps totals with the row above", () => {
    expect(print).toMatch(
      /\.report-document thead\s*\{[^}]*table-header-group/,
    );
    expect(print).toMatch(
      /\.report-document tr\s*\{[^}]*break-inside:\s*avoid/,
    );
    expect(print).toMatch(/\.report-total-row\s*\{[^}]*break-before:\s*avoid/);
  });

  it("hides the app shell, buttons and screen-only report chrome", () => {
    expect(print).toMatch(/header,\s*nav,\s*button,\s*\.no-print/);
    expect(print).toMatch(/\.report-no-print/);
  });

  it("does not repeat total rows at every page bottom (tfoot is a normal row group)", () => {
    expect(print).toMatch(/\.report-document tfoot\s*\{[^}]*table-row-group/);
  });
});
