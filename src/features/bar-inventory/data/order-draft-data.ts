import "server-only";

import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";

import type {
  OrderDraftLine,
  OrderDraftView,
} from "../domain/order-draft-view";

// PostgREST caps a response at 1,000 rows. Pages are explicit and a list that
// would still be cut off is reported as a failure, never silently truncated.
const PAGE = 1000;
const MAX_PAGES = 10;
// Draft ids per `in (...)` filter, so the request URL stays short.
const DRAFT_ID_CHUNK = 40;

type DraftRow = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_note: string | null;
  version: number;
  updated_at: string;
  updated_by: string;
};

type ItemRow = {
  draft_id: string;
  product_id: string;
  product_name: string;
  size: string | null;
  unit: string;
  sku: string | null;
  suggested_qty: number | null;
  total_at_snapshot: number;
  par_at_snapshot: number | null;
  status_at_snapshot: string;
  order_qty: number | null;
  included: boolean;
  item_note: string | null;
};

const DRAFT_COLUMNS =
  "id, vendor_id, vendor_name, vendor_note, version, updated_at, updated_by";
const ITEM_COLUMNS =
  "draft_id, product_id, product_name, size, unit, sku, suggested_qty, total_at_snapshot, par_at_snapshot, status_at_snapshot, order_qty, included, item_note";

const num = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

/**
 * The location's ACTIVE (status = draft) order drafts with their lines, read
 * under the caller's own access: RLS (not this function) decides what comes
 * back, so staff and other tenants get nothing. Null on any read failure.
 */
export async function getActiveOrderDrafts(
  organizationId: string,
  locationId: string,
): Promise<OrderDraftView[] | null> {
  const supabase = await createClient();

  const draftRows: DraftRow[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      console.error("getActiveOrderDrafts: too many drafts to list");
      return null;
    }
    const { data, error } = await supabase
      .from("inventory_order_drafts")
      .select(DRAFT_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("status", "draft")
      .order("vendor_name", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
      .overrideTypes<DraftRow[], { merge: false }>();
    if (error || !data) {
      console.error("getActiveOrderDrafts: drafts", error);
      return null;
    }
    draftRows.push(...data);
    if (data.length < PAGE) break;
  }
  if (draftRows.length === 0) return [];

  const itemRows: ItemRow[] = [];
  for (let at = 0; at < draftRows.length; at += DRAFT_ID_CHUNK) {
    const ids = draftRows.slice(at, at + DRAFT_ID_CHUNK).map((d) => d.id);
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        console.error("getActiveOrderDrafts: too many lines to list");
        return null;
      }
      const { data, error } = await supabase
        .from("inventory_order_draft_items")
        .select(ITEM_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .in("draft_id", ids)
        .order("draft_id", { ascending: true })
        .order("product_id", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
        .overrideTypes<ItemRow[], { merge: false }>();
      if (error || !data) {
        console.error("getActiveOrderDrafts: items", error);
        return null;
      }
      itemRows.push(...data);
      if (data.length < PAGE) break;
    }
  }

  const roster = await getOrganizationRoster(organizationId);
  const names = new Map(roster.map((member) => [member.id, member.name]));

  const linesByDraft = new Map<string, OrderDraftLine[]>();
  for (const row of itemRows) {
    const line: OrderDraftLine = {
      productId: row.product_id,
      name: row.product_name,
      size: row.size,
      unit: row.unit,
      sku: row.sku,
      suggestedQty: num(row.suggested_qty),
      totalAtSnapshot: Number(row.total_at_snapshot),
      parAtSnapshot: num(row.par_at_snapshot),
      statusAtSnapshot: row.status_at_snapshot,
      orderQty: num(row.order_qty),
      included: row.included,
      itemNote: row.item_note,
    };
    const list = linesByDraft.get(row.draft_id);
    if (list) list.push(line);
    else linesByDraft.set(row.draft_id, [line]);
  }

  return draftRows.map(
    (row): OrderDraftView => ({
      id: row.id,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      status: "draft",
      vendorNote: row.vendor_note,
      version: row.version,
      updatedAt: row.updated_at,
      updatedByName: names.get(row.updated_by) ?? null,
      lines: linesByDraft.get(row.id) ?? [],
    }),
  );
}
