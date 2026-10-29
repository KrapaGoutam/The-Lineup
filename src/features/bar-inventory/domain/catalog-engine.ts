import type { CatalogCommand } from "./catalog-commands";
import {
  parseInventoryDate,
  displayInventoryDate,
  type DateLot,
  type FreshnessRule,
} from "./freshness";
import {
  UNIT_LABEL_MAX,
  type CatalogConflict,
  type CatalogFailure,
  type CatalogState,
  type HistoryEntry,
  type HistorySource,
  type CategoryView,
  type ProductInput,
  type ProductView,
  type StockView,
  type SubcategoryView,
  type VendorView,
} from "./inventory-types";
import { evaluateStock, sourceForReason } from "./stock-rules";
import {
  cleanText,
  isUnitType,
  nameKey,
  productIdentityKey,
  skuKey,
} from "./keys";

/**
 * Pure, in-memory twin of the trusted catalog RPCs (migration
 * 20261026170000_bar_inventory_catalog.sql). It powers demo mode and keeps
 * the same rules, wording and conflict shapes, so the UI behaves identically
 * with or without a database. In real mode the database is the authority and
 * this engine is never consulted.
 */

export type CatalogContext = {
  profileId?: string;
  actorName: string;
  now: Date;
  newId: () => string;
};

export type CatalogResult =
  | { ok: true; state: CatalogState }
  | ({ ok: false } & CatalogFailure);

class CatalogRefusal extends Error {
  constructor(
    message: string,
    readonly conflict?: CatalogConflict,
  ) {
    super(message);
  }
}

const refuse = (message: string) => new CatalogRefusal(message);

function validName(label: string, value: string, max: number): string {
  const name = cleanText(value);
  if (name === "") throw refuse(`Enter a ${label}.`);
  if (name.length > max) {
    throw refuse(`The ${label} can be at most ${max} characters.`);
  }
  if (nameKey(name) === null) {
    throw refuse(`The ${label} needs at least one letter or number.`);
  }
  return name;
}

function optionalText(
  label: string,
  value: string | null,
  max: number,
): string | null {
  const text = cleanText(value);
  if (text === "") return null;
  if (text.length > max) {
    throw refuse(`The ${label} can be at most ${max} characters.`);
  }
  return text;
}

function duplicate(
  entity: string,
  field: string,
  existingId: string,
  existingLabel: string,
  message: string,
): CatalogRefusal {
  return new CatalogRefusal(message, {
    kind: "duplicate",
    entity,
    field,
    existingId,
    existingLabel,
  });
}

function checkVersion(
  entity: string,
  row: {
    id: string;
    version: number;
    updatedAt: string;
    updatedByName: string | null;
  },
  expected: number,
) {
  if (row.version === expected) return;
  throw new CatalogRefusal(
    `Someone else changed this ${entity}. Review the latest and try again.`,
    {
      kind: "stale",
      entity,
      id: row.id,
      currentVersion: row.version,
      updatedBy: row.updatedByName,
      updatedAt: row.updatedAt,
    },
  );
}

function touch<
  T extends {
    version: number;
    updatedAt: string;
    updatedByName: string | null;
  },
>(row: T, patch: Partial<T>, ctx: CatalogContext): T {
  return {
    ...row,
    ...patch,
    version: row.version + 1,
    updatedAt: ctx.now.toISOString(),
    updatedByName: ctx.actorName,
  };
}

function replace<T extends { id: string }>(rows: T[], next: T): T[] {
  return rows.map((row) => (row.id === next.id ? next : row));
}

function audited(ctx: CatalogContext) {
  return {
    version: 1,
    updatedAt: ctx.now.toISOString(),
    updatedByName: ctx.actorName,
  };
}

/** The system vendor exists from the first interaction, like the database's. */
export function withSystemVendor(
  state: CatalogState,
  ctx: CatalogContext,
): CatalogState {
  if (state.vendors.some((vendor) => vendor.isSystem)) return state;
  const system: VendorView = {
    id: ctx.newId(),
    name: "Unassigned",
    isSystem: true,
    active: true,
    notes: null,
    ...audited(ctx),
  };
  return { ...state, vendors: [system, ...state.vendors] };
}

function findVendor(state: CatalogState, id: string): VendorView {
  const row = state.vendors.find((vendor) => vendor.id === id);
  if (!row) throw refuse("That vendor no longer exists.");
  return row;
}

function findCategory(state: CatalogState, id: string): CategoryView {
  const row = state.categories.find((category) => category.id === id);
  if (!row) throw refuse("That category no longer exists.");
  return row;
}

function findSubcategory(state: CatalogState, id: string): SubcategoryView {
  const row = state.subcategories.find((sub) => sub.id === id);
  if (!row) throw refuse("That subcategory no longer exists.");
  return row;
}

function findProduct(state: CatalogState, id: string): ProductView {
  const row = state.products.find((product) => product.id === id);
  if (!row) throw refuse("That product no longer exists.");
  return row;
}

function vendorNameTaken(state: CatalogState, name: string, exceptId?: string) {
  const key = nameKey(name);
  return state.vendors.find(
    (vendor) => vendor.id !== exceptId && nameKey(vendor.name) === key,
  );
}

function assertVendorNameFree(
  state: CatalogState,
  name: string,
  exceptId?: string,
) {
  const clash = vendorNameTaken(state, name, exceptId);
  if (clash) {
    throw duplicate(
      "vendor",
      "name",
      clash.id,
      clash.name,
      `A vendor named "${clash.name}" already exists.`,
    );
  }
}

function assertCategoryNameFree(
  state: CatalogState,
  name: string,
  exceptId?: string,
) {
  const key = nameKey(name);
  const clash = state.categories.find(
    (category) => category.id !== exceptId && nameKey(category.name) === key,
  );
  if (clash) {
    throw duplicate(
      "category",
      "name",
      clash.id,
      clash.name,
      `A category named "${clash.name}" already exists.`,
    );
  }
}

function assertSubcategoryNameFree(
  state: CatalogState,
  category: CategoryView,
  name: string,
  exceptId?: string,
) {
  const key = nameKey(name);
  const clash = state.subcategories.find(
    (sub) =>
      sub.id !== exceptId &&
      sub.categoryId === category.id &&
      nameKey(sub.name) === key,
  );
  if (clash) {
    throw duplicate(
      "subcategory",
      "name",
      clash.id,
      clash.name,
      `"${category.name}" already has a subcategory named "${clash.name}".`,
    );
  }
}

type CleanProduct = Omit<ProductInput, "name"> & { name: string };

function validateProduct(
  state: CatalogState,
  input: ProductInput,
): CleanProduct {
  const name = validName("product name", input.name, 160);
  const size = optionalText("size", input.size, 40);
  const unitLabel = optionalText("unit label", input.unitLabel, UNIT_LABEL_MAX);
  const sku = optionalText("SKU", input.sku, 60);
  const notes = optionalText("notes", input.notes, 500);

  if (!state.vendors.some((vendor) => vendor.id === input.vendorId)) {
    throw refuse("Choose a vendor (or Unassigned).");
  }
  if (
    input.categoryId !== null &&
    !state.categories.some((category) => category.id === input.categoryId)
  ) {
    throw refuse("That category no longer exists.");
  }
  if (input.subcategoryId !== null) {
    if (input.categoryId === null) {
      throw refuse("Pick a category before choosing a subcategory.");
    }
    const sub = state.subcategories.find(
      (row) => row.id === input.subcategoryId,
    );
    if (!sub || sub.categoryId !== input.categoryId) {
      throw refuse("That subcategory does not belong to the chosen category.");
    }
  }
  if (!isUnitType(input.unitType)) {
    throw refuse("Choose a unit: Bottle, Can, Pack, Case, Keg or Other.");
  }
  if (input.unitType === "other" && nameKey(unitLabel) === null) {
    throw refuse("Name the unit when you choose Other.");
  }
  if (input.unitType !== "other" && unitLabel !== null) {
    throw refuse("A unit label is only used with Other.");
  }
  return {
    ...input,
    name,
    size,
    unitLabel: input.unitType === "other" ? unitLabel : null,
    sku,
    notes,
  };
}

function assertActiveParents(
  state: CatalogState,
  next: CleanProduct,
  previous: ProductView | null,
) {
  if (!previous || next.vendorId !== previous.vendorId) {
    const vendor = findVendor(state, next.vendorId);
    if (!vendor.active) {
      throw refuse(
        `The vendor "${vendor.name}" is inactive. Reactivate it or choose another.`,
      );
    }
  }
  if (
    next.categoryId !== null &&
    next.categoryId !== (previous?.categoryId ?? null) &&
    !findCategory(state, next.categoryId).active
  ) {
    throw refuse("That category is archived. Reactivate it or choose another.");
  }
  if (
    next.subcategoryId !== null &&
    next.subcategoryId !== (previous?.subcategoryId ?? null) &&
    !findSubcategory(state, next.subcategoryId).active
  ) {
    throw refuse(
      "That subcategory is archived. Reactivate it or choose another.",
    );
  }
}

function assertProductUnique(
  state: CatalogState,
  selfId: string | null,
  next: {
    vendorId: string;
    name: string;
    size: string | null;
    unitType: string;
    unitLabel: string | null;
    sku: string | null;
  },
) {
  const identity = productIdentityKey(next);
  const sku = skuKey(next.sku);
  for (const other of state.products) {
    if (!other.active || other.id === selfId) continue;
    if (productIdentityKey(other) === identity) {
      const vendor = state.vendors.find((v) => v.id === other.vendorId);
      throw duplicate(
        "product",
        "identity",
        other.id,
        other.name,
        `That product already exists: "${other.name}"${other.size ? ` ${other.size}` : ""} (${vendor?.name ?? "Unassigned"}).`,
      );
    }
    if (sku !== null && skuKey(other.sku) === sku) {
      throw duplicate(
        "product",
        "sku",
        other.id,
        other.name,
        `SKU "${next.sku}" is already used by "${other.name}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------
// Stock (twin of inventory_stock_adjust / inventory_stock_set_levels)
// ---------------------------------------------------------------------
function checkQuantity(
  label: string,
  value: number | null,
  allowNegative: boolean,
) {
  if (value === null) return;
  if (!Number.isFinite(value)) throw refuse(`Enter a number for the ${label}.`);
  if (Math.abs(Math.round(value * 100) / 100 - value) > 1e-9) {
    throw refuse(`The ${label} can have at most two decimal places.`);
  }
  if (Math.abs(value) > 9_999_999_999.99) {
    throw refuse(`The ${label} is too large.`);
  }
  if (value < 0 && !allowNegative) {
    throw refuse(`The ${label} cannot be negative.`);
  }
}

function findStock(state: CatalogState, productId: string): StockView {
  return (
    state.stock.find((row) => row.productId === productId) ?? {
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
    }
  );
}

function putStock(state: CatalogState, next: StockView): StockView[] {
  return state.stock.some((row) => row.productId === next.productId)
    ? state.stock.map((row) => (row.productId === next.productId ? next : row))
    : [...state.stock, next];
}

function staleStock(stock: StockView, entityLabel: string): CatalogRefusal {
  return new CatalogRefusal(
    `Someone else changed this ${entityLabel}. Review the latest and try again.`,
    {
      kind: "stale",
      entity: "stock",
      id: stock.productId,
      currentVersion: stock.version,
      updatedBy: stock.updatedByName,
      updatedAt: stock.updatedAt,
      current: { onHand: stock.onHand, backup: stock.backup },
    },
  );
}

function adjustStock(
  state: CatalogState,
  command: Extract<CatalogCommand, { type: "stockAdjust" }>,
  ctx: CatalogContext,
): CatalogState {
  if (command.onHand === null && command.backup === null) {
    throw refuse("Enter a quantity.");
  }
  const isDelta = command.mode === "delta";
  checkQuantity("on hand count", command.onHand, isDelta);
  checkQuantity("backup count", command.backup, isDelta);
  const product = findProduct(state, command.productId);
  if (!product.active) {
    throw refuse("Reactivate this product before changing its count.");
  }
  const stock = findStock(state, product.id);

  const cents = (value: number) => Math.round(value * 100);
  let onHand: number;
  let backup: number;
  if (isDelta) {
    onHand = (cents(stock.onHand) + cents(command.onHand ?? 0)) / 100;
    backup = (cents(stock.backup) + cents(command.backup ?? 0)) / 100;
    if (onHand < 0 || backup < 0) {
      throw refuse("That would take the count below zero.");
    }
  } else {
    onHand = command.onHand ?? stock.onHand;
    backup = command.backup ?? stock.backup;
  }

  // Identical request (double submit / retry): nothing to do, nothing logged.
  if (
    cents(onHand) === cents(stock.onHand) &&
    cents(backup) === cents(stock.backup)
  ) {
    return state;
  }
  if (!isDelta) {
    if (command.expectedVersion === null) {
      throw refuse("Reload the item and try again.");
    }
    if (stock.version !== command.expectedVersion) {
      throw staleStock(stock, "count");
    }
  }
  const now = ctx.now.toISOString();
  const next = {
    ...stock,
    onHand,
    backup,
    version: stock.version + 1,
    updatedAt: now,
    updatedByName: ctx.actorName,
    lastAdjustedAt: now,
  };
  const ledger = state.ledger ?? [];
  const entry: HistoryEntry = {
    id: String(ledger.length + 1),
    at: now,
    productId: product.id,
    reason: command.reason,
    source: sourceForReason(command.reason) as HistorySource,
    note: command.note,
    prevOnHand: stock.onHand,
    newOnHand: onHand,
    prevBackup: stock.backup,
    newBackup: backup,
    statusAfter: evaluateStock(next, { archived: false })
      .status as HistoryEntry["statusAfter"],
    actorName: ctx.actorName,
    cutoffAtTime: stock.cutoff,
    importBatchId: null,
  };
  return {
    ...state,
    stock: putStock(state, next),
    ledger: [...ledger, entry],
  };
}

function setLevels(
  state: CatalogState,
  command: Extract<CatalogCommand, { type: "stockSetLevels" }>,
  ctx: CatalogContext,
): CatalogState {
  checkQuantity("cutoff", command.cutoff, false);
  checkQuantity("warning level", command.warning, false);
  checkQuantity("par level", command.par, false);
  if (
    command.warning !== null &&
    command.cutoff !== null &&
    command.warning < command.cutoff
  ) {
    throw refuse("The warning level must be at least the cutoff.");
  }
  const product = findProduct(state, command.productId);
  if (!product.active) {
    throw refuse("Reactivate this product before changing its levels.");
  }
  const stock = findStock(state, product.id);
  if (
    stock.cutoff === command.cutoff &&
    stock.warning === command.warning &&
    stock.par === command.par
  ) {
    return state;
  }
  if (stock.version !== command.expectedVersion) {
    throw staleStock(stock, "item");
  }
  return {
    ...state,
    stock: putStock(state, {
      ...stock,
      cutoff: command.cutoff,
      warning: command.warning,
      par: command.par,
      version: stock.version + 1,
      updatedAt: ctx.now.toISOString(),
      updatedByName: ctx.actorName,
    }),
  };
}

function apply(
  base: CatalogState,
  command: CatalogCommand,
  ctx: CatalogContext,
): CatalogState {
  const state = withSystemVendor(base, ctx);

  switch (command.type) {
    case "savedViewSave": {
      const profileId = ctx.profileId ?? ctx.actorName;
      const views = state.savedViews ?? [];
      const old = views.find(
        (v) => v.id === command.id && v.profileId === profileId,
      );
      if (command.id && !old)
        throw refuse("That personal view is not available.");
      if (old && old.version !== command.expectedVersion)
        throw refuse("This saved view changed. Reload and try again.");
      const name = cleanText(command.name);
      if (!name || name.length > 80)
        throw refuse("Enter a view name of 1–80 characters.");
      if (
        views.some(
          (v) =>
            v.profileId === profileId &&
            v.id !== command.id &&
            v.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw refuse("You already have a view with that name.");
      const next = {
        id: old?.id ?? ctx.newId(),
        profileId,
        name,
        payload: command.payload,
        isDefault: command.isDefault,
        version: (old?.version ?? 0) + 1,
      };
      return {
        ...state,
        savedViews: [
          ...views
            .filter((v) => v.id !== old?.id)
            .map((v) =>
              command.isDefault && v.profileId === profileId && v.isDefault
                ? { ...v, isDefault: false, version: v.version + 1 }
                : v,
            ),
          next,
        ],
      };
    }
    case "savedViewDelete": {
      const old = state.savedViews?.find(
        (v) =>
          v.id === command.id &&
          v.profileId === (ctx.profileId ?? ctx.actorName),
      );
      if (!old) throw refuse("That personal view is not available.");
      if (old.version !== command.expectedVersion)
        throw refuse("This saved view changed. Reload and try again.");
      return {
        ...state,
        savedViews: state.savedViews?.filter((v) => v.id !== old.id),
      };
    }
    case "bulkCount": {
      const ids = new Set<string>();
      for (const row of command.rows) {
        if (ids.has(row.productId))
          throw refuse("Each product may appear only once.");
        ids.add(row.productId);
        const stock = state.stock.find((s) => s.productId === row.productId);
        if (!stock || stock.version !== row.expectedVersion)
          throw new CatalogRefusal(
            "This count changed. Nothing was saved. Refresh and review.",
            {
              kind: "stale",
              entity: "stock",
              id: row.productId,
              currentVersion: stock?.version ?? 0,
              updatedAt: stock?.updatedAt ?? null,
              updatedBy: stock?.updatedByName ?? null,
              current: stock
                ? { onHand: stock.onHand, backup: stock.backup }
                : undefined,
            },
          );
      }
      // Pure staged state: no caller-visible mutation if a later row fails.
      return command.rows.reduce(
        (next, row) =>
          adjustStock(
            next,
            {
              type: "stockAdjust",
              productId: row.productId,
              mode: "set",
              onHand: row.onHand,
              backup: row.backup,
              expectedVersion: row.expectedVersion,
              reason: command.reason,
              note: command.note,
            },
            ctx,
          ),
        state,
      );
    }
    case "dateLotSave": {
      const product = state.products.find(
        (p) => p.id === command.productId && p.active,
      );
      if (!product)
        throw refuse("Choose an active product in this restaurant.");
      if (!command.manufacture && !command.expiration)
        throw refuse("Enter a manufacture or expiration date.");
      for (const [kind, date] of [
        ["manufacture", command.manufacture],
        ["expiration", command.expiration],
      ] as const) {
        if (
          date &&
          parseInventoryDate(displayInventoryDate(date), kind)?.date !==
            date.date
        )
          throw refuse("Invalid date precision.");
      }
      if (
        command.manufacture &&
        command.expiration &&
        command.manufacture.date > command.expiration.date
      )
        throw refuse("Expiration must not precede manufacture.");
      if (
        command.quantity !== null &&
        (!Number.isFinite(command.quantity) ||
          command.quantity < 0 ||
          Math.round(command.quantity * 100) / 100 !== command.quantity)
      )
        throw refuse("Enter a nonnegative quantity with up to 2 decimals.");
      const lots = state.dateLots ?? [];
      const old = lots.find(
        (l) => l.id === command.id && l.productId === command.productId,
      );
      if (command.id && !old)
        throw refuse("That date entry is not available here.");
      if (old) checkVersion("date_lot", old, command.expectedVersion ?? 0);
      const next: DateLot = {
        id: old?.id ?? ctx.newId(),
        productId: command.productId,
        quantity: command.quantity,
        manufacture: command.manufacture,
        expiration: command.expiration,
        notes: command.notes,
        active: command.active,
        version: (old?.version ?? 0) + 1,
        updatedAt: ctx.now.toISOString(),
        updatedByName: ctx.actorName,
      };
      return {
        ...state,
        dateLots: old
          ? lots.map((l) => (l.id === old.id ? next : l))
          : [...lots, next],
      };
    }
    case "freshnessRuleSave": {
      if (!state.subcategories.some((s) => s.id === command.subcategoryId))
        throw refuse("Choose a subcategory in this restaurant.");
      if (
        command.warningMonths >= command.maximumMonths ||
        command.maximumMonths < 1 ||
        command.maximumMonths > 120 ||
        command.warningMonths < 0
      )
        throw refuse("Warning months must be less than maximum months.");
      const rules = state.freshnessRules ?? [];
      const old = rules.find((r) => r.id === command.id);
      if (command.id && !old)
        throw refuse("That freshness rule is not available here.");
      if (old)
        checkVersion("freshness_rule", old, command.expectedVersion ?? 0);
      if (
        rules.some(
          (r) =>
            r.subcategoryId === command.subcategoryId && r.id !== command.id,
        )
      )
        throw refuse("This subcategory already has a freshness rule.");
      const next: FreshnessRule = {
        id: old?.id ?? ctx.newId(),
        subcategoryId: command.subcategoryId,
        trackingEnabled: command.trackingEnabled,
        maximumMonths: command.maximumMonths,
        warningMonths: command.warningMonths,
        active: command.active,
        version: (old?.version ?? 0) + 1,
        updatedAt: ctx.now.toISOString(),
        updatedByName: ctx.actorName,
      };
      return {
        ...state,
        freshnessRules: old
          ? rules.map((r) => (r.id === old.id ? next : r))
          : [...rules, next],
      };
    }
    case "vendorCreate": {
      const name = validName("vendor name", command.name, 120);
      const notes = optionalText("vendor notes", command.notes, 500);
      assertVendorNameFree(state, name);
      const vendor: VendorView = {
        id: ctx.newId(),
        name,
        isSystem: false,
        active: true,
        notes,
        ...audited(ctx),
      };
      return { ...state, vendors: [...state.vendors, vendor] };
    }
    case "vendorUpdate": {
      const name = validName("vendor name", command.name, 120);
      const notes = optionalText("vendor notes", command.notes, 500);
      const row = findVendor(state, command.id);
      if (row.isSystem)
        throw refuse("The Unassigned vendor cannot be changed.");
      checkVersion("vendor", row, command.expectedVersion);
      if (row.name === name && row.notes === notes) return state;
      assertVendorNameFree(state, name, row.id);
      return {
        ...state,
        vendors: replace(state.vendors, touch(row, { name, notes }, ctx)),
      };
    }
    case "vendorSetActive": {
      const row = findVendor(state, command.id);
      if (row.isSystem)
        throw refuse("The Unassigned vendor cannot be changed.");
      checkVersion("vendor", row, command.expectedVersion);
      if (row.active === command.active) return state;
      return {
        ...state,
        vendors: replace(
          state.vendors,
          touch(row, { active: command.active }, ctx),
        ),
      };
    }
    case "categoryCreate": {
      const name = validName("category name", command.name, 80);
      assertCategoryNameFree(state, name);
      const category: CategoryView = {
        id: ctx.newId(),
        name,
        active: true,
        ...audited(ctx),
      };
      return { ...state, categories: [...state.categories, category] };
    }
    case "categoryUpdate": {
      const name = validName("category name", command.name, 80);
      const row = findCategory(state, command.id);
      checkVersion("category", row, command.expectedVersion);
      if (row.name === name) return state;
      assertCategoryNameFree(state, name, row.id);
      return {
        ...state,
        categories: replace(state.categories, touch(row, { name }, ctx)),
      };
    }
    case "categorySetActive": {
      const row = findCategory(state, command.id);
      checkVersion("category", row, command.expectedVersion);
      if (row.active === command.active) return state;
      return {
        ...state,
        categories: replace(
          state.categories,
          touch(row, { active: command.active }, ctx),
        ),
      };
    }
    case "subcategoryCreate": {
      const name = validName("subcategory name", command.name, 80);
      const category = state.categories.find(
        (c) => c.id === command.categoryId,
      );
      if (!category) throw refuse("Choose a category for the subcategory.");
      if (!category.active) {
        throw refuse(`Reactivate the category "${category.name}" first.`);
      }
      assertSubcategoryNameFree(state, category, name);
      const sub: SubcategoryView = {
        id: ctx.newId(),
        categoryId: category.id,
        name,
        active: true,
        ...audited(ctx),
      };
      return { ...state, subcategories: [...state.subcategories, sub] };
    }
    case "subcategoryUpdate": {
      const name = validName("subcategory name", command.name, 80);
      const row = findSubcategory(state, command.id);
      checkVersion("subcategory", row, command.expectedVersion);
      const category = state.categories.find(
        (c) => c.id === command.categoryId,
      );
      if (!category) throw refuse("Choose a category for the subcategory.");
      if (row.name === name && row.categoryId === category.id) return state;
      if (category.id !== row.categoryId) {
        if (!category.active) {
          throw refuse(`Reactivate the category "${category.name}" first.`);
        }
        if (state.products.some((p) => p.subcategoryId === row.id)) {
          throw refuse(
            "Products still use this subcategory. Change those products first.",
          );
        }
      }
      assertSubcategoryNameFree(state, category, name, row.id);
      return {
        ...state,
        subcategories: replace(
          state.subcategories,
          touch(row, { name, categoryId: category.id }, ctx),
        ),
      };
    }
    case "subcategorySetActive": {
      const row = findSubcategory(state, command.id);
      checkVersion("subcategory", row, command.expectedVersion);
      if (row.active === command.active) return state;
      if (command.active) {
        const category = findCategory(state, row.categoryId);
        if (!category.active) {
          throw refuse(`Reactivate the category "${category.name}" first.`);
        }
      }
      return {
        ...state,
        subcategories: replace(
          state.subcategories,
          touch(row, { active: command.active }, ctx),
        ),
      };
    }
    case "productCreate": {
      const next = validateProduct(state, command.input);
      assertActiveParents(state, next, null);
      assertProductUnique(state, null, next);
      const product: ProductView = {
        id: ctx.newId(),
        vendorId: next.vendorId,
        name: next.name,
        categoryId: next.categoryId,
        subcategoryId: next.subcategoryId,
        size: next.size,
        unitType: next.unitType,
        unitLabel: next.unitLabel,
        sku: next.sku,
        notes: next.notes,
        active: true,
        ...audited(ctx),
      };
      return {
        ...state,
        products: [...state.products, product],
        stock: putStock(state, findStock(state, product.id)),
      };
    }
    case "productUpdate": {
      const row = findProduct(state, command.id);
      checkVersion("product", row, command.expectedVersion);
      if (!row.active)
        throw refuse("Reactivate this product before editing it.");
      const next = validateProduct(state, command.input);
      const unchanged =
        row.vendorId === next.vendorId &&
        row.name === next.name &&
        row.categoryId === next.categoryId &&
        row.subcategoryId === next.subcategoryId &&
        row.size === next.size &&
        row.unitType === next.unitType &&
        row.unitLabel === next.unitLabel &&
        row.sku === next.sku &&
        row.notes === next.notes;
      if (unchanged) return state;
      assertActiveParents(state, next, row);
      assertProductUnique(state, row.id, next);
      return {
        ...state,
        products: replace(
          state.products,
          touch(
            row,
            {
              vendorId: next.vendorId,
              name: next.name,
              categoryId: next.categoryId,
              subcategoryId: next.subcategoryId,
              size: next.size,
              unitType: next.unitType,
              unitLabel: next.unitLabel,
              sku: next.sku,
              notes: next.notes,
            },
            ctx,
          ),
        ),
      };
    }
    case "productSetActive": {
      const row = findProduct(state, command.id);
      checkVersion("product", row, command.expectedVersion);
      if (row.active === command.active) return state;
      if (command.active) {
        const vendor = findVendor(state, row.vendorId);
        if (!vendor.active) {
          throw refuse(`Reactivate the vendor "${vendor.name}" first.`);
        }
        assertProductUnique(state, row.id, row);
      }
      return {
        ...state,
        products: replace(
          state.products,
          touch(row, { active: command.active }, ctx),
        ),
      };
    }
    case "stockAdjust":
      return adjustStock(state, command, ctx);
    case "stockSetLevels":
      return setLevels(state, command, ctx);
  }
}

export function applyCatalogCommand(
  state: CatalogState,
  command: CatalogCommand,
  ctx: CatalogContext,
): CatalogResult {
  try {
    return { ok: true, state: apply(state, command, ctx) };
  } catch (error) {
    if (error instanceof CatalogRefusal) {
      return { ok: false, error: error.message, conflict: error.conflict };
    }
    throw error;
  }
}

export function emptyCatalogState(): CatalogState {
  return {
    vendors: [],
    categories: [],
    subcategories: [],
    products: [],
    stock: [],
  };
}
