import { describe, expect, it } from "vitest";
import { buildDemoCatalog } from "./demo-catalog";
import {
  buildInventoryRows,
  INVENTORY_COLUMNS,
  dateCellText,
  dateAlertLabel,
} from "./inventory-rows";
import { prepareExport } from "./exports";
import {
  parseInventoryDate,
  type DateLot,
  type FreshnessRule,
} from "./freshness";
import { serializeTableState } from "./table-filters";
import { sheetToCsv } from "@/lib/export/document";
const ctx = {
  now: new Date("2026-10-28T18:00:00Z"),
  timeZone: "America/Chicago",
  slug: "synthetic",
};
function seed() {
  const state = buildDemoCatalog();
  const product = state.products.find((p) => p.name.startsWith("Tito"))!;
  const lot = (
    id: string,
    expiration: string,
    quantity: number | null,
  ): DateLot => ({
    id,
    productId: product.id,
    manufacture: parseInventoryDate("01/26", "manufacture"),
    expiration: parseInventoryDate(expiration, "expiration"),
    quantity,
    active: true,
    version: 1,
    notes: "=SUM(A1)",
    updatedAt: ctx.now.toISOString(),
    updatedByName: "Manager",
  });
  state.dateLots = [lot("later", "12/26", 5), lot("urgent", "10/29/26", 1)];
  return { state, product, lot };
}
describe("freshness integration", () => {
  it("summarizes operational dates without changing stock status or totals", () => {
    const { state, product } = seed();
    const row = buildInventoryRows(state, "2026-10-28").find(
      (r) => r.productId === product.id,
    )!;
    expect(row).toMatchObject({
      status: "critical",
      onHand: 2,
      backup: 1,
      total: 3,
    });
    expect(dateCellText(row, "expiration")).toBe("10/29/26 +1");
    expect(dateAlertLabel(row)).toBe("Urgent");
    expect(row.dateInfo?.excess).toBe(3);
  });
  it("archived groups and products do not contribute alerts", () => {
    const { state, product } = seed();
    state.dateLots![1].active = false;
    let row = buildInventoryRows(state, "2026-10-28").find(
      (r) => r.productId === product.id,
    )!;
    expect(dateAlertLabel(row)).toBe("Normal");
    product.active = false;
    row = buildInventoryRows(state, "2026-10-28").find(
      (r) => r.productId === product.id,
    )!;
    expect(row.dateInfo?.lots).toEqual([]);
    expect(row.status).toBe("archived");
  });
  it("shows no-manufacture-date only when tracking is configured", () => {
    const { state, product } = seed();
    state.dateLots = [];
    const rule: FreshnessRule = {
      id: "r",
      subcategoryId: product.subcategoryId!,
      trackingEnabled: true,
      maximumMonths: 9,
      warningMonths: 1,
      active: true,
      version: 1,
      updatedAt: "",
      updatedByName: null,
    };
    state.freshnessRules = [rule];
    const column = INVENTORY_COLUMNS.find((c) => c.id === "freshness")!;
    expect(column.get(buildInventoryRows(state, "2026-10-28")[0])).toBe(
      "No Manufacture Date",
    );
    rule.active = false;
    expect(column.get(buildInventoryRows(state, "2026-10-28")[0])).toBe(
      "Not tracked",
    );
  });
  it("filtered inventory and date exports use the same date predicates", () => {
    const { state, product } = seed();
    const filters = serializeTableState({
      search: "",
      sort: [],
      filters: {
        expirationDays: { type: "number", op: "between", value: 0, to: 7 },
      },
    }).toString();
    const data = { catalog: state, entries: state.ledger ?? [] };
    const inventory = prepareExport(
      { kind: "inventory", filters },
      data,
      ctx,
      "csv",
    );
    expect(inventory.rowCount).toBe(1);
    expect(inventory.document.csv.rows[0][1]).toBe(product.name);
    const dates = prepareExport(
      { kind: "date_groups", filters },
      data,
      ctx,
      "csv",
    );
    expect(dates.rowCount).toBe(2);
    expect(dates.document.csv.rows.map((r) => r[8])).toContain("12/26");
    expect(dates.document.csv.rows.map((r) => r[9])).toContain("month");
    expect(sheetToCsv(dates.document.csv)).toContain("'=SUM(A1)");
  });
});
