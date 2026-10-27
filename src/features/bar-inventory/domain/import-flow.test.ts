import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "./demo-catalog";
import { applyStagedPlanDemo } from "./import-demo";
import { planImport, prepareCommit, type ImportRequest } from "./import-run";
import {
  fingerprintPlan,
  includedRows,
  NO_SELECTION,
  toStagedPlan,
} from "./import-stage";
import type { CatalogState } from "./inventory-types";

const NOW = new Date("2026-10-27T16:00:00Z");

const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";

/** A file: the template header and one line per row of `Vendor|Name|...` cells. */
const file = (...rows: string[]) => [HEADER, ...rows].join("\n");

const request = (
  csv: string,
  over: Partial<ImportRequest> = {},
): ImportRequest => ({
  csv,
  reason: "stock_count",
  mapping: {},
  choices: {},
  ...over,
});

const ctx = () => {
  let n = 0;
  return {
    actorName: "Maya Singh",
    now: NOW,
    newId: () => `imp-${String(++n).padStart(4, "0")}`,
  };
};

describe("import flow on the demo catalog", () => {
  let state: CatalogState;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    state = buildDemoCatalog();
  });
  afterEach(() => vi.useRealTimers());

  const stockOf = (name: string) => {
    const product = state.products.find((p) => p.name === name)!;
    return state.stock.find((s) => s.productId === product.id)!;
  };
  const plan = (csv: string, over?: Partial<ImportRequest>) => {
    const result = planImport(request(csv, over), state);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  describe("planImport", () => {
    it("reads a file into a plan with a fingerprint", () => {
      const r = plan(file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,1,,,,"));
      expect(r.plan.rows[0]).toMatchObject({ action: "update", rowNumber: 2 });
      expect(r.fingerprint).toMatch(/^[0-9a-f]{14}$/);
    });

    it("is the same plan, and the same fingerprint, for the same inputs", () => {
      const csv = file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,1,,,,");
      expect(plan(csv).fingerprint).toBe(plan(csv).fingerprint);
    });

    it("a different file or a different catalog is a different fingerprint", () => {
      const a = plan(file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,1,,,,"));
      const b = plan(file("Faust,Tito's Handmade Vodka,,,750 mL,,,5,1,,,,"));
      expect(a.fingerprint).not.toBe(b.fingerprint);
    });

    it("explains a file it cannot read, in plain words", () => {
      expect(planImport(request(""), state)).toMatchObject({ ok: false });
      expect(planImport(request('a,b\n"open'), state)).toMatchObject({
        ok: false,
        error: expect.stringContaining("never closed"),
      });
      expect(planImport(request(HEADER), state)).toMatchObject({
        ok: false,
        error: "The file has a header but no rows.",
      });
    });

    it("names the missing required columns and still offers the mapping", () => {
      const r = planImport(request("Vendor,Name,Qty\nFaust,Gin,1"), state);
      expect(r).toMatchObject({
        ok: false,
        error: expect.stringContaining("Backup, Cutoff Limit"),
      });
      if (!r.ok)
        expect(r.header?.mapping).toEqual(["vendor", "name", "onHand"]);
    });

    it("the manager's mapping can supply a column the file names differently", () => {
      const r = planImport(
        request("Vendor,Name,How many,Spare,Floor\nFaust,Gin,6,1,2", {
          mapping: { 2: "onHand", 3: "backup", 4: "cutoff" },
        }),
        state,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.plan.rows[0].values).toEqual({
          onHand: 6,
          backup: 1,
          cutoff: 2,
        });
      }
    });
  });

  describe("toStagedPlan", () => {
    const stage = (csv: string, selection = NO_SELECTION) => {
      const r = plan(csv);
      return toStagedPlan(r.plan, selection, state);
    };

    it("an update that only changes counts carries just the counts and the versions", () => {
      const { staged } = stage(
        file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,"),
      );
      const tito = state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      expect(staged.rows[0]).toEqual({
        row: 2,
        action: "update",
        product_id: tito.id,
        expected_stock_version: stockOf("Tito's Handmade Vodka").version,
        expected_product_version: tito.version,
        set_product: false,
        on_hand: 4,
        backup: null,
        cutoff: null,
        warning: null,
        par: null,
      });
    });

    it("a create names its entities by ref, and new ones are listed once", () => {
      const { staged } = stage(
        file(
          "New Dist,Malbec,Wine,Red,750 mL,,M-1,6,2,3,,10,Bold",
          "new  dist,Merlot,Wine,Red,750 mL,,,1,,,,,",
        ),
      );
      expect(staged.vendors).toEqual([{ ref: "v:newdist", name: "New Dist" }]);
      expect(staged.categories).toEqual([{ ref: "c:wine", name: "Wine" }]);
      expect(staged.subcategories).toEqual([
        { ref: "s:c:wine|red", name: "Red", category: { ref: "c:wine" } },
      ]);
      expect(staged.rows[0]).toMatchObject({
        action: "create",
        vendor: { ref: "v:newdist" },
        category: { ref: "c:wine" },
        subcategory: { ref: "s:c:wine|red" },
        name: "Malbec",
        sku: "M-1",
        notes: "Bold",
        on_hand: 6,
        backup: 2,
        cutoff: 3,
        par: 10,
      });
    });

    it("existing entities are referenced by id, not recreated", () => {
      const { staged } = stage(
        file("Faust,House Gin,Spirits,Vodka,1 L,,,1,,,,,"),
      );
      expect(staged.vendors).toEqual([]);
      expect(staged.categories).toEqual([]);
      expect(staged.rows[0].vendor).toEqual({
        id: state.vendors.find((v) => v.name === "Faust")!.id,
      });
    });

    it("same-named subcategories under different new categories stay apart", () => {
      const { staged } = stage(
        file(
          "Faust,Wine A,Wine,Red,,,,1,,,,,",
          "Faust,Beer A,Lager,Red,,,,1,,,,,",
        ),
      );
      expect(staged.subcategories.map((s) => s.ref).sort()).toEqual([
        "s:c:lager|red",
        "s:c:wine|red",
      ]);
    });

    it("leaves out unticked rows, and the entities only they needed", () => {
      const csv = file(
        "Ghost Co,Rum,,,1 L,,,1,,,,,",
        "Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,",
      );
      const { staged } = stage(csv, { excluded: [2], approved: [] });
      expect(staged.rows.map((r) => r.row)).toEqual([3]);
      expect(staged.vendors).toEqual([]);
      expect(staged.summary).toMatchObject({
        created: 0,
        updated: 1,
        skipped: 1,
      });
    });

    it("a row matched by SKU under a new name waits for approval, then carries the whole product", () => {
      const tito = state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      // Give it a SKU so a renamed row can find it.
      state = {
        ...state,
        products: state.products.map((p) =>
          p.id === tito.id ? { ...p, sku: "TITOS-1" } : p,
        ),
      };
      const csv = file("Faust,Tito's Vodka,,,750 mL,,TITOS-1,5,,,,,");
      expect(stage(csv).staged.rows).toEqual([]);
      const { staged } = stage(csv, { excluded: [], approved: [2] });
      expect(staged.rows[0]).toMatchObject({
        action: "update",
        set_product: true,
        name: "Tito's Vodka",
        size: "750 mL",
        sku: "TITOS-1",
        vendor: { id: tito.vendorId },
        expected_product_version: tito.version,
      });
      expect(
        includedRows(plan(csv).plan, { excluded: [], approved: [2] }),
      ).toHaveLength(1);
    });

    it("moving a product's category clears its subcategory unless the file names one", () => {
      const tito = state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      const { staged } = stage(
        file(
          `Faust,Tito's Handmade Vodka,Beer,,750 mL,,${tito.sku ?? ""},,,,,,`,
        ),
      );
      expect(staged.rows[0]).toMatchObject({
        set_product: true,
        subcategory: null,
      });
    });

    it("flags a name that still needs a 'Did you mean' choice", () => {
      const csv = file("Fuast,Gin,,,1 L,,,1,,,,,");
      expect(stage(csv).unresolved).toBe(true);
      const chosen = plan(csv, {
        choices: {
          vendors: { fuast: state.vendors.find((v) => v.name === "Faust")!.id },
        },
      });
      expect(toStagedPlan(chosen.plan, NO_SELECTION, state).unresolved).toBe(
        false,
      );
    });

    it("an unresolved name in a row that is left out does not block", () => {
      const csv = file(
        "Fuast,Gin,,,1 L,,,1,,,,,",
        "Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,",
      );
      expect(stage(csv, { excluded: [2], approved: [] }).unresolved).toBe(
        false,
      );
    });
  });

  describe("prepareCommit", () => {
    const csv = file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,");

    it("builds the staged plan when it is still the plan that was reviewed", () => {
      const reviewed = plan(csv).fingerprint;
      const prep = prepareCommit(request(csv), NO_SELECTION, reviewed, state);
      expect(prep.ok).toBe(true);
      if (prep.ok) expect(prep.staged.rows).toHaveLength(1);
    });

    it("refuses when the catalog moved since the preview", () => {
      const reviewed = plan(csv).fingerprint;
      const moved = {
        ...state,
        stock: state.stock.map((s) => ({ ...s, version: s.version + 1 })),
      };
      expect(
        prepareCommit(request(csv), NO_SELECTION, reviewed, moved),
      ).toMatchObject({
        ok: false,
        kind: "changed",
      });
    });

    it("refuses a different file than the one reviewed", () => {
      const reviewed = plan(csv).fingerprint;
      const other = file("Faust,Tito's Handmade Vodka,,,750 mL,,,9,,,,,");
      expect(
        prepareCommit(request(other), NO_SELECTION, reviewed, state),
      ).toMatchObject({
        ok: false,
        kind: "changed",
      });
    });

    it("refuses an empty selection and an unresolved name", () => {
      const reviewed = plan(csv).fingerprint;
      expect(
        prepareCommit(
          request(csv),
          { excluded: [2], approved: [] },
          reviewed,
          state,
        ),
      ).toMatchObject({
        ok: false,
        kind: "invalid",
        error: "There is nothing selected to import.",
      });

      const near = file("Fuast,Gin,,,1 L,,,1,,,,,");
      expect(
        prepareCommit(
          request(near),
          NO_SELECTION,
          plan(near).fingerprint,
          state,
        ),
      ).toMatchObject({ ok: false, kind: "invalid" });
    });

    it("a file that stops being readable is invalid, not a crash", () => {
      expect(
        prepareCommit(request(""), NO_SELECTION, "x", state),
      ).toMatchObject({
        ok: false,
        kind: "invalid",
      });
    });
  });

  describe("applyStagedPlanDemo", () => {
    const commit = (csv: string, selection = NO_SELECTION, base = state) => {
      const prep = prepareCommit(
        request(csv),
        selection,
        plan(csv).fingerprint,
        base,
      );
      if (!prep.ok) throw new Error(prep.error);
      return applyStagedPlanDemo(base, prep.staged, {
        ctx: ctx(),
        reason: "stock_count",
        batch: { id: "batch-1", filename: "stock.csv" },
      });
    };

    it("applies creates and updates, with bulk_import ledger rows carrying the batch", () => {
      const out = commit(
        file(
          "New Dist,Malbec,Wine,Red,750 mL,,M-1,6,2,3,,10,Bold",
          "Faust,Tito's Handmade Vodka,,,750 mL,,,9,,,,,",
        ),
      );
      expect(out.ok).toBe(true);
      if (!out.ok || !("result" in out)) return;
      expect(out.result).toMatchObject({
        created: 1,
        updated: 1,
        vendors_created: 1,
        categories_created: 1,
        subcategories_created: 1,
        ledger_rows: 2,
      });
      const next = out.state;
      const malbec = next.products.find((p) => p.name === "Malbec")!;
      expect(malbec).toMatchObject({ sku: "M-1", notes: "Bold" });
      expect(next.vendors.find((v) => v.id === malbec.vendorId)?.name).toBe(
        "New Dist",
      );
      const stock = next.stock.find((s) => s.productId === malbec.id)!;
      expect([stock.onHand, stock.backup, stock.cutoff, stock.par]).toEqual([
        6, 2, 3, 10,
      ]);

      const mine = (next.ledger ?? []).filter(
        (e) => e.importBatchId === "batch-1",
      );
      expect(mine).toHaveLength(2);
      expect(
        mine.every(
          (e) => e.source === "bulk_import" && e.reason === "stock_count",
        ),
      ).toBe(true);
    });

    it("blank = unchanged: an update leaves the other counts and levels as they were", () => {
      const before = stockOf("Tito's Handmade Vodka");
      const out = commit(file("Faust,Tito's Handmade Vodka,,,750 mL,,,9,,,,,"));
      if (!out.ok || !("result" in out)) throw new Error("expected success");
      const tito = out.state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      const after = out.state.stock.find((s) => s.productId === tito.id)!;
      expect(after).toMatchObject({
        onHand: 9,
        backup: before.backup,
        cutoff: before.cutoff,
        warning: before.warning,
        par: before.par,
      });
    });

    it("0 = zero is applied", () => {
      const out = commit(file("Faust,Tito's Handmade Vodka,,,750 mL,,,,0,,,,"));
      if (!out.ok || !("result" in out)) throw new Error("expected success");
      const tito = out.state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      expect(out.state.stock.find((s) => s.productId === tito.id)!.backup).toBe(
        0,
      );
    });

    it("records the batch for the history", () => {
      const out = commit(file("Faust,Tito's Handmade Vodka,,,750 mL,,,9,,,,,"));
      if (!out.ok || !("result" in out)) throw new Error("expected success");
      expect(out.state.importBatches).toEqual([
        expect.objectContaining({
          id: "batch-1",
          filename: "stock.csv",
          status: "committed",
          updated: 1,
          actorName: "Maya Singh",
        }),
      ]);
    });

    it("a count that changed after the preview is a conflict: nothing is applied", () => {
      const csv = file(
        "Ghost Co,Rum,,,1 L,,,1,,,,,",
        "Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,",
      );
      const prep = prepareCommit(
        request(csv),
        NO_SELECTION,
        plan(csv).fingerprint,
        state,
      );
      if (!prep.ok) throw new Error(prep.error);
      const tito = state.products.find(
        (p) => p.name === "Tito's Handmade Vodka",
      )!;
      const moved: CatalogState = {
        ...state,
        stock: state.stock.map((s) =>
          s.productId === tito.id
            ? { ...s, version: s.version + 1, onHand: 12 }
            : s,
        ),
      };
      const out = applyStagedPlanDemo(moved, prep.staged, {
        ctx: ctx(),
        reason: "stock_count",
        batch: { id: "b", filename: "f.csv" },
      });
      expect(out).toMatchObject({
        ok: false,
        conflicts: [{ row: 3, kind: "stock", on_hand: 12 }],
      });
    });

    it("an archived target is a conflict too", () => {
      const csv = file("Faust,Tito's Handmade Vodka,,,750 mL,,,4,,,,,");
      const prep = prepareCommit(
        request(csv),
        NO_SELECTION,
        plan(csv).fingerprint,
        state,
      );
      if (!prep.ok) throw new Error(prep.error);
      const archived: CatalogState = {
        ...state,
        products: state.products.map((p) =>
          p.name === "Tito's Handmade Vodka" ? { ...p, active: false } : p,
        ),
      };
      expect(
        applyStagedPlanDemo(archived, prep.staged, {
          ctx: ctx(),
          reason: "stock_count",
          batch: { id: "b", filename: "f.csv" },
        }),
      ).toMatchObject({ ok: false, conflicts: [{ row: 2, kind: "archived" }] });
    });

    it("a refusal part-way discards everything (all or nothing)", () => {
      const csv = file(
        "Rollback Co,Fresh Rum,,,1 L,,,7,,,,,",
        "Faust,Another Gin,,,1 L,,,1,,,,,",
      );
      const prep = prepareCommit(
        request(csv),
        NO_SELECTION,
        plan(csv).fingerprint,
        state,
      );
      if (!prep.ok) throw new Error(prep.error);
      // Row 2 becomes a product that already exists: the engine refuses it
      // AFTER the new vendor and the first product were written.
      const staged = {
        ...prep.staged,
        rows: prep.staged.rows.map((r, i) =>
          i === 1 ? { ...r, name: "Casamigos Blanco", size: "750 mL" } : r,
        ),
      };
      const out = applyStagedPlanDemo(state, staged, {
        ctx: ctx(),
        reason: "stock_count",
        batch: { id: "b", filename: "f.csv" },
      });
      expect(out).toMatchObject({
        ok: false,
        error: expect.stringContaining("already"),
      });
      // No state comes back, so the caller keeps the catalog it had.
      expect("state" in out).toBe(false);
      expect(state.vendors.some((v) => v.name === "Rollback Co")).toBe(false);
      expect(state.products.some((p) => p.name === "Fresh Rum")).toBe(false);
    });

    it("a plan that names something it does not create is refused", () => {
      const prep = prepareCommit(
        request(file("New Dist,Malbec,,,750 mL,,,1,,,,,")),
        NO_SELECTION,
        plan(file("New Dist,Malbec,,,750 mL,,,1,,,,,")).fingerprint,
        state,
      );
      if (!prep.ok) throw new Error(prep.error);
      const forged = { ...prep.staged, vendors: [] };
      expect(
        applyStagedPlanDemo(state, forged, {
          ctx: ctx(),
          reason: "stock_count",
          batch: { id: "b", filename: "f.csv" },
        }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("does not create"),
      });
    });
  });
});

describe("fingerprintPlan", () => {
  it("is a stable 14-digit hex string", () => {
    const empty = {
      reason: "stock_count" as const,
      rows: [],
      summary: {
        create: 0,
        update: 0,
        skip: 0,
        error: 0,
        newVendors: 0,
        newCategories: 0,
        newSubcategories: 0,
        needsApproval: 0,
      },
      newVendors: [],
      newCategories: [],
      newSubcategories: [],
      nearMisses: [],
      canCommit: false,
    };
    expect(fingerprintPlan(empty)).toMatch(/^[0-9a-f]{14}$/);
    expect(fingerprintPlan(empty)).toBe(fingerprintPlan({ ...empty }));
    expect(fingerprintPlan(empty)).not.toBe(
      fingerprintPlan({ ...empty, reason: "delivery_restock" }),
    );
  });
});
