import type { CsvRecord } from "@/lib/csv/read";

import type { HeaderMapping, ImportField } from "./import-columns";
import {
  UNIT_LABEL_MAX,
  UNIT_TYPES,
  UNIT_TYPE_LABELS,
  unitDisplay,
  type CatalogState,
  type ProductView,
  type StockView,
  type UnitType,
} from "./inventory-types";
import { cleanText, nameKey, productIdentityKey, skuKey } from "./keys";
import {
  evaluateStock,
  fromCents,
  STATUS_LABEL,
  toCents,
  type AdjustmentReason,
} from "./stock-rules";

/**
 * The import plan: what a file WOULD do, row by row, computed from the file
 * and the current catalog alone. Pure. Nothing here writes anything; the plan
 * is what the manager reviews, and (BI-8c) the exact thing that is committed.
 *
 * Locked rules (D2, D4, D5): blank = leave unchanged, `0` = zero; vendors,
 * categories and subcategories are matched or PROPOSED, never created before
 * confirmation; a product is matched by SKU, else by vendor + name + size +
 * unit, never by name alone.
 */

export type ImportAction = "create" | "update" | "skip" | "error";

export type ImportCatalog = Pick<
  CatalogState,
  "vendors" | "categories" | "subcategories" | "products" | "stock"
>;

/** The manager's answer to "Did you mean X?": an existing entity's id, or "new". */
export type ImportChoices = {
  vendors?: Readonly<Record<string, string>>;
  categories?: Readonly<Record<string, string>>;
  /** Keyed `<category id or new:key>|<subcategory key>`. */
  subcategories?: Readonly<Record<string, string>>;
};

export type ImportOptions = {
  /** Why the counts changed (written to the ledger by the commit); default Stock Count. */
  reason: Extract<AdjustmentReason, "stock_count" | "delivery_restock">;
  choices?: ImportChoices;
};

export type EntityResolution =
  | { kind: "none" }
  | { kind: "matched"; id: string; name: string }
  | {
      kind: "new";
      /** First-seen trimmed spelling of the file. */
      name: string;
      key: string;
      /** An existing entity with a very similar name ("Did you mean …?"). */
      similarTo?: { id: string; name: string };
      /** Similar to an existing one and the manager has not chosen yet. */
      needsChoice: boolean;
    };

export type ChangeField =
  | "vendor"
  | "name"
  | "size"
  | "unit"
  | "sku"
  | "category"
  | "subcategory"
  | "notes"
  | "onHand"
  | "backup"
  | "cutoff"
  | "warning"
  | "par";

export type FieldChange = {
  field: ChangeField;
  label: string;
  current: number | string | null;
  imported: number | string | null;
  /** imported − current, for numbers. */
  delta: number | null;
};

export type PlanRow = {
  rowNumber: number;
  action: ImportAction;
  /** Why a row is an error or a skip. */
  reason: string | null;
  warnings: string[];
  /** Matched by SKU although the name / size / unit / vendor differ: the manager must tick it. */
  needsApproval: boolean;
  matchedBy: "sku" | "identity" | null;
  productId: string | null;
  /** The stock row's version when planned, for conflict detection at commit. */
  expectedStockVersion: number | null;
  /** The product's version when planned, for the metadata conflict check at commit. */
  expectedProductVersion: number | null;
  display: { vendor: string; name: string; size: string | null; unit: string };
  vendor: EntityResolution;
  category: EntityResolution;
  subcategory: EntityResolution;
  unitType: UnitType;
  unitLabel: string | null;
  /** The unit was blank, so Bottle was assumed (shown as an assumed value). */
  unitAssumed: boolean;
  sku: string | null;
  notes: string | null;
  /** Imported counts and levels: `undefined` = blank = leave unchanged. */
  values: Partial<
    Record<"onHand" | "backup" | "cutoff" | "warning" | "par", number>
  >;
  changes: FieldChange[];
  statusBefore: string | null;
  statusAfter: string | null;
};

export type NewEntity = { key: string; name: string; rows: number[] };
export type NewSubcategory = NewEntity & { categoryName: string };

export type NearMiss = {
  entity: "vendor" | "category" | "subcategory";
  /** The key to answer in `choices`. */
  key: string;
  name: string;
  similarTo: { id: string; name: string };
  rows: number[];
};

export type ImportPlan = {
  reason: ImportOptions["reason"];
  rows: PlanRow[];
  summary: {
    create: number;
    update: number;
    skip: number;
    error: number;
    newVendors: number;
    newCategories: number;
    newSubcategories: number;
    needsApproval: number;
  };
  newVendors: NewEntity[];
  newCategories: NewEntity[];
  newSubcategories: NewSubcategory[];
  /** Spellings close to an existing name that still need an explicit choice. */
  nearMisses: NearMiss[];
  /** Something would be written and nothing is waiting on a choice. */
  canCommit: boolean;
};

// ---------------------------------------------------------------------
// Parsing single values
// ---------------------------------------------------------------------

const MAX_FIELD = 200;
const MAX_NOTES = 500;
const MAX_QUANTITY_CENTS = 999_999_999_999;

export type NumberParse =
  | { kind: "blank" }
  | { kind: "ok"; value: number }
  | { kind: "error"; message: string };

/**
 * A count or level. Blank is its own result (it means "unchanged"). Thousand
 * separators and decimal commas are refused rather than guessed.
 */
export function parseImportNumber(text: string): NumberParse {
  const value = text.trim();
  if (value === "") return { kind: "blank" };
  if (/^-/.test(value)) {
    return { kind: "error", message: "Counts and levels cannot be negative." };
  }
  if (/[,\s]/.test(value)) {
    return {
      kind: "error",
      message:
        "Use a plain number with a period for decimals (no thousand separators or decimal commas).",
    };
  }
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(value)) {
    return { kind: "error", message: `“${value}” is not a number.` };
  }
  if ((value.split(".")[1] ?? "").length > 2) {
    return { kind: "error", message: "Use at most two decimal places." };
  }
  const cents = Math.round(Number(value) * 100);
  if (cents > MAX_QUANTITY_CENTS) {
    return { kind: "error", message: "That number is too large." };
  }
  return { kind: "ok", value: fromCents(cents) };
}

const UNIT_BY_KEY = new Map<string, UnitType>(
  UNIT_TYPES.filter((type) => type !== "other").flatMap((type) => [
    [nameKey(type)!, type] as const,
    [nameKey(UNIT_TYPE_LABELS[type])!, type] as const,
  ]),
);

export type UnitParse =
  | { ok: true; unitType: UnitType; unitLabel: string | null; assumed: boolean }
  | { ok: false; message: string };

/** A known unit (singular or plural), blank (Bottle, assumed), or a custom "Other" label. */
export function parseImportUnit(text: string): UnitParse {
  const value = cleanText(text);
  if (value === "") {
    return { ok: true, unitType: "bottle", unitLabel: null, assumed: true };
  }
  const key = nameKey(value) ?? "";
  const known = UNIT_BY_KEY.get(key) ?? UNIT_BY_KEY.get(key.replace(/s$/, ""));
  if (known)
    return { ok: true, unitType: known, unitLabel: null, assumed: false };
  if (value.length > UNIT_LABEL_MAX) {
    return {
      ok: false,
      message: `Unit is longer than ${UNIT_LABEL_MAX} characters.`,
    };
  }
  return { ok: true, unitType: "other", unitLabel: value, assumed: false };
}

/** Levenshtein distance, bounded: returns max+1 once it is certain to exceed it. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, row[j]);
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Near-miss limit: 2 edits for longer names, 1 for short ones, none for tiny ones. */
const nearLimit = (key: string) =>
  key.length >= 5 ? 2 : key.length >= 3 ? 1 : 0;

// ---------------------------------------------------------------------
// Entities: match, or propose
// ---------------------------------------------------------------------

type Named = { id: string; name: string; active: boolean };

type Resolved =
  | { ok: true; resolution: EntityResolution }
  | { ok: false; message: string };

function resolveEntity(
  label: string,
  rawName: string,
  existing: readonly Named[],
  choices: Readonly<Record<string, string>> | undefined,
  choiceKey?: (key: string) => string,
): Resolved {
  const name = cleanText(rawName);
  const key = nameKey(name);
  if (key === null) {
    return { ok: false, message: `${label} needs letters or numbers.` };
  }
  const exact = existing.find((e) => nameKey(e.name) === key);
  if (exact) {
    return exact.active
      ? {
          ok: true,
          resolution: { kind: "matched", id: exact.id, name: exact.name },
        }
      : {
          ok: false,
          message: `${label} “${exact.name}” is deactivated. Reactivate it first, or change the row.`,
        };
  }

  const limit = nearLimit(key);
  const similar =
    limit === 0
      ? undefined
      : existing.find(
          (e) =>
            e.active &&
            editDistance(key, nameKey(e.name) ?? "", limit) <= limit,
        );
  const answer = choices?.[choiceKey ? choiceKey(key) : key];
  if (similar && answer && answer !== "new") {
    const picked = existing.find((e) => e.id === answer && e.active);
    if (picked) {
      return {
        ok: true,
        resolution: { kind: "matched", id: picked.id, name: picked.name },
      };
    }
  }
  return {
    ok: true,
    resolution: {
      kind: "new",
      name,
      key,
      similarTo: similar ? { id: similar.id, name: similar.name } : undefined,
      needsChoice: similar !== undefined && answer !== "new",
    },
  };
}

// ---------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------

const ZERO_STOCK = (productId: string): StockView => ({
  productId,
  onHand: 0,
  backup: 0,
  cutoff: null,
  warning: null,
  par: null,
  version: 1,
  updatedAt: null,
  updatedByName: null,
  lastAdjustedAt: null,
});

type Draft = {
  record: CsvRecord;
  errors: string[];
  warnings: string[];
  vendor: EntityResolution;
  category: EntityResolution;
  subcategory: EntityResolution;
  name: string;
  size: string | null;
  unitType: UnitType;
  unitLabel: string | null;
  unitAssumed: boolean;
  sku: string | null;
  skuKey: string | null;
  notes: string | null;
  values: PlanRow["values"];
  identity: string | null;
};

const NONE: EntityResolution = { kind: "none" };

function scopeOf(resolution: EntityResolution): string | null {
  if (resolution.kind === "matched") return resolution.id;
  if (resolution.kind === "new") return `new:${resolution.key}`;
  return null;
}

function stockLevels(stock: StockView) {
  return {
    onHand: stock.onHand,
    backup: stock.backup,
    cutoff: stock.cutoff,
    warning: stock.warning,
    par: stock.par,
  };
}

const sameCents = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && toCents(a) === toCents(b));

export function buildImportPlan(
  records: readonly CsvRecord[],
  header: HeaderMapping,
  catalog: ImportCatalog,
  options: ImportOptions,
): ImportPlan {
  const choices = options.choices ?? {};
  const column = new Map<ImportField, number>();
  header.mapping.forEach((field, index) => {
    if (field && !column.has(field)) column.set(field, index);
  });
  const read = (record: CsvRecord, field: ImportField): string =>
    (column.has(field) ? (record.cells[column.get(field)!] ?? "") : "").trim();

  const vendors: Named[] = catalog.vendors.map((v) => ({
    id: v.id,
    name: v.name,
    active: v.active,
  }));
  const categories: Named[] = catalog.categories.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
  }));
  const stockById = new Map(catalog.stock.map((s) => [s.productId, s]));
  const vendorNameById = new Map(catalog.vendors.map((v) => [v.id, v.name]));
  const categoryNameById = new Map(
    catalog.categories.map((c) => [c.id, c.name]),
  );
  const subNameById = new Map(catalog.subcategories.map((s) => [s.id, s.name]));
  const productBySku = new Map<string, ProductView>();
  const productByIdentity = new Map<string, ProductView>();
  for (const product of catalog.products) {
    const sku = skuKey(product.sku);
    if (sku) productBySku.set(sku, product);
    const identity = productIdentityKey(product);
    if (identity) productByIdentity.set(identity, product);
  }

  // ---- Phase 1: read, validate and resolve each row on its own.
  const drafts: Draft[] = records.map((record): Draft => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const text = (field: ImportField, max = MAX_FIELD): string => {
      const value =
        field === "notes"
          ? read(record, field)
          : cleanText(read(record, field));
      if (value.length > max) {
        errors.push(
          `${field === "notes" ? "Notes" : "A value"} is longer than ${max} characters.`,
        );
      }
      return value;
    };

    const vendorText = text("vendor");
    const nameText = text("name");
    const categoryText = text("category");
    const subcategoryText = text("subcategory");
    const sizeText = text("size");
    const skuText = text("sku");
    const notesText = text("notes", MAX_NOTES);
    if (vendorText === "") errors.push("Vendor is required.");
    if (nameText === "") errors.push("Name is required.");

    const values: PlanRow["values"] = {};
    const numeric: [ImportField, keyof PlanRow["values"], string][] = [
      ["onHand", "onHand", "On Hand"],
      ["backup", "backup", "Backup"],
      ["cutoff", "cutoff", "Cutoff Limit"],
      ["warning", "warning", "Warning Level"],
      ["par", "par", "Par Level"],
    ];
    for (const [field, key, label] of numeric) {
      const parsed = parseImportNumber(read(record, field));
      if (parsed.kind === "ok") values[key] = parsed.value;
      else if (parsed.kind === "error")
        errors.push(`${label}: ${parsed.message}`);
    }

    const unit = parseImportUnit(read(record, "unit"));
    if (!unit.ok) errors.push(unit.message);

    let vendor: EntityResolution = NONE;
    if (vendorText !== "") {
      const r = resolveEntity("Vendor", vendorText, vendors, choices.vendors);
      if (r.ok) vendor = r.resolution;
      else errors.push(r.message);
    }

    let category: EntityResolution = NONE;
    let subcategory: EntityResolution = NONE;
    if (subcategoryText !== "" && categoryText === "") {
      errors.push("Subcategory needs a Category.");
    }
    if (categoryText !== "") {
      const r = resolveEntity(
        "Category",
        categoryText,
        categories,
        choices.categories,
      );
      if (r.ok) category = r.resolution;
      else errors.push(r.message);
    }
    if (subcategoryText !== "" && categoryText !== "") {
      const scope = scopeOf(category);
      if (scope !== null) {
        const inCategory: Named[] =
          category.kind === "matched"
            ? catalog.subcategories
                .filter((s) => s.categoryId === category.id)
                .map((s) => ({ id: s.id, name: s.name, active: s.active }))
            : [];
        const r = resolveEntity(
          "Subcategory",
          subcategoryText,
          inCategory,
          choices.subcategories,
          (key) => `${scope}|${key}`,
        );
        if (r.ok) subcategory = r.resolution;
        else errors.push(r.message);
      }
    }

    const unitType = unit.ok ? unit.unitType : "bottle";
    const unitLabel = unit.ok ? unit.unitLabel : null;
    const vendorScope = scopeOf(vendor);
    const identity =
      vendorScope !== null && nameKey(nameText) !== null
        ? productIdentityKey({
            vendorId: vendorScope,
            name: nameText,
            size: sizeText === "" ? null : sizeText,
            unitType,
            unitLabel,
          })
        : null;

    return {
      record,
      errors,
      warnings,
      vendor,
      category,
      subcategory,
      name: nameText,
      size: sizeText === "" ? null : sizeText,
      unitType,
      unitLabel,
      unitAssumed: unit.ok ? unit.assumed : false,
      sku: skuText === "" ? null : skuText,
      skuKey: skuKey(skuText),
      notes: notesText === "" ? null : notesText,
      values,
      identity,
    };
  });

  // ---- Phase 2: duplicates and collisions inside the file.
  const firstByIdentity = new Map<string, Draft>();
  const firstBySku = new Map<string, Draft>();
  const skuCollisions = new Set<Draft>();
  for (const draft of drafts) {
    if (draft.errors.length > 0) continue;
    if (draft.identity) {
      const first = firstByIdentity.get(draft.identity);
      if (first) {
        draft.errors.push(
          `This is the same item as row ${first.record.rowNumber}. List each item once.`,
        );
        continue;
      }
      firstByIdentity.set(draft.identity, draft);
    }
    if (draft.skuKey) {
      const first = firstBySku.get(draft.skuKey);
      if (first && first.identity !== draft.identity) {
        skuCollisions.add(first);
        skuCollisions.add(draft);
      } else if (!first) {
        firstBySku.set(draft.skuKey, draft);
      }
    }
  }
  for (const draft of skuCollisions) {
    const other = [...skuCollisions].find(
      (d) => d !== draft && d.skuKey === draft.skuKey,
    )!;
    draft.errors.push(
      `SKU ${draft.sku} is also used by row ${other.record.rowNumber} for a different item.`,
    );
  }

  // ---- Phase 3: match to the catalog and classify.
  const rows: PlanRow[] = drafts.map((draft): PlanRow => {
    const base = {
      rowNumber: draft.record.rowNumber,
      warnings: draft.warnings,
      vendor: draft.vendor,
      category: draft.category,
      subcategory: draft.subcategory,
      unitType: draft.unitType,
      unitLabel: draft.unitLabel,
      unitAssumed: draft.unitAssumed,
      sku: draft.sku,
      notes: draft.notes,
      values: draft.values,
      display: {
        vendor: draft.vendor.kind === "none" ? "" : draft.vendor.name,
        name: draft.name,
        size: draft.size,
        unit: unitDisplay(draft.unitType, draft.unitLabel),
      },
    };
    const error = (reason: string): PlanRow => ({
      ...base,
      action: "error",
      reason,
      needsApproval: false,
      matchedBy: null,
      productId: null,
      expectedStockVersion: null,
      expectedProductVersion: null,
      changes: [],
      statusBefore: null,
      statusAfter: null,
    });
    if (draft.errors.length > 0) return error(draft.errors.join(" "));

    // Match: SKU first, then identity. Never name alone.
    let product: ProductView | undefined;
    let matchedBy: PlanRow["matchedBy"] = null;
    if (draft.skuKey && productBySku.has(draft.skuKey)) {
      product = productBySku.get(draft.skuKey);
      matchedBy = "sku";
    } else if (draft.identity && productByIdentity.has(draft.identity)) {
      product = productByIdentity.get(draft.identity);
      matchedBy = "identity";
    }

    if (product && !product.active) {
      return error(
        `“${product.name}” is archived. Reactivate it first, or leave it out of the file.`,
      );
    }
    if (
      product &&
      matchedBy === "identity" &&
      draft.skuKey &&
      skuKey(product.sku) &&
      skuKey(product.sku) !== draft.skuKey
    ) {
      return error(
        `SKU ${draft.sku} does not match this item's SKU (${product.sku}).`,
      );
    }

    const current = product
      ? (stockById.get(product.id) ?? ZERO_STOCK(product.id))
      : null;
    const before = current ? stockLevels(current) : null;
    const merged = {
      onHand: draft.values.onHand ?? before?.onHand ?? 0,
      backup: draft.values.backup ?? before?.backup ?? 0,
      cutoff: draft.values.cutoff ?? before?.cutoff ?? null,
      warning: draft.values.warning ?? before?.warning ?? null,
      par: draft.values.par ?? before?.par ?? null,
    };
    if (
      merged.cutoff !== null &&
      merged.warning !== null &&
      toCents(merged.warning) < toCents(merged.cutoff)
    ) {
      return error("Warning level must be at or above the cutoff.");
    }
    const warnings = [...draft.warnings];
    if (
      merged.cutoff !== null &&
      merged.par !== null &&
      toCents(merged.par) < toCents(merged.cutoff)
    ) {
      warnings.push("Par is below the cutoff.");
    }
    const statusAfter =
      STATUS_LABEL[evaluateStock(merged, { archived: false }).status];
    const unitLabelNow = unitDisplay(draft.unitType, draft.unitLabel);

    if (!product || !current || !before) {
      return {
        ...base,
        warnings,
        action: "create",
        reason: null,
        needsApproval: false,
        matchedBy: null,
        productId: null,
        expectedStockVersion: null,
        expectedProductVersion: null,
        changes: [],
        statusBefore: null,
        statusAfter,
      };
    }

    // ---- Update: show every change, never a silent overwrite.
    const changes: FieldChange[] = [];
    const text = (
      field: ChangeField,
      label: string,
      cur: string | null,
      next: string | null,
    ) => {
      if ((cur ?? "") !== (next ?? "")) {
        changes.push({
          field,
          label,
          current: cur,
          imported: next,
          delta: null,
        });
      }
    };
    const number = (
      field: ChangeField,
      label: string,
      cur: number | null,
      next: number | undefined,
    ) => {
      if (next === undefined || sameCents(cur, next)) return; // blank = unchanged
      changes.push({
        field,
        label,
        current: cur,
        imported: next,
        delta: cur === null ? null : fromCents(toCents(next) - toCents(cur)),
      });
    };

    // A blank size, or a unit the file never named (it defaulted to Bottle),
    // is "unchanged" -- as it is for every other field -- so it is compared as
    // the product's own value. Otherwise a file with only Vendor, Name, SKU and
    // counts would propose clearing every matched item's size.
    const draftVendorScope = scopeOf(draft.vendor);
    const draftIdentity =
      draftVendorScope !== null && nameKey(draft.name) !== null
        ? productIdentityKey({
            vendorId: draftVendorScope,
            name: draft.name,
            size: draft.size ?? product.size,
            unitType: draft.unitAssumed ? product.unitType : draft.unitType,
            unitLabel: draft.unitAssumed ? product.unitLabel : draft.unitLabel,
          })
        : null;
    const identityChanged =
      matchedBy === "sku" && draftIdentity !== productIdentityKey(product);
    if (identityChanged) {
      const vendorNow = vendorNameById.get(product.vendorId) ?? "";
      text(
        "vendor",
        "Vendor",
        vendorNow,
        draft.vendor.kind === "none" ? "" : draft.vendor.name,
      );
      text("name", "Name", product.name, draft.name);
      const currentUnit = unitDisplay(product.unitType, product.unitLabel);
      text("size", "Size", product.size, draft.size ?? product.size);
      text(
        "unit",
        "Unit",
        currentUnit,
        draft.unitAssumed ? currentUnit : unitLabelNow,
      );
    }
    number("onHand", "On hand", before.onHand, draft.values.onHand);
    number("backup", "Backup", before.backup, draft.values.backup);
    number("cutoff", "Cutoff", before.cutoff, draft.values.cutoff);
    number("warning", "Warning", before.warning, draft.values.warning);
    number("par", "Par", before.par, draft.values.par);
    if (draft.category.kind !== "none") {
      const nextName = draft.category.name;
      text(
        "category",
        "Category",
        product.categoryId
          ? (categoryNameById.get(product.categoryId) ?? null)
          : null,
        nextName,
      );
    }
    if (draft.subcategory.kind !== "none") {
      text(
        "subcategory",
        "Subcategory",
        product.subcategoryId
          ? (subNameById.get(product.subcategoryId) ?? null)
          : null,
        draft.subcategory.name,
      );
    }
    if (draft.notes !== null)
      text("notes", "Notes", product.notes, draft.notes);
    if (draft.sku !== null && skuKey(product.sku) !== draft.skuKey) {
      text("sku", "SKU", product.sku, draft.sku);
    }

    return {
      ...base,
      warnings,
      action: changes.length === 0 ? "skip" : "update",
      reason: changes.length === 0 ? "No changes." : null,
      needsApproval: identityChanged,
      matchedBy,
      productId: product.id,
      expectedStockVersion: current.version,
      expectedProductVersion: product.version,
      changes,
      statusBefore:
        STATUS_LABEL[evaluateStock(before, { archived: false }).status],
      statusAfter,
    };
  });

  return summarize(rows, options);
}

function summarize(rows: PlanRow[], options: ImportOptions): ImportPlan {
  const newVendors = new Map<string, NewEntity>();
  const newCategories = new Map<string, NewEntity>();
  const newSubcategories = new Map<string, NewSubcategory>();
  const nearMisses = new Map<string, NearMiss>();

  const note = (
    map: Map<string, NewEntity>,
    resolution: EntityResolution,
    rowNumber: number,
    scope = "",
  ) => {
    if (resolution.kind !== "new") return;
    const k = `${scope}${resolution.key}`;
    const entry = map.get(k);
    if (entry) entry.rows.push(rowNumber);
    else
      map.set(k, {
        key: resolution.key,
        name: resolution.name,
        rows: [rowNumber],
      });
  };
  const near = (
    entity: NearMiss["entity"],
    resolution: EntityResolution,
    rowNumber: number,
    scope = "",
  ) => {
    if (
      resolution.kind !== "new" ||
      !resolution.needsChoice ||
      !resolution.similarTo
    ) {
      return;
    }
    const k = `${entity}|${scope}${resolution.key}`;
    const entry = nearMisses.get(k);
    if (entry) entry.rows.push(rowNumber);
    else {
      nearMisses.set(k, {
        entity,
        key: `${scope}${resolution.key}`,
        name: resolution.name,
        similarTo: resolution.similarTo,
        rows: [rowNumber],
      });
    }
  };

  for (const row of rows) {
    // Only rows that would be written propose new entities.
    if (row.action !== "create" && row.action !== "update") continue;
    note(newVendors, row.vendor, row.rowNumber);
    note(newCategories, row.category, row.rowNumber);
    near("vendor", row.vendor, row.rowNumber);
    near("category", row.category, row.rowNumber);
    if (row.subcategory.kind === "new") {
      const scope =
        row.category.kind === "matched"
          ? row.category.id
          : row.category.kind === "new"
            ? `new:${row.category.key}`
            : "";
      const k = `${scope}|${row.subcategory.key}`;
      const entry = newSubcategories.get(k);
      if (entry) entry.rows.push(row.rowNumber);
      else {
        newSubcategories.set(k, {
          key: row.subcategory.key,
          name: row.subcategory.name,
          categoryName: row.category.kind === "none" ? "" : row.category.name,
          rows: [row.rowNumber],
        });
      }
      near("subcategory", row.subcategory, row.rowNumber, `${scope}|`);
    }
  }

  const count = (action: ImportAction) =>
    rows.filter((r) => r.action === action).length;
  const writes = count("create") + count("update");
  return {
    reason: options.reason,
    rows,
    summary: {
      create: count("create"),
      update: count("update"),
      skip: count("skip"),
      error: count("error"),
      newVendors: newVendors.size,
      newCategories: newCategories.size,
      newSubcategories: newSubcategories.size,
      needsApproval: rows.filter((r) => r.needsApproval).length,
    },
    newVendors: [...newVendors.values()],
    newCategories: [...newCategories.values()],
    newSubcategories: [...newSubcategories.values()],
    nearMisses: [...nearMisses.values()],
    canCommit: writes > 0 && nearMisses.size === 0,
  };
}
