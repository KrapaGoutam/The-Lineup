import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";

import type { HistoryEntry, HistorySource } from "../domain/inventory-types";
import type { AdjustmentReason } from "../domain/stock-rules";

/** Most rows one read returns; the caller is told when more exist. */
export const HISTORY_ROW_LIMIT = 5000;
export const ITEM_HISTORY_LIMIT = 25;

const COLUMNS =
  "id, created_at, product_id, source, reason, note, prev_on_hand, new_on_hand, prev_backup, new_backup, status_after, cutoff_at_time, actor_profile_id, import_batch_id";

type LedgerRow = {
  id: number;
  created_at: string;
  product_id: string;
  source: HistorySource;
  reason: AdjustmentReason;
  note: string | null;
  prev_on_hand: number;
  new_on_hand: number;
  prev_backup: number;
  new_backup: number;
  status_after: HistoryEntry["statusAfter"];
  cutoff_at_time: number | null;
  actor_profile_id: string;
  import_batch_id: string | null;
};

export type HistoryPage = { entries: HistoryEntry[]; truncated: boolean };

/**
 * Ledger rows for the caller's organization and primary location, newest
 * first. RLS (not this function) decides what comes back: staff and other
 * tenants get nothing. `since` bounds the range; `productId` narrows to one
 * item; the read asks for one row more than the limit to know if it was cut.
 */
export async function getHistoryEntries(
  organizationId: string,
  options: { since: string | null; productId: string | null; limit: number },
): Promise<HistoryPage | null> {
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;
  const supabase = await createClient();

  let query = supabase
    .from("inventory_adjustments")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("location_id", location.id);
  if (options.since) query = query.gte("created_at", options.since);
  if (options.productId) query = query.eq("product_id", options.productId);

  const [{ data, error }, roster] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(options.limit + 1)
      .overrideTypes<LedgerRow[], { merge: false }>(),
    getOrganizationRoster(organizationId),
  ]);
  if (error || !data) {
    console.error("getHistoryEntries", error);
    return null;
  }

  const names = new Map(roster.map((member) => [member.id, member.name]));
  const truncated = data.length > options.limit;
  return {
    truncated,
    entries: data.slice(0, options.limit).map(
      (row): HistoryEntry => ({
        id: String(row.id),
        at: row.created_at,
        productId: row.product_id,
        reason: row.reason,
        source: row.source,
        note: row.note,
        prevOnHand: Number(row.prev_on_hand),
        newOnHand: Number(row.new_on_hand),
        prevBackup: Number(row.prev_backup),
        newBackup: Number(row.new_backup),
        statusAfter: row.status_after,
        cutoffAtTime:
          row.cutoff_at_time === null ? null : Number(row.cutoff_at_time),
        actorName: names.get(row.actor_profile_id) ?? null,
        importBatchId: row.import_batch_id,
      }),
    ),
  };
}
