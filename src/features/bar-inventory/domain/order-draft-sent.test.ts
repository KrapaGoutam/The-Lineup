import { describe, expect, it } from "vitest";

import {
  compareSentNewestFirst,
  pageSentDrafts,
  SENT_PAGE_SIZE,
  sentPageCount,
  sentPageRange,
  summarizeSent,
} from "./order-draft-sent";
import type { OrderDraftLine, OrderDraftView } from "./order-draft-view";

const line = (over: Partial<OrderDraftLine> = {}): OrderDraftLine => ({
  productId: "p1",
  name: "Bacardi",
  size: "750ml",
  unit: "Bottle",
  sku: null,
  suggestedQty: 8,
  totalAtSnapshot: 4,
  parAtSnapshot: 12,
  statusAtSnapshot: "critical",
  orderQty: 6,
  included: true,
  itemNote: null,
  ...over,
});

const sent = (
  n: number,
  over: Partial<OrderDraftView> = {},
): OrderDraftView => ({
  id: `sent-${String(n).padStart(4, "0")}`,
  vendorId: "v1",
  vendorName: `Vendor ${n}`,
  status: "sent",
  vendorNote: null,
  version: 2,
  updatedAt: "2026-10-01T00:00:00Z",
  updatedByName: "Mia",
  // One order per minute, so a higher n is newer.
  sentAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
  sentByName: "Mia",
  lines: [line()],
  ...over,
});

describe("summarizeSent (VOD-080)", () => {
  it("counts only lines actually ordered and totals quantities exactly", () => {
    const summary = summarizeSent(
      sent(1, {
        lines: [
          line({ productId: "a", orderQty: 0.1 }),
          line({ productId: "b", orderQty: 0.2 }),
          line({ productId: "c", orderQty: 5, included: false }),
          line({ productId: "d", orderQty: null }),
          line({ productId: "e", orderQty: 0 }),
        ],
      }),
    );
    expect(summary.lineCount).toBe(2);
    // Cents-exact: 0.1 + 0.2 is 0.3, not 0.30000000000000004.
    expect(summary.plannedTotal).toBe(0.3);
    expect(summary).toMatchObject({
      vendorName: "Vendor 1",
      sentByName: "Mia",
      version: 2,
    });
  });
});

describe("paging the Sent list (VOD-080)", () => {
  it("computes page counts and the inclusive row range", () => {
    expect(sentPageCount(0)).toBe(1);
    expect(sentPageCount(1)).toBe(1);
    expect(sentPageCount(SENT_PAGE_SIZE)).toBe(1);
    expect(sentPageCount(SENT_PAGE_SIZE + 1)).toBe(2);
    expect(sentPageCount(2500, 20)).toBe(125);
    expect(sentPageRange(0)).toEqual([0, SENT_PAGE_SIZE - 1]);
    expect(sentPageRange(2, 20)).toEqual([40, 59]);
  });

  it("orders newest first, with the id breaking exact ties", () => {
    const a = { sentAt: "2026-10-01T00:00:00Z", id: "a" };
    const b = { sentAt: "2026-10-01T00:00:00Z", id: "b" };
    const newer = { sentAt: "2026-10-02T00:00:00Z", id: "0" };
    expect(
      [a, newer, b].toSorted(compareSentNewestFirst).map((x) => x.id),
    ).toEqual(["0", "b", "a"]);
  });

  it("pages through well over 1,000 sent orders with no silent cut: every order appears exactly once, newest first", () => {
    const total = 2_345;
    const drafts = Array.from({ length: total }, (_, i) => sent(i + 1));
    // Drafts that are not Sent never appear in the history.
    drafts.push({
      ...sent(9_999),
      status: "draft",
      sentAt: null,
      sentByName: null,
    });

    const seen: string[] = [];
    const first = pageSentDrafts(drafts, 0);
    expect(first.total).toBe(total);
    expect(first.pageSize).toBe(SENT_PAGE_SIZE);
    for (let page = 0; page < sentPageCount(total); page++) {
      const result = pageSentDrafts(drafts, page);
      expect(result.page).toBe(page);
      seen.push(...result.drafts.map((d) => d.id));
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(seen[0]).toBe(sent(total).id);
    expect(seen.at(-1)).toBe(sent(1).id);
    expect(seen).toEqual(seen.toSorted().toReversed());
  });

  it("clamps a page past the end to the last page, and a negative page to the first", () => {
    const drafts = Array.from({ length: 45 }, (_, i) => sent(i + 1));
    const past = pageSentDrafts(drafts, 99);
    expect(past.page).toBe(2);
    expect(past.drafts).toHaveLength(5);
    expect(pageSentDrafts(drafts, -3).page).toBe(0);
    expect(pageSentDrafts([], 0)).toEqual({
      drafts: [],
      page: 0,
      pageSize: SENT_PAGE_SIZE,
      total: 0,
    });
  });
});
