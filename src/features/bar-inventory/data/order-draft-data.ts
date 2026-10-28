import "server-only";

import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";

import {
  SENT_PAGE_SIZE,
  sentPageRange,
  summarizeSent,
  type SentDraftPage,
} from "../domain/order-draft-sent";
import type {
  OrderDraftLine,
  OrderDraftView,
} from "../domain/order-draft-view";

// PostgREST caps a response at 1,000 rows. Pages are explicit and a list that
// would still be cut off is reported as a failure, never silently truncated.
const PAGE = 1000;
const MAX_PAGES = 10;
// PostgREST error for a range that starts past the last row.
const PAST_THE_END = "PGRST103";
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
  status: "draft" | "sent";
  sent_at: string | null;
  sent_by: string | null;
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
  "id, vendor_id, vendor_name, vendor_note, version, updated_at, updated_by, status, sent_at, sent_by";
const ITEM_COLUMNS =
  "draft_id, product_id, product_name, size, unit, sku, suggested_qty, total_at_snapshot, par_at_snapshot, status_at_snapshot, order_qty, included, item_note";

const num = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The lines of the given drafts, read in explicit pages. Null on any failure. */
async function loadItems(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  draftIds: readonly string[],
): Promise<ItemRow[] | null> {
  const itemRows: ItemRow[] = [];
  for (let at = 0; at < draftIds.length; at += DRAFT_ID_CHUNK) {
    const ids = draftIds.slice(at, at + DRAFT_ID_CHUNK);
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        console.error("order drafts: too many lines to list");
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
        console.error("order drafts: items", error);
        return null;
      }
      itemRows.push(...data);
      if (data.length < PAGE) break;
    }
  }
  return itemRows;
}

function assemble(
  draftRows: readonly DraftRow[],
  itemRows: readonly ItemRow[],
  names: ReadonlyMap<string, string>,
): OrderDraftView[] {
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
      status: row.status,
      vendorNote: row.vendor_note,
      version: row.version,
      updatedAt: row.updated_at,
      updatedByName: names.get(row.updated_by) ?? null,
      sentAt: row.sent_at,
      sentByName: row.sent_by ? (names.get(row.sent_by) ?? null) : null,
      lines: linesByDraft.get(row.id) ?? [],
    }),
  );
}

async function rosterNames(organizationId: string) {
  const roster = await getOrganizationRoster(organizationId);
  return new Map(roster.map((member) => [member.id, member.name]));
}

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

  const itemRows = await loadItems(
    supabase,
    organizationId,
    locationId,
    draftRows.map((d) => d.id),
  );
  if (!itemRows) return null;
  return assemble(draftRows, itemRows, await rosterNames(organizationId));
}

/**
 * One order draft (Draft or Sent) with its lines, under the caller's own
 * access and bound to the organization and location. Null when it does not
 * exist for this caller (another tenant's id is indistinguishable from none)
 * and also on a read failure; `failed` tells the two apart.
 */
export async function getOrderDraftById(
  organizationId: string,
  locationId: string,
  draftId: string,
): Promise<{ draft: OrderDraftView | null; failed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_order_drafts")
    .select(DRAFT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("id", draftId)
    .limit(1)
    .overrideTypes<DraftRow[], { merge: false }>();
  if (error || !data) {
    console.error("getOrderDraftById: draft", error);
    return { draft: null, failed: true };
  }
  const row = data[0];
  if (!row) return { draft: null, failed: false };
  const itemRows = await loadItems(supabase, organizationId, locationId, [
    row.id,
  ]);
  if (!itemRows) return { draft: null, failed: true };
  const [draft] = assemble([row], itemRows, await rosterNames(organizationId));
  return { draft: draft ?? null, failed: false };
}

/**
 * One page of the Sent history, newest first (sent_at, then id, so a page
 * boundary never repeats or skips an order). The page is an explicit range
 * and the total comes from an exact count, so history is never silently cut
 * at the API's 1,000-row cap. A page past the end is clamped to the last one.
 */
export async function getSentOrderDraftsPage(
  organizationId: string,
  locationId: string,
  requestedPage: number,
): Promise<SentDraftPage | null> {
  const supabase = await createClient();

  async function readPage(page: number) {
    const [from, to] = sentPageRange(page, SENT_PAGE_SIZE);
    return supabase
      .from("inventory_order_drafts")
      .select(DRAFT_COLUMNS, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .overrideTypes<DraftRow[], { merge: false }>();
  }

  async function countSent(): Promise<number | null> {
    const { count, error } = await supabase
      .from("inventory_order_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("status", "sent");
    if (error || count === null) {
      console.error("getSentOrderDraftsPage: count", error);
      return null;
    }
    return count;
  }

  let page = Math.max(0, Math.floor(requestedPage));
  let result = await readPage(page);
  // Past the end (a stale link or a typed page number): show the last page.
  // PostgREST does not answer such a range with an empty page: it refuses it
  // (416, PGRST103, "Requested range not satisfiable") and sends no count.
  const refused = result.error?.code === PAST_THE_END;
  if (
    refused ||
    (!result.error && result.data?.length === 0 && (result.count ?? 0) > 0)
  ) {
    const total = refused ? await countSent() : (result.count ?? 0);
    if (total === null) return null;
    if (total === 0) {
      return { drafts: [], page: 0, pageSize: SENT_PAGE_SIZE, total: 0 };
    }
    page = Math.ceil(total / SENT_PAGE_SIZE) - 1;
    result = await readPage(page);
  }
  const { data, error, count } = result;
  if (error || !data || count === null) {
    console.error("getSentOrderDraftsPage", error);
    return null;
  }
  if (data.length === 0) {
    return { drafts: [], page: 0, pageSize: SENT_PAGE_SIZE, total: 0 };
  }

  const itemRows = await loadItems(
    supabase,
    organizationId,
    locationId,
    data.map((d) => d.id),
  );
  if (!itemRows) return null;
  const drafts = assemble(data, itemRows, await rosterNames(organizationId));
  return {
    drafts: drafts.map(summarizeSent),
    page,
    pageSize: SENT_PAGE_SIZE,
    total: count,
  };
}
