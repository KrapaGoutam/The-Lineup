import type { CsvRecord } from "@/lib/csv/read";

import {
  calendarDays,
  displayInventoryDate,
  parseInventoryDate,
  type DateLot,
  type DatePrecision,
  type InventoryDate,
} from "./freshness";
import type { CatalogState, ProductView } from "./inventory-types";
import { cleanText, nameKey, sizeKey } from "./keys";
import { parseQuantityInput } from "./stock-rules";

export type DateGroupImportField =
  | "vendor"
  | "name"
  | "size"
  | "unit"
  | "dateGroupId"
  | "datedQuantity"
  | "manufactured"
  | "manufacturePrecision"
  | "expires"
  | "expirationPrecision"
  | "notes";

export const DATE_GROUP_IMPORT_FIELDS: readonly DateGroupImportField[] = [
  "vendor",
  "name",
  "size",
  "unit",
  "dateGroupId",
  "datedQuantity",
  "manufactured",
  "manufacturePrecision",
  "expires",
  "expirationPrecision",
  "notes",
];

export const DATE_GROUP_FIELD_LABELS: Record<DateGroupImportField, string> = {
  vendor: "Vendor",
  name: "Name",
  size: "Size",
  unit: "Unit",
  dateGroupId: "Date group ID",
  datedQuantity: "Dated quantity",
  manufactured: "Manufactured",
  manufacturePrecision: "Manufacture precision",
  expires: "Expires",
  expirationPrecision: "Expiration precision",
  notes: "Notes",
};

export const DATE_GROUP_TEMPLATE =
  [
    "Vendor",
    "Name",
    "Size",
    "Unit",
    "Date group ID",
    "Dated quantity",
    "Manufactured",
    "Manufacture precision",
    "Expires",
    "Expiration precision",
    "Notes",
  ].join(",") + "\n";

const ALIASES: Record<string, DateGroupImportField> = {
  vendor: "vendor",
  supplier: "vendor",
  name: "name",
  product: "name",
  item: "name",
  size: "size",
  unit: "unit",
  dategroupid: "dateGroupId",
  dategroup: "dateGroupId",
  lotid: "dateGroupId",
  groupid: "dateGroupId",
  datedquantity: "datedQuantity",
  quantity: "datedQuantity",
  qty: "datedQuantity",
  count: "datedQuantity",
  manufactured: "manufactured",
  mfgdate: "manufactured",
  manufacturedate: "manufactured",
  productiondate: "manufactured",
  manufactureprecision: "manufacturePrecision",
  mfgprecision: "manufacturePrecision",
  expires: "expires",
  expdate: "expires",
  expirationdate: "expires",
  expiration: "expires",
  expiry: "expires",
  expirationprecision: "expirationPrecision",
  expprecision: "expirationPrecision",
  notes: "notes",
  note: "notes",
  comment: "notes",
  comments: "notes",
};

export type DateGroupHeaderMapping = {
  headerCells: readonly string[];
  byColumnIndex: Record<number, DateGroupImportField | null>;
  missing: DateGroupImportField[];
  unmapped: string[];
};

export function mapDateGroupHeaders(
  headerCells: readonly string[],
  override: Readonly<Record<number, DateGroupImportField | null>> = {},
): DateGroupHeaderMapping {
  const byColumnIndex: Record<number, DateGroupImportField | null> = {};
  const mapped = new Set<DateGroupImportField>();
  const unmapped: string[] = [];

  for (let i = 0; i < headerCells.length; i++) {
    if (override[i] !== undefined) {
      const field = override[i];
      byColumnIndex[i] = field;
      if (field) mapped.add(field);
      else if (headerCells[i]?.trim()) unmapped.push(headerCells[i].trim());
      continue;
    }
    const normalized = nameKey(headerCells[i]) ?? "";
    const field = ALIASES[normalized] ?? null;
    byColumnIndex[i] = field;
    if (field) mapped.add(field);
    else if (headerCells[i]?.trim()) unmapped.push(headerCells[i].trim());
  }

  const missing: DateGroupImportField[] = [];
  if (!mapped.has("vendor")) missing.push("vendor");
  if (!mapped.has("name")) missing.push("name");

  return { headerCells, byColumnIndex, missing, unmapped };
}

const monthDays = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parseDateGroupDate(
  input: string,
  kind: "manufacture" | "expiration",
  precisionHint?: string | null,
): { ok: true; date: InventoryDate | null } | { ok: false; error: string } {
  const value = input.trim();
  if (!value || value === "—" || value.toLowerCase() === "null") {
    return { ok: true, date: null };
  }

  // ISO format: YYYY-MM-DD or YYYY-MM
  const isoMatch = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    if (year < 1000 || year > 9999 || month < 1 || month > 12) {
      return { ok: false, error: "Invalid date format." };
    }
    const day = isoMatch[3]
      ? Number(isoMatch[3])
      : kind === "expiration"
        ? monthDays(year, month)
        : 1;
    if (day < 1 || day > monthDays(year, month)) {
      return { ok: false, error: "That day does not exist in this month." };
    }
    const precision: DatePrecision = isoMatch[3]
      ? "day"
      : precisionHint === "day"
        ? "day"
        : "month";
    return { ok: true, date: { date: iso(year, month, day), precision } };
  }

  // Slash format: MM/DD/YYYY, MM/DD/YY, MM/YYYY, MM/YY
  try {
    const parsed = parseInventoryDate(value, kind);
    return { ok: true, date: parsed };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Use MM/DD/YYYY, MM/YYYY, or YYYY-MM-DD.",
    };
  }
}

export type DateGroupAction =
  | "create"
  | "update"
  | "unchanged"
  | "skip"
  | "error";

export type DateGroupPlanRow = {
  rowNumber: number;
  action: DateGroupAction;
  reason: string | null;
  productId: string | null;
  productName: string | null;
  vendorName: string | null;
  size: string | null;
  unit: string | null;
  dateGroupId: string | null;
  quantity: number | null;
  manufacture: InventoryDate | null;
  expiration: InventoryDate | null;
  notes: string | null;
  changes: string[];
};

export type DateGroupPlanSummary = {
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  error: number;
};

export type DateGroupPlan = {
  rows: DateGroupPlanRow[];
  summary: DateGroupPlanSummary;
  canCommit: boolean;
};

export type DateGroupImportCatalog = Pick<
  CatalogState,
  "vendors" | "products" | "dateLots"
>;

export function buildDateGroupImportPlan(
  records: readonly CsvRecord[],
  header: DateGroupHeaderMapping,
  catalog: DateGroupImportCatalog,
): DateGroupPlan {
  const readCell = (record: CsvRecord, field: DateGroupImportField): string => {
    for (const [idxStr, mapped] of Object.entries(header.byColumnIndex)) {
      if (mapped === field) {
        return record.cells[Number(idxStr)] ?? "";
      }
    }
    return "";
  };

  const rows: DateGroupPlanRow[] = [];
  const existingLots = catalog.dateLots ?? [];

  for (const record of records) {
    const vendorText = cleanText(readCell(record, "vendor"));
    const nameText = cleanText(readCell(record, "name"));
    const sizeText = cleanText(readCell(record, "size"));
    const unitText = cleanText(readCell(record, "unit"));
    const lotIdText = cleanText(readCell(record, "dateGroupId"));
    const quantityText = cleanText(readCell(record, "datedQuantity"));
    const mfgText = cleanText(readCell(record, "manufactured"));
    const mfgPrecText = cleanText(readCell(record, "manufacturePrecision"));
    const expText = cleanText(readCell(record, "expires"));
    const expPrecText = cleanText(readCell(record, "expirationPrecision"));
    const notesText = readCell(record, "notes").trim();

    // Entirely blank row -> skip
    if (
      !vendorText &&
      !nameText &&
      !sizeText &&
      !unitText &&
      !lotIdText &&
      !quantityText &&
      !mfgText &&
      !expText &&
      !notesText
    ) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "skip",
        reason: "Row is empty.",
        productId: null,
        productName: null,
        vendorName: null,
        size: null,
        unit: null,
        dateGroupId: null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    if (!vendorText) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: "Vendor is required.",
        productId: null,
        productName: nameText || null,
        vendorName: null,
        size: sizeText || null,
        unit: unitText || null,
        dateGroupId: lotIdText || null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    if (!nameText) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: "Name is required.",
        productId: null,
        productName: null,
        vendorName: vendorText,
        size: sizeText || null,
        unit: unitText || null,
        dateGroupId: lotIdText || null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    // 1. Match vendor
    const vKey = nameKey(vendorText);
    const vendor = catalog.vendors.find((v) => nameKey(v.name) === vKey);
    if (!vendor) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: `Vendor “${vendorText}” not found.`,
        productId: null,
        productName: nameText,
        vendorName: vendorText,
        size: sizeText || null,
        unit: unitText || null,
        dateGroupId: lotIdText || null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    // 2. Match product
    const nKey = nameKey(nameText);
    const candidateProducts = catalog.products.filter(
      (p) => p.vendorId === vendor.id && nameKey(p.name) === nKey,
    );

    let product: ProductView | null = null;
    if (candidateProducts.length === 1) {
      product = candidateProducts[0];
    } else if (candidateProducts.length > 1) {
      if (sizeText) {
        const sK = sizeKey(sizeText);
        product = candidateProducts.find((p) => sizeKey(p.size) === sK) ?? null;
      }
      if (!product && unitText) {
        const uK = nameKey(unitText);
        product =
          candidateProducts.find(
            (p) => nameKey(p.unitLabel ?? p.unitType) === uK,
          ) ?? null;
      }
    }

    if (!product) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: `Product “${nameText}” ${sizeText ? `(${sizeText}) ` : ""}not found for vendor “${vendor.name}”.`,
        productId: null,
        productName: nameText,
        vendorName: vendor.name,
        size: sizeText || null,
        unit: unitText || null,
        dateGroupId: lotIdText || null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    if (!product.active) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: `Product “${product.name}” is archived. Reactivate it first.`,
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: lotIdText || null,
        quantity: null,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    // 3. Parse quantity
    let quantity: number | null = null;
    if (quantityText) {
      const qParse = parseQuantityInput(quantityText, {
        allowBlank: true,
        label: "Dated quantity",
      });
      if (!qParse.ok) {
        rows.push({
          rowNumber: record.rowNumber,
          action: "error",
          reason: qParse.error,
          productId: product.id,
          productName: product.name,
          vendorName: vendor.name,
          size: product.size,
          unit: product.unitLabel ?? product.unitType,
          dateGroupId: lotIdText || null,
          quantity: null,
          manufacture: null,
          expiration: null,
          notes: null,
          changes: [],
        });
        continue;
      }
      quantity = qParse.value;
    }

    // 4. Parse dates
    const mfgParse = parseDateGroupDate(mfgText, "manufacture", mfgPrecText);
    if (!mfgParse.ok) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: `Manufacture date: ${mfgParse.error}`,
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: lotIdText || null,
        quantity,
        manufacture: null,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    const expParse = parseDateGroupDate(expText, "expiration", expPrecText);
    if (!expParse.ok) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: `Expiration date: ${expParse.error}`,
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: lotIdText || null,
        quantity,
        manufacture: mfgParse.date,
        expiration: null,
        notes: null,
        changes: [],
      });
      continue;
    }

    const manufacture = mfgParse.date;
    const expiration = expParse.date;

    if (!manufacture && !expiration) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "skip",
        reason: "Neither manufacture nor expiration date provided.",
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: lotIdText || null,
        quantity,
        manufacture: null,
        expiration: null,
        notes: notesText || null,
        changes: [],
      });
      continue;
    }

    if (
      manufacture &&
      expiration &&
      calendarDays(manufacture.date, expiration.date) < 0
    ) {
      rows.push({
        rowNumber: record.rowNumber,
        action: "error",
        reason: "Expiration date cannot be before manufacture date.",
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: lotIdText || null,
        quantity,
        manufacture,
        expiration,
        notes: notesText || null,
        changes: [],
      });
      continue;
    }

    // 5. Match lot ID if provided
    let existingLot: DateLot | null = null;
    if (lotIdText) {
      existingLot = existingLots.find((l) => l.id === lotIdText) ?? null;
      if (!existingLot) {
        rows.push({
          rowNumber: record.rowNumber,
          action: "error",
          reason: `Date group ID “${lotIdText}” not found in this branch.`,
          productId: product.id,
          productName: product.name,
          vendorName: vendor.name,
          size: product.size,
          unit: product.unitLabel ?? product.unitType,
          dateGroupId: lotIdText,
          quantity,
          manufacture,
          expiration,
          notes: notesText || null,
          changes: [],
        });
        continue;
      }
      if (existingLot.productId !== product.id) {
        rows.push({
          rowNumber: record.rowNumber,
          action: "error",
          reason: `Date group ID “${lotIdText}” belongs to a different product.`,
          productId: product.id,
          productName: product.name,
          vendorName: vendor.name,
          size: product.size,
          unit: product.unitLabel ?? product.unitType,
          dateGroupId: lotIdText,
          quantity,
          manufacture,
          expiration,
          notes: notesText || null,
          changes: [],
        });
        continue;
      }
    }

    const notes = notesText || null;
    const changes: string[] = [];

    if (existingLot) {
      if (existingLot.quantity !== quantity) {
        changes.push(
          `Quantity: ${existingLot.quantity ?? "none"} → ${quantity ?? "none"}`,
        );
      }
      if (
        existingLot.manufacture?.date !== manufacture?.date ||
        existingLot.manufacture?.precision !== manufacture?.precision
      ) {
        changes.push(
          `Mfg: ${displayInventoryDate(existingLot.manufacture)} → ${displayInventoryDate(manufacture)}`,
        );
      }
      if (
        existingLot.expiration?.date !== expiration?.date ||
        existingLot.expiration?.precision !== expiration?.precision
      ) {
        changes.push(
          `Exp: ${displayInventoryDate(existingLot.expiration)} → ${displayInventoryDate(expiration)}`,
        );
      }
      if ((existingLot.notes ?? null) !== notes) {
        changes.push("Notes updated");
      }

      const action = changes.length > 0 ? "update" : "unchanged";
      rows.push({
        rowNumber: record.rowNumber,
        action,
        reason:
          action === "unchanged" ? "All values match existing record." : null,
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: existingLot.id,
        quantity,
        manufacture,
        expiration,
        notes,
        changes,
      });
    } else {
      if (quantity !== null) changes.push(`Qty: ${quantity}`);
      if (manufacture)
        changes.push(`Mfg: ${displayInventoryDate(manufacture)}`);
      if (expiration) changes.push(`Exp: ${displayInventoryDate(expiration)}`);
      if (notes) changes.push("Notes added");

      rows.push({
        rowNumber: record.rowNumber,
        action: "create",
        reason: null,
        productId: product.id,
        productName: product.name,
        vendorName: vendor.name,
        size: product.size,
        unit: product.unitLabel ?? product.unitType,
        dateGroupId: null,
        quantity,
        manufacture,
        expiration,
        notes,
        changes,
      });
    }
  }

  const summary: DateGroupPlanSummary = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    unchanged: rows.filter((r) => r.action === "unchanged").length,
    skip: rows.filter((r) => r.action === "skip").length,
    error: rows.filter((r) => r.action === "error").length,
  };

  const canCommit =
    summary.error === 0 && (summary.create > 0 || summary.update > 0);

  return { rows, summary, canCommit };
}

export function fingerprintDateGroupPlan(plan: DateGroupPlan): string {
  const payload = plan.rows
    .map(
      (r) =>
        `${r.rowNumber}:${r.action}:${r.productId}:${r.dateGroupId}:${r.quantity}:${r.manufacture?.date}:${r.expiration?.date}`,
    )
    .join(";");
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `dg_${Math.abs(hash).toString(16)}`;
}
