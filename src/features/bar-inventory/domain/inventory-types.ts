import type { Designation } from "@/features/auth/domain/passcode";

import type { OrderDraftView } from "./order-draft-view";
import type { AdjustmentReason, StockStatus } from "./stock-rules";

/** Curated unit types (owner decision D8). `other` carries a custom label. */
export const UNIT_TYPES = [
  "bottle",
  "can",
  "pack",
  "case",
  "keg",
  "other",
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  bottle: "Bottle",
  can: "Can",
  pack: "Pack",
  case: "Case",
  keg: "Keg",
  other: "Other",
};

export const UNIT_LABEL_MAX = 40;

/** The signed-in person looking at Bar Inventory. */
export type InventoryViewer = {
  profileId: string;
  name: string;
  designation: Designation;
};

/** Owner / Manager / Assistant Manager (owner decision D1). */
export function isInventoryManager(designation: Designation): boolean {
  return designation !== "staff";
}

type Audited = {
  version: number;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  updatedByName: string | null;
};

export type VendorView = Audited & {
  id: string;
  name: string;
  /** The system "Unassigned" vendor: read-only. */
  isSystem: boolean;
  active: boolean;
  notes: string | null;
};

export type CategoryView = Audited & {
  id: string;
  name: string;
  active: boolean;
};

export type SubcategoryView = Audited & {
  id: string;
  categoryId: string;
  name: string;
  active: boolean;
};

export type ProductView = Audited & {
  id: string;
  vendorId: string;
  name: string;
  categoryId: string | null;
  subcategoryId: string | null;
  size: string | null;
  unitType: UnitType;
  /** Only for unitType "other". */
  unitLabel: string | null;
  sku: string | null;
  notes: string | null;
  active: boolean;
};

/** One product's counts and levels at the (single, for now) location. */
export type StockView = {
  productId: string;
  onHand: number;
  backup: number;
  cutoff: number | null;
  warning: number | null;
  par: number | null;
  version: number;
  /** Null until the first count or level change. */
  updatedAt: string | null;
  updatedByName: string | null;
  lastAdjustedAt: string | null;
};

/** Ledger `source` values (the database derives them from the reason). */
export const HISTORY_SOURCES = [
  "manual_edit",
  "bulk_import",
  "delivery",
  "count",
  "receiving",
  "system",
] as const;
export type HistorySource = (typeof HISTORY_SOURCES)[number];

/**
 * One immutable ledger row: a change to a product's on-hand / backup count.
 * Keyed by the product's stable id, so it stays attached to the item through
 * renames and archiving; display names are joined from the current catalog.
 */
export type HistoryEntry = {
  id: string;
  /** ISO time of the change. */
  at: string;
  productId: string;
  reason: AdjustmentReason;
  source: HistorySource;
  note: string | null;
  prevOnHand: number;
  newOnHand: number;
  prevBackup: number;
  newBackup: number;
  statusAfter: Exclude<StockStatus, "archived">;
  /** The cutoff in force when the change was made (null = none set). */
  cutoffAtTime: number | null;
  actorName: string | null;
  importBatchId: string | null;
};

/** One confirmed import, as the batch history shows it. */
export type ImportBatchView = {
  id: string;
  filename: string;
  format: "csv" | "xlsx";
  sheet: string | null;
  reason: AdjustmentReason;
  status: "staged" | "committed";
  rowsInFile: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  vendorsCreated: number;
  categoriesCreated: number;
  subcategoriesCreated: number;
  actorName: string | null;
  createdAt: string;
  committedAt: string | null;
};

/** The organization-level catalog (BI-1) plus location stock (BI-2/3). */
export type CatalogState = {
  vendors: VendorView[];
  categories: CategoryView[];
  subcategories: SubcategoryView[];
  products: ProductView[];
  stock: StockView[];
  /** Demo mode only: its in-memory ledger. Real mode reads history from the database. */
  ledger?: HistoryEntry[];
  /** Demo mode only: its confirmed imports. Real mode reads batches from the database. */
  importBatches?: ImportBatchView[];
  /** Demo mode only: its active order drafts. Real mode reads them from the database. */
  orderDrafts?: OrderDraftView[];
};

export type CatalogSnapshot = CatalogState & {
  /** ISO time the snapshot was read. */
  loadedAt: string;
};

export type ProductInput = {
  vendorId: string;
  name: string;
  categoryId: string | null;
  subcategoryId: string | null;
  size: string | null;
  unitType: UnitType;
  unitLabel: string | null;
  sku: string | null;
  notes: string | null;
};

/** Why a write was refused in a way the UI can act on. */
export type CatalogConflict =
  | {
      kind: "stale";
      entity: string;
      id: string;
      currentVersion: number;
      updatedBy: string | null;
      updatedAt: string | null;
      /** Stock conflicts: the counts as they are now. */
      current?: { onHand: number; backup: number };
    }
  | {
      kind: "duplicate";
      entity: string;
      field: string;
      existingId: string | null;
      existingLabel: string | null;
    };

export type CatalogFailure = { error: string; conflict?: CatalogConflict };

/** Display label for a product's unit ("Bottle", or the custom label). */
export function unitDisplay(
  unitType: UnitType,
  unitLabel: string | null,
): string {
  return unitType === "other" && unitLabel
    ? unitLabel
    : UNIT_TYPE_LABELS[unitType];
}
