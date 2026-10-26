import type { CatalogCommand } from "./catalog-commands";
import {
  UNIT_LABEL_MAX,
  type CatalogConflict,
  type CatalogFailure,
  type CatalogState,
  type CategoryView,
  type ProductInput,
  type ProductView,
  type SubcategoryView,
  type VendorView,
} from "./inventory-types";
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

function apply(
  base: CatalogState,
  command: CatalogCommand,
  ctx: CatalogContext,
): CatalogState {
  const state = withSystemVendor(base, ctx);

  switch (command.type) {
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
      return { ...state, products: [...state.products, product] };
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
  return { vendors: [], categories: [], subcategories: [], products: [] };
}
