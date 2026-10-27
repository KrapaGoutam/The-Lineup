import { orderDraftTotals } from "./order-draft";
import type { OrderDraftView } from "./order-draft-view";
import { purchaseLines } from "./order-draft-share";

/**
 * Vendor Order Drafts -- Sent history. A Sent order is immutable and read-only;
 * the list is newest first and is read in explicit pages (never one unbounded
 * read: the API would silently cut it at 1,000 rows).
 */

export const SENT_PAGE_SIZE = 20;

/** One row of the Sent list. */
export type SentDraftSummary = {
  id: string;
  vendorId: string;
  vendorName: string;
  sentAt: string;
  sentByName: string | null;
  /** Lines actually ordered: Included with an Order Qty above zero. */
  lineCount: number;
  /** Quantities, never money. */
  plannedTotal: number;
  version: number;
};

export type SentDraftPage = {
  drafts: SentDraftSummary[];
  /** Zero-based. */
  page: number;
  pageSize: number;
  /** Every Sent order at the location, not just this page. */
  total: number;
};

export function summarizeSent(draft: OrderDraftView): SentDraftSummary {
  return {
    id: draft.id,
    vendorId: draft.vendorId,
    vendorName: draft.vendorName,
    sentAt: draft.sentAt ?? draft.updatedAt,
    sentByName: draft.sentByName,
    lineCount: purchaseLines(draft.lines).length,
    plannedTotal: orderDraftTotals(draft.lines).plannedTotal,
    version: draft.version,
  };
}

export const sentPageCount = (total: number, pageSize = SENT_PAGE_SIZE) =>
  Math.max(1, Math.ceil(total / pageSize));

/** The inclusive row range `[from, to]` of a zero-based page (PostgREST `range`). */
export const sentPageRange = (
  page: number,
  pageSize = SENT_PAGE_SIZE,
): [number, number] => [page * pageSize, page * pageSize + pageSize - 1];

/** Newest first; the id breaks ties so paging is stable. */
export const compareSentNewestFirst = (
  a: Pick<SentDraftSummary, "sentAt" | "id">,
  b: Pick<SentDraftSummary, "sentAt" | "id">,
): number =>
  Date.parse(b.sentAt) - Date.parse(a.sentAt) || b.id.localeCompare(a.id);

/** The in-memory twin of the database page read (demo mode and tests). */
export function pageSentDrafts(
  drafts: readonly OrderDraftView[],
  page: number,
  pageSize = SENT_PAGE_SIZE,
): SentDraftPage {
  const sent = drafts
    .filter((d) => d.status === "sent")
    .map(summarizeSent)
    .toSorted(compareSentNewestFirst);
  const last = sentPageCount(sent.length, pageSize) - 1;
  const at = Math.min(Math.max(0, Math.floor(page)), last);
  const [from] = sentPageRange(at, pageSize);
  return {
    drafts: sent.slice(from, from + pageSize),
    page: at,
    pageSize,
    total: sent.length,
  };
}
