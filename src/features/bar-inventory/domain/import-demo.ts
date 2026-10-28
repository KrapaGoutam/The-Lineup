import type { CatalogCommand } from "./catalog-commands";
import { applyCatalogCommand, type CatalogContext } from "./catalog-engine";
import type {
  ImportCommitResult,
  ImportConflict,
  StagedPlan,
  StagedRow,
} from "./import-stage";
import type {
  CatalogState,
  ImportBatchView,
  ProductView,
} from "./inventory-types";
import type { AdjustmentReason } from "./stock-rules";

/**
 * The import commit for demo mode (no database): the same two passes as
 * `inventory_import_commit`. Pass 1 only looks and reports conflicts; pass 2
 * applies everything through the catalog engine, and any refusal discards the
 * whole attempt, so an import is applied completely or not at all.
 */

export type DemoImportCommit =
  | { ok: true; state: CatalogState; result: ImportCommitResult }
  | { ok: false; conflicts: ImportConflict[] }
  | { ok: false; error: string };

class Refused extends Error {}

type Ref = { id: string } | { ref: string } | null | undefined;

export function applyStagedPlanDemo(
  state: CatalogState,
  staged: StagedPlan,
  options: {
    ctx: CatalogContext;
    reason: Extract<AdjustmentReason, "stock_count" | "delivery_restock">;
    batch: {
      id: string;
      filename: string;
      format?: "csv" | "xlsx";
      sheet?: string | null;
    };
  },
): DemoImportCommit {
  const { ctx, reason, batch } = options;

  // ---- Pass 1: conflicts (nothing is changed).
  const conflicts: ImportConflict[] = [];
  for (const row of staged.rows) {
    if (row.action !== "update") continue;
    const product = state.products.find((p) => p.id === row.product_id);
    if (!product) {
      conflicts.push({ row: row.row, kind: "missing" });
      continue;
    }
    if (!product.active) {
      conflicts.push({ row: row.row, kind: "archived" });
      continue;
    }
    if (row.set_product && product.version !== row.expected_product_version) {
      conflicts.push({
        row: row.row,
        kind: "product",
        current_version: product.version,
      });
      continue;
    }
    const stock = state.stock.find((s) => s.productId === product.id);
    if (stock && stock.version !== row.expected_stock_version) {
      conflicts.push({
        row: row.row,
        kind: "stock",
        current_version: stock.version,
        on_hand: stock.onHand,
        backup: stock.backup,
      });
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts };

  // ---- Pass 2: apply to a working copy; only a full success is returned.
  let working = state;
  const run = (command: CatalogCommand) => {
    const result = applyCatalogCommand(working, command, ctx);
    if (!result.ok) throw new Refused(result.error);
    working = result.state;
  };
  const made = {
    vendors: new Map<string, string>(),
    categories: new Map<string, string>(),
    subcategories: new Map<string, string>(),
  };
  const resolve = (ref: Ref, map: Map<string, string>): string | null => {
    if (!ref) return null;
    if ("id" in ref) return ref.id;
    const id = map.get(ref.ref);
    if (!id)
      throw new Refused(
        "The import plan refers to something it does not create.",
      );
    return id;
  };

  try {
    for (const entity of staged.vendors) {
      const before = new Set(working.vendors.map((v) => v.id));
      run({ type: "vendorCreate", name: entity.name, notes: null });
      made.vendors.set(
        entity.ref,
        working.vendors.find((v) => !before.has(v.id))!.id,
      );
    }
    for (const entity of staged.categories) {
      const before = new Set(working.categories.map((c) => c.id));
      run({ type: "categoryCreate", name: entity.name });
      made.categories.set(
        entity.ref,
        working.categories.find((c) => !before.has(c.id))!.id,
      );
    }
    for (const entity of staged.subcategories) {
      const before = new Set(working.subcategories.map((s) => s.id));
      run({
        type: "subcategoryCreate",
        categoryId: resolve(entity.category, made.categories)!,
        name: entity.name,
      });
      made.subcategories.set(
        entity.ref,
        working.subcategories.find((s) => !before.has(s.id))!.id,
      );
    }

    const ledgerBefore = (working.ledger ?? []).length;
    let created = 0;
    let updated = 0;

    for (const row of staged.rows) {
      const input = (r: StagedRow) => ({
        vendorId: resolve(r.vendor, made.vendors)!,
        name: r.name ?? "",
        categoryId: resolve(r.category, made.categories),
        subcategoryId: resolve(r.subcategory, made.subcategories),
        size: r.size ?? null,
        unitType: (r.unit_type ?? "bottle") as ProductView["unitType"],
        unitLabel: r.unit_label ?? null,
        sku: r.sku ?? null,
        notes: r.notes ?? null,
      });

      let productId: string;
      if (row.action === "create") {
        const before = new Set(working.products.map((p) => p.id));
        run({ type: "productCreate", input: input(row) });
        productId = working.products.find((p) => !before.has(p.id))!.id;
        created += 1;
      } else {
        productId = row.product_id!;
        if (row.set_product) {
          run({
            type: "productUpdate",
            id: productId,
            input: input(row),
            expectedVersion: row.expected_product_version!,
          });
        }
        updated += 1;
      }

      let stock = working.stock.find((s) => s.productId === productId)!;
      if (row.cutoff !== null || row.warning !== null || row.par !== null) {
        run({
          type: "stockSetLevels",
          productId,
          cutoff: row.cutoff ?? stock.cutoff,
          warning: row.warning ?? stock.warning,
          par: row.par ?? stock.par,
          expectedVersion: stock.version,
        });
        stock = working.stock.find((s) => s.productId === productId)!;
      }
      if (row.on_hand !== null || row.backup !== null) {
        run({
          type: "stockAdjust",
          productId,
          mode: "set",
          onHand: row.on_hand,
          backup: row.backup,
          reason,
          note: null,
          expectedVersion: stock.version,
        });
      }
    }

    // The ledger rows this import wrote are bulk_import rows carrying the batch.
    const ledger = (working.ledger ?? []).map((entry, index) =>
      index >= ledgerBefore
        ? { ...entry, source: "bulk_import" as const, importBatchId: batch.id }
        : entry,
    );
    const ledgerRows = ledger.length - ledgerBefore;

    const result: ImportCommitResult = {
      created,
      updated,
      skipped: staged.summary.skipped,
      errors: staged.summary.errors,
      vendors_created: made.vendors.size,
      categories_created: made.categories.size,
      subcategories_created: made.subcategories.size,
      ledger_rows: ledgerRows,
    };
    const record: ImportBatchView = {
      id: batch.id,
      filename: batch.filename,
      format: batch.format ?? "csv",
      sheet: batch.sheet ?? null,
      reason,
      status: "committed",
      rowsInFile: staged.summary.rows,
      created,
      updated,
      skipped: result.skipped,
      errors: result.errors,
      vendorsCreated: result.vendors_created,
      categoriesCreated: result.categories_created,
      subcategoriesCreated: result.subcategories_created,
      actorName: ctx.actorName,
      createdAt: ctx.now.toISOString(),
      committedAt: ctx.now.toISOString(),
    };
    return {
      ok: true,
      state: {
        ...working,
        ledger,
        importBatches: [record, ...(working.importBatches ?? [])],
      },
      result,
    };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}
