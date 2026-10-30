"use server";

import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getCurrentUser } from "@/lib/current-user";
import {
  EXPORT_MIME,
  sheetToCsv,
  type ExportFormat,
} from "@/lib/export/document";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { workbookToBuffer } from "@/lib/xlsx/write-node";

import { getCatalogSnapshot } from "../data/catalog-data";
import { getOrderDraftById } from "../data/order-draft-data";
import {
  getHistoryEntries,
  HISTORY_ROW_LIMIT,
  ITEM_HISTORY_LIMIT,
} from "../data/history-data";
import {
  catalogCommandSchema,
  type CatalogCommand,
} from "../domain/catalog-commands";
import { daysBetween } from "../domain/analytics";
import { conflictFrom, type RpcError } from "../domain/db-conflict";
import { friendlyDbMessage } from "../domain/db-error";
import {
  exportNeedsLedger,
  prepareExport,
  type ExportRequest,
} from "../domain/exports";
import {
  hasPurchaseLines,
  NOTHING_TO_SEND_MESSAGE,
  orderDraftExportRequestSchema,
} from "../domain/order-draft-share";
import {
  isInventoryManager,
  type CatalogConflict,
  type CatalogSnapshot,
  type HistoryEntry,
} from "../domain/inventory-types";
import type { OrderDraftView } from "../domain/order-draft-view";

export type InventoryActionResult =
  | { ok: true; data: CatalogSnapshot }
  | {
      ok: false;
      error: string;
      conflict?: CatalogConflict;
      sessionInvalid?: true;
    };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Supabase = Awaited<ReturnType<typeof createClient>>;
type CommandArgs = { p_organization_id: string; p_location_id: string };

async function runCommand(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  command: CatalogCommand,
): Promise<RpcError | null> {
  const base: CommandArgs = {
    p_organization_id: organizationId,
    p_location_id: locationId,
  };
  // PostgREST needs every named argument: always send explicit nulls.
  switch (command.type) {
    case "savedViewSave":
      return (
        await supabase.rpc("inventory_saved_view_save", {
          ...base,
          p_id: command.id,
          p_name: command.name,
          p_payload: command.payload,
          p_is_default: command.isDefault,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "savedViewDelete":
      return (
        await supabase.rpc("inventory_saved_view_delete", {
          ...base,
          p_id: command.id,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "bulkCount":
      return (
        await supabase.rpc("inventory_bulk_count", {
          ...base,
          p_rows: command.rows,
          p_reason: command.reason,
          p_note: command.note,
        })
      ).error;
    case "dateLotSave":
      return (
        await supabase.rpc("inventory_date_lot_save", {
          ...base,
          p_id: command.id,
          p_product_id: command.productId,
          p_quantity: command.quantity,
          p_manufacture_date: command.manufacture?.date ?? null,
          p_manufacture_precision: command.manufacture?.precision ?? null,
          p_expiration_date: command.expiration?.date ?? null,
          p_expiration_precision: command.expiration?.precision ?? null,
          p_notes: command.notes,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "freshnessRuleSave":
      return (
        await supabase.rpc("inventory_freshness_rule_save", {
          ...base,
          p_id: command.id,
          p_subcategory_id: command.subcategoryId,
          p_tracking_enabled: command.trackingEnabled,
          p_maximum_months: command.maximumMonths,
          p_warning_months: command.warningMonths,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "vendorCreate":
      return (
        await supabase.rpc("inventory_vendor_create", {
          ...base,
          p_name: command.name,
          p_notes: command.notes,
        })
      ).error;
    case "vendorUpdate":
      return (
        await supabase.rpc("inventory_vendor_update", {
          ...base,
          p_vendor_id: command.id,
          p_name: command.name,
          p_notes: command.notes,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "vendorSetActive":
      return (
        await supabase.rpc("inventory_vendor_set_active", {
          ...base,
          p_vendor_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "categoryCreate":
      return (
        await supabase.rpc("inventory_category_create", {
          ...base,
          p_name: command.name,
        })
      ).error;
    case "categoryUpdate":
      return (
        await supabase.rpc("inventory_category_update", {
          ...base,
          p_category_id: command.id,
          p_name: command.name,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "categorySetActive":
      return (
        await supabase.rpc("inventory_category_set_active", {
          ...base,
          p_category_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "subcategoryCreate":
      return (
        await supabase.rpc("inventory_subcategory_create", {
          ...base,
          p_category_id: command.categoryId,
          p_name: command.name,
        })
      ).error;
    case "subcategoryUpdate":
      return (
        await supabase.rpc("inventory_subcategory_update", {
          ...base,
          p_subcategory_id: command.id,
          p_name: command.name,
          p_category_id: command.categoryId,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "subcategorySetActive":
      return (
        await supabase.rpc("inventory_subcategory_set_active", {
          ...base,
          p_subcategory_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "productCreate": {
      const i = command.input;
      return (
        await supabase.rpc("inventory_product_create", {
          ...base,
          p_vendor_id: i.vendorId,
          p_name: i.name,
          p_category_id: i.categoryId,
          p_subcategory_id: i.subcategoryId,
          p_size: i.size,
          p_unit_type: i.unitType,
          p_unit_label: i.unitLabel,
          p_sku: i.sku,
          p_notes: i.notes,
        })
      ).error;
    }
    case "productUpdate": {
      const i = command.input;
      return (
        await supabase.rpc("inventory_product_update", {
          ...base,
          p_product_id: command.id,
          p_vendor_id: i.vendorId,
          p_name: i.name,
          p_category_id: i.categoryId,
          p_subcategory_id: i.subcategoryId,
          p_size: i.size,
          p_unit_type: i.unitType,
          p_unit_label: i.unitLabel,
          p_sku: i.sku,
          p_notes: i.notes,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    }
    case "productSetActive":
      return (
        await supabase.rpc("inventory_product_set_active", {
          ...base,
          p_product_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "stockAdjust":
      return (
        await supabase.rpc("inventory_stock_adjust", {
          ...base,
          p_product_id: command.productId,
          p_mode: command.mode,
          p_on_hand: command.onHand,
          p_backup: command.backup,
          p_reason: command.reason,
          p_note: command.note,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "stockSetLevels":
      return (
        await supabase.rpc("inventory_stock_set_levels", {
          ...base,
          p_product_id: command.productId,
          p_cutoff: command.cutoff,
          p_warning: command.warning,
          p_par: command.par,
          p_expected_version: command.expectedVersion,
        })
      ).error;
  }
}

async function resolveManager(restaurantSlug: string) {
  const user = await getCurrentUser(restaurantSlug);
  if (!user) {
    return {
      ok: false as const,
      error: "You need to sign in to use Bar Inventory.",
    };
  }
  if (!isInventoryManager(user.designation)) {
    return {
      ok: false as const,
      error: "Bar Inventory is not available for your role.",
    };
  }
  return { ok: true as const, organizationId: user.organizationId };
}

/**
 * Authoritative read. Called on mount, on window focus and after conflicts so
 * a stale screen always recovers from the database (notify-and-refetch).
 */
export async function getCatalogSnapshotAction(input: {
  restaurantSlug: string;
}): Promise<InventoryActionResult> {
  const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(parsed.data.restaurantSlug);
  if (!caller.ok) return caller;

  const snapshot = await getCatalogSnapshot(caller.organizationId);
  if (!snapshot)
    return { ok: false, error: "Bar Inventory could not be loaded." };
  return { ok: true, data: snapshot };
}

/**
 * One validated write, then the authoritative snapshot. The client never
 * treats its own optimistic state as truth.
 */
export async function runCatalogCommandAction(input: {
  restaurantSlug: string;
  command: CatalogCommand;
}): Promise<InventoryActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, command: catalogCommandSchema })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That request is invalid.",
    };
  }

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(parsed.data.restaurantSlug);
  if (!caller.ok) return caller;

  const location = await getPrimaryLocation(caller.organizationId);
  if (!location) return { ok: false, error: "No location is set up yet." };

  const failure = await runCommand(
    supabase,
    caller.organizationId,
    location.id,
    parsed.data.command,
  );
  if (failure) {
    return {
      ok: false,
      error: friendlyDbMessage(failure),
      conflict: conflictFrom(failure),
    };
  }

  const snapshot = await getCatalogSnapshot(caller.organizationId);
  if (!snapshot)
    return { ok: false, error: "Bar Inventory could not be loaded." };
  return { ok: true, data: snapshot };
}

export type HistoryActionResult =
  | { ok: true; entries: HistoryEntry[]; truncated: boolean }
  | { ok: false; error: string; sessionInvalid?: true };

/** How far back the History view may read (days; 0 = everything, up to the row limit). Not exported: a "use server" file may only export async functions. */
const HISTORY_RANGES = [30, 90, 365, 0] as const;

const MS_PER_DAY = 86_400_000;

/**
 * Inventory history from the immutable ledger, newest first. With a
 * `productId` it is that one item's latest changes (the item sheet);
 * otherwise it is the whole location over the chosen range (the History view).
 */
export async function getHistoryAction(input: {
  restaurantSlug: string;
  days: number;
  productId: string | null;
}): Promise<HistoryActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      days: z
        .number()
        .refine((n) => (HISTORY_RANGES as readonly number[]).includes(n)),
      productId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(parsed.data.restaurantSlug);
  if (!caller.ok) return caller;

  const { days, productId } = parsed.data;
  const page = await getHistoryEntries(caller.organizationId, {
    since:
      productId || days === 0
        ? null
        : new Date(Date.now() - days * MS_PER_DAY).toISOString(),
    productId,
    limit: productId ? ITEM_HISTORY_LIMIT : HISTORY_ROW_LIMIT,
  });
  if (!page) return { ok: false, error: "History could not be loaded." };
  return { ok: true, ...page };
}

export type ExportActionResult =
  | {
      ok: true;
      filename: string;
      mime: string;
      /** Text for CSV; base64 for the binary .xlsx. */
      encoding: "text" | "base64";
      content: string;
    }
  | { ok: false; error: string; sessionInvalid?: true };

const filtersSchema = z.string().max(2000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_ANALYTICS_SPAN_DAYS = 400;

const exportRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inventory"), filters: filtersSchema }),
  z.object({
    kind: z.literal("history"),
    filters: filtersSchema,
    days: z
      .number()
      .refine((n) => (HISTORY_RANGES as readonly number[]).includes(n)),
  }),
  z.object({ kind: z.literal("recommendations"), filters: filtersSchema }),
  z.object({ kind: z.literal("date_groups"), filters: filtersSchema }),
  // Only the draft id: the server loads the draft and its lines itself.
  orderDraftExportRequestSchema,
  z.object({
    kind: z.literal("analytics"),
    filters: filtersSchema,
    window: z.object({ from: dateSchema, to: dateSchema }),
    includeObserved: z.boolean(),
    includeShrink: z.boolean(),
  }),
]);

/**
 * One export (inventory, history, order recommendations, one order draft or
 * analytics) as CSV
 * or XLSX. The browser sends only WHAT to export and the table's filter
 * string. The rows come from the database under the caller's own access and
 * the filters are re-applied here, so a file can only hold rows the caller may
 * see and always matches the screen; the client never supplies rows.
 */
export async function exportDataAction(input: {
  restaurantSlug: string;
  format: ExportFormat;
  request: ExportRequest;
}): Promise<ExportActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      format: z.enum(["csv", "xlsx"]),
      request: exportRequestSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const { restaurantSlug, format, request } = parsed.data;
  if (
    request.kind === "analytics" &&
    (request.window.from > request.window.to ||
      daysBetween(request.window.from, request.window.to) >
        MAX_ANALYTICS_SPAN_DAYS)
  ) {
    return { ok: false, error: "Choose a valid date range." };
  }

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(restaurantSlug);
  if (!caller.ok) return caller;

  const location = await getPrimaryLocation(caller.organizationId);
  if (!location) return { ok: false, error: "No location is set up yet." };
  const snapshot = await getCatalogSnapshot(caller.organizationId);
  if (!snapshot)
    return { ok: false, error: "Bar Inventory could not be loaded." };

  const now = new Date();
  let orderDraft: OrderDraftView | null = null;
  if (request.kind === "order_draft") {
    // Bound to this organization and location and read under the caller's own
    // access: another tenant's draft id finds nothing.
    const found = await getOrderDraftById(
      caller.organizationId,
      location.id,
      request.draftId,
    );
    if (found.failed) {
      return { ok: false, error: "That order could not be loaded." };
    }
    if (!found.draft) {
      return { ok: false, error: "That order draft is not available." };
    }
    if (!hasPurchaseLines(found.draft.lines)) {
      return { ok: false, error: NOTHING_TO_SEND_MESSAGE };
    }
    orderDraft = found.draft;
  }
  let entries: HistoryEntry[] = [];
  if (exportNeedsLedger(request.kind)) {
    const days = request.kind === "history" ? request.days : 365;
    const page = await getHistoryEntries(caller.organizationId, {
      since:
        days === 0
          ? null
          : new Date(now.getTime() - days * MS_PER_DAY).toISOString(),
      productId: null,
      limit: HISTORY_ROW_LIMIT,
    });
    if (!page) return { ok: false, error: "History could not be loaded." };
    entries = page.entries;
  }

  const file = prepareExport(
    request,
    { catalog: snapshot, entries, orderDraft },
    { timeZone: location.time_zone, now, slug: restaurantSlug },
    format,
  );
  return format === "csv"
    ? {
        ok: true,
        filename: file.filename,
        mime: EXPORT_MIME.csv,
        encoding: "text",
        content: sheetToCsv(file.document.csv),
      }
    : {
        ok: true,
        filename: file.filename,
        mime: EXPORT_MIME.xlsx,
        encoding: "base64",
        content: (await workbookToBuffer(file.document.sheets)).toString(
          "base64",
        ),
      };
}
