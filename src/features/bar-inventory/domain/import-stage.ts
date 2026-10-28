import type {
  ChangeField,
  EntityResolution,
  ImportCatalog,
  ImportPlan,
  PlanRow,
} from "./import-plan";

/**
 * From the plan the manager reviewed to the JSON the database commits
 * (`inventory_import_stage`, shape documented in migration 20261027120000).
 * Pure: the server and demo mode build the identical staged plan.
 */

/** What the manager did in the Preview: rows left out, and rows they approved. */
export type ImportSelection = {
  /** Row numbers unticked (left out of the import). */
  excluded: readonly number[];
  /** Row numbers that need approval (matched by SKU although the name changed) and got it. */
  approved: readonly number[];
};

export const NO_SELECTION: ImportSelection = { excluded: [], approved: [] };

type Ref = { id: string } | { ref: string } | null;

export type StagedRow = {
  row: number;
  action: "create" | "update";
  product_id?: string;
  expected_stock_version?: number;
  expected_product_version?: number | null;
  set_product?: boolean;
  vendor?: Ref;
  category?: Ref;
  subcategory?: Ref;
  name?: string;
  size?: string | null;
  unit_type?: string;
  unit_label?: string | null;
  sku?: string | null;
  notes?: string | null;
  on_hand: number | null;
  backup: number | null;
  cutoff: number | null;
  warning: number | null;
  par: number | null;
};

export type StagedPlan = {
  summary: {
    rows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  vendors: { ref: string; name: string }[];
  categories: { ref: string; name: string }[];
  subcategories: { ref: string; name: string; category: Ref }[];
  rows: StagedRow[];
};

/** What a commit reports (the RPC's result, and the demo engine's). */
export type ImportCommitResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  vendors_created: number;
  categories_created: number;
  subcategories_created: number;
  ledger_rows: number;
  /** The batch was already committed: nothing was applied again. */
  already?: boolean;
};

/** A row that cannot be applied because the catalog moved since the preview. */
export type ImportConflict = {
  row: number;
  kind: "stock" | "product" | "archived" | "missing";
  current_version?: number;
  on_hand?: number;
  backup?: number;
};

const METADATA_FIELDS: readonly ChangeField[] = [
  "vendor",
  "name",
  "size",
  "unit",
  "sku",
  "category",
  "subcategory",
  "notes",
];

/** The rows an import would actually write, given the manager's choices. */
export function includedRows(
  plan: ImportPlan,
  selection: ImportSelection,
): PlanRow[] {
  const excluded = new Set(selection.excluded);
  const approved = new Set(selection.approved);
  return plan.rows.filter(
    (row) =>
      (row.action === "create" || row.action === "update") &&
      !excluded.has(row.rowNumber) &&
      (!row.needsApproval || approved.has(row.rowNumber)),
  );
}

function refOf(
  kind: "v" | "c" | "s",
  resolution: EntityResolution,
  scope = "",
): Ref {
  if (resolution.kind === "matched") return { id: resolution.id };
  if (resolution.kind === "new") {
    return { ref: `${kind}:${scope}${resolution.key}` };
  }
  return null;
}

/** The scope that keeps two categories' same-named subcategories apart. */
function categoryScope(category: EntityResolution): string {
  if (category.kind === "matched") return `${category.id}|`;
  if (category.kind === "new") return `c:${category.key}|`;
  return "";
}

export type StagedBuild = {
  staged: StagedPlan;
  /** A row in the selection still waits on a "Did you mean…?" choice. */
  unresolved: boolean;
};

export function toStagedPlan(
  plan: ImportPlan,
  selection: ImportSelection,
  catalog: ImportCatalog,
): StagedBuild {
  const rows = includedRows(plan, selection);
  const productById = new Map(catalog.products.map((p) => [p.id, p]));

  const vendors = new Map<string, { ref: string; name: string }>();
  const categories = new Map<string, { ref: string; name: string }>();
  const subcategories = new Map<
    string,
    { ref: string; name: string; category: Ref }
  >();
  let unresolved = false;

  const note = (resolution: EntityResolution) => {
    if (resolution.kind === "new" && resolution.needsChoice) unresolved = true;
  };

  const staged: StagedRow[] = rows.map((row): StagedRow => {
    note(row.vendor);
    note(row.category);
    note(row.subcategory);

    if (row.vendor.kind === "new") {
      const ref = (refOf("v", row.vendor) as { ref: string }).ref;
      if (!vendors.has(ref)) vendors.set(ref, { ref, name: row.vendor.name });
    }
    if (row.category.kind === "new") {
      const ref = (refOf("c", row.category) as { ref: string }).ref;
      if (!categories.has(ref)) {
        categories.set(ref, { ref, name: row.category.name });
      }
    }
    if (row.subcategory.kind === "new") {
      const scope = categoryScope(row.category);
      const ref = (refOf("s", row.subcategory, scope) as { ref: string }).ref;
      if (!subcategories.has(ref)) {
        subcategories.set(ref, {
          ref,
          name: row.subcategory.name,
          category: refOf("c", row.category),
        });
      }
    }

    const counts = {
      on_hand: row.values.onHand ?? null,
      backup: row.values.backup ?? null,
      cutoff: row.values.cutoff ?? null,
      warning: row.values.warning ?? null,
      par: row.values.par ?? null,
    };
    const subRef = refOf("s", row.subcategory, categoryScope(row.category));

    if (row.action === "create") {
      return {
        row: row.rowNumber,
        action: "create",
        vendor: refOf("v", row.vendor),
        category: refOf("c", row.category),
        subcategory: subRef,
        name: row.display.name,
        size: row.display.size,
        unit_type: row.unitType,
        unit_label: row.unitLabel,
        sku: row.sku,
        notes: row.notes,
        ...counts,
      };
    }

    const product = productById.get(row.productId ?? "");
    const changed = (field: ChangeField) =>
      row.changes.some((c) => c.field === field);
    const setProduct = row.changes.some((c) =>
      METADATA_FIELDS.includes(c.field),
    );
    const base: StagedRow = {
      row: row.rowNumber,
      action: "update",
      product_id: row.productId ?? undefined,
      expected_stock_version: row.expectedStockVersion ?? undefined,
      expected_product_version: row.expectedProductVersion,
      set_product: setProduct,
      ...counts,
    };
    if (!setProduct || !product) return base;

    // The product as it will be: the file's value where it changed, else today's.
    const categoryChanged = changed("category");
    return {
      ...base,
      vendor: changed("vendor")
        ? refOf("v", row.vendor)
        : { id: product.vendorId },
      name: changed("name") ? row.display.name : product.name,
      size: changed("size") ? row.display.size : product.size,
      unit_type: changed("unit") ? row.unitType : product.unitType,
      unit_label: changed("unit") ? row.unitLabel : product.unitLabel,
      sku: changed("sku") ? row.sku : product.sku,
      notes: changed("notes") ? row.notes : product.notes,
      category: categoryChanged
        ? refOf("c", row.category)
        : product.categoryId
          ? { id: product.categoryId }
          : null,
      // A subcategory belongs to one category: moving category clears it unless the file names one.
      subcategory: changed("subcategory")
        ? subRef
        : categoryChanged
          ? null
          : product.subcategoryId
            ? { id: product.subcategoryId }
            : null,
    };
  });

  const created = staged.filter((r) => r.action === "create").length;
  const updated = staged.length - created;
  return {
    unresolved,
    staged: {
      summary: {
        rows: plan.rows.length,
        created,
        updated,
        skipped:
          plan.rows.filter((r) => r.action !== "error").length - staged.length,
        errors: plan.rows.filter((r) => r.action === "error").length,
      },
      vendors: [...vendors.values()],
      categories: [...categories.values()],
      subcategories: [...subcategories.values()],
      rows: staged,
    },
  };
}

/**
 * A short fingerprint of a plan. The manager confirms the plan they saw; the
 * server re-plans from the same file against the catalog as it is NOW and
 * refuses if the fingerprint differs, so a commit never applies something the
 * person did not review. (Not a security boundary: the person is already
 * authorized; it is a "has the world moved" check.)
 */
export function fingerprintPlan(plan: ImportPlan): string {
  const text = JSON.stringify(plan);
  // cyrb53: a fast, well-distributed 53-bit hash.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}
