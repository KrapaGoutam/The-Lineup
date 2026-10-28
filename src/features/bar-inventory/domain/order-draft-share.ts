import { z } from "zod";

import { formatBusinessDateTime } from "@/lib/date-time";
import type {
  ExportCell,
  ExportDocument,
  ExportSheet,
} from "@/lib/export/document";

import type { ProductView, VendorView } from "./inventory-types";
import { orderDraftTotals } from "./order-draft";
import {
  lineLabel,
  type OrderDraftLine,
  type OrderDraftView,
} from "./order-draft-view";
import { formatQuantity } from "./stock-rules";

/**
 * Vendor Order Drafts -- sharing. One definition of "what is on the order" for
 * Copy Order and the CSV/XLSX export: an INCLUDED line with an Order Qty above
 * zero. Excluded, blank and zero lines are never written as purchase lines.
 *
 * Copy Order is the vendor-facing text, so it never shows the Suggested Order.
 * The export is the manager's own record and does carry it (as the snapshot).
 */

/** The only thing the client says about an order export: which draft. */
export const orderDraftExportRequestSchema = z.object({
  kind: z.literal("order_draft"),
  draftId: z.string().uuid(),
});

export const NOTHING_TO_SEND_MESSAGE =
  "Add a quantity to at least one included line.";

/** Included lines with an Order Qty above zero, by name then size. */
export function purchaseLines(
  lines: readonly OrderDraftLine[],
): OrderDraftLine[] {
  return lines
    .filter(
      (line) => line.included && line.orderQty !== null && line.orderQty > 0,
    )
    .toSorted(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.size ?? "").localeCompare(b.size ?? ""),
    );
}

export const hasPurchaseLines = (lines: readonly OrderDraftLine[]): boolean =>
  purchaseLines(lines).length > 0;

/**
 * A DRAFT shows (and shares) the catalog's current names, sizes and SKUs and
 * the vendor's current name; a SENT order keeps the labels frozen when it was
 * sent, whatever the catalog says now.
 */
export function withLiveLabels(
  draft: OrderDraftView,
  catalog: {
    products: readonly Pick<ProductView, "id" | "name" | "size" | "sku">[];
    vendors: readonly Pick<VendorView, "id" | "name">[];
  },
): OrderDraftView {
  if (draft.status !== "draft") return draft;
  const products = new Map(catalog.products.map((p) => [p.id, p]));
  const vendor = catalog.vendors.find((v) => v.id === draft.vendorId);
  return {
    ...draft,
    vendorName: vendor?.name ?? draft.vendorName,
    lines: draft.lines.map((line) => {
      const product = products.get(line.productId);
      return product
        ? {
            ...line,
            name: product.name,
            size: product.size,
            sku: product.sku,
          }
        : line;
    }),
  };
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The vendor-facing plain text:
 *
 *   Republic National — Order Request
 *
 *   Bacardi 750ml — 6
 *   Modelo Case — 3 (Promo next week)
 *
 *   Notes:
 *   Deliver Thursday morning.
 */
export function copyOrderText(draft: OrderDraftView): string {
  const rows = purchaseLines(draft.lines).map((line) => {
    const note = line.itemNote ? oneLine(line.itemNote) : "";
    return `${lineLabel(line)} — ${formatQuantity(line.orderQty)}${note ? ` (${note})` : ""}`;
  });
  const parts = [`${draft.vendorName} — Order Request`, rows.join("\n")];
  if (draft.vendorNote && draft.vendorNote.trim() !== "") {
    parts.push(`Notes:\n${draft.vendorNote.trim()}`);
  }
  return parts.filter((part) => part !== "").join("\n\n");
}

const ORDER_HEADER = [
  "Vendor",
  "Item",
  "Size",
  "Unit",
  "SKU",
  "Suggested",
  "Order Qty",
  "Item Note",
] as const;

/**
 * The manager's record of one order: an Order sheet of the purchase lines and
 * a Summary sheet. CSV is the Order sheet alone. Formula-leading text is
 * neutralised by the shared writers, not here.
 */
export function orderDraftDocument(
  draft: OrderDraftView,
  ctx: { timeZone: string },
): { document: ExportDocument; rowCount: number } {
  const lines = purchaseLines(draft.lines);
  const order: ExportSheet = {
    name: "Order",
    header: ORDER_HEADER,
    rows: lines.map((line): ExportCell[] => [
      draft.vendorName,
      line.name,
      line.size,
      line.unit,
      line.sku,
      // A number only when a stored suggestion exists; never an invented one.
      line.suggestedQty === null ? "Order needed" : line.suggestedQty,
      line.orderQty,
      line.itemNote,
    ]),
  };

  const totals = orderDraftTotals(draft.lines);
  const sent = draft.status === "sent" && draft.sentAt !== null;
  const summary: ExportSheet = {
    name: "Summary",
    header: ["Field", "Value"],
    rows: [
      ["Vendor", draft.vendorName],
      ["Status", draft.status === "sent" ? "Sent" : "Draft"],
      ["Sent By", sent ? draft.sentByName : null],
      [
        "Sent At",
        sent ? formatBusinessDateTime(draft.sentAt!, ctx.timeZone) : null,
      ],
      ["Sent At (ISO)", sent ? draft.sentAt : null],
      ["Vendor Note", draft.vendorNote],
      ["Suggested Total", totals.suggestedTotal],
      ["Items With No Suggestion (Order Needed)", totals.orderNeededCount],
      ["Planned Total", totals.plannedTotal],
      ["Order Lines", lines.length],
    ],
  };

  return {
    document: { csv: order, sheets: [order, summary] },
    rowCount: lines.length,
  };
}

/** A filename-safe fragment of a vendor name ("Republic National" -> "republic-national"). */
export function vendorFileSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug === "" ? "vendor" : slug;
}
