import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { presetWindow } from "./analytics";
import { buildDemoCatalog } from "./demo-catalog";
import {
  exportNeedsLedger,
  prepareExport,
  type ExportData,
  type ExportRequest,
} from "./exports";
import type { CatalogState } from "./inventory-types";
import { sheetToCsv, workbookSheets } from "@/lib/export/document";

const TZ = "America/New_York";
const NOW = new Date("2026-10-27T16:00:00Z");
const ctx = { timeZone: TZ, now: NOW, slug: "the-monks" };

describe("prepareExport (demo catalog, fixed clock)", () => {
  let state: CatalogState;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    state = buildDemoCatalog();
  });
  afterEach(() => vi.useRealTimers());

  const data = (): ExportData => ({
    catalog: state,
    entries: state.ledger ?? [],
  });
  const run = (request: ExportRequest, format: "csv" | "xlsx" = "csv") =>
    prepareExport(request, data(), ctx, format);
  const cell = (out: ReturnType<typeof run>, header: string, row = 0) =>
    out.document.csv.rows[row][out.document.csv.header.indexOf(header)];
  const column = (out: ReturnType<typeof run>, header: string) =>
    out.document.csv.rows.map(
      (r) => r[out.document.csv.header.indexOf(header)],
    );

  it("only history and analytics need the ledger", () => {
    expect(exportNeedsLedger("inventory")).toBe(false);
    expect(exportNeedsLedger("recommendations")).toBe(false);
    expect(exportNeedsLedger("history")).toBe(true);
    expect(exportNeedsLedger("analytics")).toBe(true);
  });

  describe("inventory", () => {
    it("exports every active item, Critical first, with numbers as numbers", () => {
      const out = run({ kind: "inventory", filters: "" });
      expect(out.rowCount).toBe(4);
      expect(column(out, "Name")).toEqual([
        "Tito's Handmade Vodka",
        "Modelo Especial",
        "Casamigos Blanco",
        "House Rail Gin",
      ]);
      expect(cell(out, "On hand")).toBe(2);
      expect(cell(out, "Backup")).toBe(1);
      expect(cell(out, "Total")).toBe(3);
      expect(cell(out, "Status")).toBe("Critical");
      expect(cell(out, "Suggested order")).toBe(9);
      // No cutoff, so nothing to suggest.
      expect(column(out, "Suggested order").at(-1)).toBeNull();
    });

    it("a Critical item with no par says 'Order needed', never an invented number", () => {
      const tito = state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      state = {
        ...state,
        stock: state.stock.map((s) =>
          s.productId === tito.id ? { ...s, par: null } : s,
        ),
      };
      expect(
        cell(run({ kind: "inventory", filters: "" }), "Suggested order"),
      ).toBe("Order needed");
    });

    it("is named for the restaurant, the export and the local date", () => {
      expect(run({ kind: "inventory", filters: "" }).filename).toBe(
        "bar-inventory_the-monks_inventory_2026-10-27.csv",
      );
      expect(run({ kind: "inventory", filters: "" }, "xlsx").filename).toBe(
        "bar-inventory_the-monks_inventory_2026-10-27.xlsx",
      );
    });

    it("re-applies the filters it is given, never more or less (filtered export)", () => {
      const vendor = run({
        kind: "inventory",
        filters: "f.vendor=s%3ADel%20Papa",
      });
      expect(column(vendor, "Name")).toEqual(["Modelo Especial"]);
      expect(vendor.filename).toContain("inventory-filtered");

      const numeric = run({ kind: "inventory", filters: "f.total=n%3Alt%3A5" });
      expect(column(numeric, "Name")).toEqual([
        "Tito's Handmade Vodka",
        "Modelo Especial",
      ]);

      const both = run({
        kind: "inventory",
        filters: "f.vendor=s%3AFaust&f.total=n%3Alt%3A5&q=tito",
      });
      expect(both.rowCount).toBe(1);
    });

    it("honours the table's sort when one is sent", () => {
      const out = run({ kind: "inventory", filters: "sort=name%3Aasc" });
      expect(column(out, "Name")[0]).toBe("Casamigos Blanco");
    });

    it("ignores filters on columns it does not have instead of trusting them", () => {
      const out = run({
        kind: "inventory",
        filters: "f.secret=s%3Ax&f.status=bogus",
      });
      expect(out.rowCount).toBe(4);
      expect(out.filename).not.toContain("filtered");
    });

    it("leaves archived items out", () => {
      state = {
        ...state,
        products: state.products.map((p) =>
          p.name === "House Rail Gin" ? { ...p, active: false } : p,
        ),
      };
      expect(run({ kind: "inventory", filters: "" }).rowCount).toBe(3);
    });

    it("guards a formula in a product name in BOTH formats", () => {
      state = {
        ...state,
        products: state.products.map((p) =>
          p.name === "House Rail Gin"
            ? { ...p, name: "=cmd|' /C calc'!A0" }
            : p,
        ),
      };
      const out = run({ kind: "inventory", filters: "" });
      expect(sheetToCsv(out.document.csv)).toContain("'=cmd|' /C calc'!A0");
      const sheet = workbookSheets(out.document.sheets)[0];
      const names = sheet.data.slice(1).map((r) => r[1]);
      expect(names).toContain("'=cmd|' /C calc'!A0");
    });

    it("writes the time twice, ISO and local", () => {
      const out = run({ kind: "inventory", filters: "" });
      expect(String(cell(out, "Last updated (ISO)"))).toMatch(/^2026-10-27T/);
      expect(String(cell(out, "Last updated (local)"))).toContain("2026");
    });
  });

  describe("history", () => {
    it("lists ledger rows newest first with exact changes", () => {
      const out = run({ kind: "history", filters: "", days: 0 });
      const dates = column(out, "Date (ISO)") as string[];
      expect(dates).toEqual([...dates].sort().reverse());
      const tito = out.document.csv.rows.find(
        (r) =>
          r[out.document.csv.header.indexOf("Item")] ===
          "Tito's Handmade Vodka",
      )!;
      expect(
        typeof tito[out.document.csv.header.indexOf("Change on hand")],
      ).toBe("number");
    });

    it("applies the range, then the filters", () => {
      const all = run({ kind: "history", filters: "", days: 0 });
      const recent = run({ kind: "history", filters: "", days: 7 });
      expect(recent.rowCount).toBeLessThan(all.rowCount);
      expect(recent.rowCount).toBeGreaterThan(0);

      const usage = run({
        kind: "history",
        filters: "f.reason=s%3AUsage",
        days: 0,
      });
      expect(new Set(column(usage, "Reason"))).toEqual(new Set(["Usage"]));
      expect(usage.filename).toContain("history-filtered");

      const decreases = run({
        kind: "history",
        filters: "f.deltaOnHand=n%3Alt%3A0",
        days: 0,
      });
      expect(
        (column(decreases, "Change on hand") as number[]).every((n) => n < 0),
      ).toBe(true);
    });
  });

  describe("recommendations", () => {
    it("is one flat CSV table and a workbook of Summary plus one sheet per vendor", () => {
      const out = run({ kind: "recommendations", filters: "" }, "xlsx");
      expect(column(out, "Item")).toEqual([
        "Tito's Handmade Vodka",
        "Modelo Especial",
      ]);
      expect(out.document.sheets.map((s) => s.name)).toEqual([
        "Summary",
        "Faust",
        "Del Papa",
      ]);
      const summary = out.document.sheets[0];
      expect(summary.rows[0]).toEqual(["Faust", 1, 1, 0, 9, 0]);
    });

    it("the filtered workbook has only the vendors that remain", () => {
      const out = run({
        kind: "recommendations",
        filters: "f.vendor=s%3ADel%20Papa",
      });
      expect(out.document.sheets.map((s) => s.name)).toEqual([
        "Summary",
        "Del Papa",
      ]);
      expect(out.filename).toContain("order-recommendations-filtered");
    });
  });

  describe("analytics", () => {
    const analytics = (filters = "", over = {}): ExportRequest => ({
      kind: "analytics",
      filters,
      window: presetWindow(30, TZ, NOW),
      includeObserved: true,
      includeShrink: false,
      ...over,
    });

    it("exports the item table for the chosen period, fastest first", () => {
      const out = run(analytics());
      expect(column(out, "Item")).toEqual([
        "Modelo Especial",
        "Tito's Handmade Vodka",
        "Casamigos Blanco",
        "House Rail Gin",
      ]);
      expect(cell(out, "Average per day", 1)).toBe(0.4);
      expect(cell(out, "Average per week", 1)).toBe(2.8);
      // No false precision: a person-readable range, or the reason.
      expect(column(out, "Days to cutoff")).toEqual([
        "0–1 days",
        "At or below cutoff",
        "17–30 days",
        "No cutoff set",
      ]);
      expect(cell(out, "Period from")).toBe("2026-09-28");
      expect(cell(out, "Period to")).toBe("2026-10-27");
    });

    it("an item without enough history has no rate, only blanks", () => {
      expect(column(run(analytics()), "Average per day").at(-1)).toBeNull();
    });

    it("follows the observed-depletion toggle and the filters", () => {
      const off = run(analytics("", { includeObserved: false }));
      expect(column(off, "Depletion counted")[1]).toBe(7);
      const vendor = run(analytics("f.vendor=s%3ADel%20Papa"));
      expect(column(vendor, "Item")).toEqual(["Modelo Especial"]);
    });
  });
});
