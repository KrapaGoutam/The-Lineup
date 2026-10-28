import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrganizationRoster: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: mocks.getOrganizationRoster,
}));

import { SENT_PAGE_SIZE } from "../domain/order-draft-sent";
import {
  getActiveOrderDrafts,
  getOrderDraftById,
  getSentOrderDraftsPage,
} from "./order-draft-data";

type Call = { method: string; args: unknown[] };
type Reply = { data: unknown; error: unknown; count?: number | null };

/**
 * A recording stand-in for the Supabase query builder: every chained call is
 * kept, and awaiting the chain answers with whatever `answer` returns.
 */
function fakeClient(answer: (table: string, calls: Call[]) => Reply) {
  const reads: { table: string; calls: Call[] }[] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      const builder: Record<string, unknown> = {
        then(resolve: (value: Reply) => unknown) {
          reads.push({ table, calls });
          return Promise.resolve(answer(table, calls)).then(resolve);
        },
      };
      for (const method of [
        "select",
        "eq",
        "in",
        "order",
        "range",
        "limit",
        "overrideTypes",
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      return builder;
    },
  };
  return { client, reads };
}

const ORG = "org-1";
const LOC = "loc-1";
const MIA = "profile-mia";

const draftRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: `d-${n}`,
  vendor_id: "v1",
  vendor_name: `Vendor ${n}`,
  vendor_note: null,
  version: 2,
  updated_at: "2026-10-01T00:00:00Z",
  updated_by: MIA,
  status: "sent",
  sent_at: "2026-10-01T01:30:00Z",
  sent_by: MIA,
  ...over,
});
const itemRow = (draft: string, over: Record<string, unknown> = {}) => ({
  draft_id: draft,
  product_id: `p-${draft}`,
  product_name: "Bacardi",
  size: "750ml",
  unit: "Bottle",
  sku: null,
  suggested_qty: "8.00",
  total_at_snapshot: "4.00",
  par_at_snapshot: "12.00",
  status_at_snapshot: "critical",
  order_qty: "6.00",
  included: true,
  item_note: null,
  ...over,
});

const filters = (calls: Call[]) =>
  calls
    .filter((c) => c.method === "eq")
    .map((c) => `${String(c.args[0])}=${String(c.args[1])}`);
const arg = (calls: Call[], method: string) =>
  calls.find((c) => c.method === method)?.args;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationRoster.mockResolvedValue([{ id: MIA, name: "Mia" }]);
});

describe("getSentOrderDraftsPage (VOD-080)", () => {
  it("reads one explicit, newest-first page of Sent orders for this organization and location", async () => {
    const rows = Array.from({ length: SENT_PAGE_SIZE }, (_, i) => draftRow(i));
    const { client, reads } = fakeClient((table) =>
      table === "inventory_order_drafts"
        ? { data: rows, error: null, count: 2345 }
        : { data: rows.map((r) => itemRow(r.id)), error: null },
    );
    mocks.createClient.mockResolvedValue(client);

    const page = await getSentOrderDraftsPage(ORG, LOC, 0);

    const drafts = reads.find(
      (r) => r.table === "inventory_order_drafts",
    )!.calls;
    expect(filters(drafts)).toEqual([
      `organization_id=${ORG}`,
      `location_id=${LOC}`,
      "status=sent",
    ]);
    expect(
      drafts.filter((c) => c.method === "order").map((c) => c.args),
    ).toEqual([
      ["sent_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(arg(drafts, "range")).toEqual([0, SENT_PAGE_SIZE - 1]);
    // The total is an exact count, not "however many rows came back".
    expect(arg(drafts, "select")![1]).toEqual({ count: "exact" });
    expect(page).toMatchObject({
      page: 0,
      pageSize: SENT_PAGE_SIZE,
      total: 2345,
    });
    expect(page!.drafts).toHaveLength(SENT_PAGE_SIZE);
    expect(page!.drafts[0]).toMatchObject({
      id: "d-0",
      sentByName: "Mia",
      lineCount: 1,
      plannedTotal: 6,
    });
  });

  it("asks for the right range on later pages (no offset drift past 1,000 rows)", async () => {
    const { client, reads } = fakeClient((table) =>
      table === "inventory_order_drafts"
        ? { data: [draftRow(1)], error: null, count: 2345 }
        : { data: [itemRow("d-1")], error: null },
    );
    mocks.createClient.mockResolvedValue(client);
    await getSentOrderDraftsPage(ORG, LOC, 60);
    const drafts = reads.find(
      (r) => r.table === "inventory_order_drafts",
    )!.calls;
    expect(arg(drafts, "range")).toEqual([1200, 1219]);
  });

  it("falls back to the last page when asked for one past the end", async () => {
    let call = 0;
    const { client, reads } = fakeClient((table) => {
      if (table !== "inventory_order_drafts") {
        return { data: [itemRow("d-1")], error: null };
      }
      call += 1;
      return call === 1
        ? { data: [], error: null, count: 45 }
        : { data: [draftRow(1)], error: null, count: 45 };
    });
    mocks.createClient.mockResolvedValue(client);
    const page = await getSentOrderDraftsPage(ORG, LOC, 99);
    const ranges = reads
      .filter((r) => r.table === "inventory_order_drafts")
      .map((r) => arg(r.calls, "range"));
    expect(ranges).toEqual([
      [1980, 1999],
      [40, 59],
    ]);
    expect(page).toMatchObject({ page: 2, total: 45 });
  });

  it("falls back to the last page when PostgREST refuses a range past the end (PGRST103)", async () => {
    // Observed on hosted DEV: a range that starts past the last row is not an
    // empty page, it is `416 PGRST103 Requested range not satisfiable`.
    const { client, reads } = fakeClient((table, calls) => {
      if (table !== "inventory_order_drafts") {
        return { data: [itemRow("d-1")], error: null };
      }
      if ((arg(calls, "select")?.[1] as { head?: boolean })?.head) {
        return { data: null, error: null, count: 45 };
      }
      return (arg(calls, "range") as number[])[0] === 1980
        ? {
            data: null,
            error: {
              code: "PGRST103",
              message: "Requested range not satisfiable",
            },
            count: null,
          }
        : { data: [draftRow(1)], error: null, count: 45 };
    });
    mocks.createClient.mockResolvedValue(client);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const page = await getSentOrderDraftsPage(ORG, LOC, 99);
    const draftReads = reads.filter(
      (r) => r.table === "inventory_order_drafts",
    );
    // Scoped to this organization and location, like the page reads.
    const count = draftReads.find(
      (r) => (arg(r.calls, "select")?.[1] as { head?: boolean })?.head,
    )!;
    expect(filters(count.calls)).toEqual([
      `organization_id=${ORG}`,
      `location_id=${LOC}`,
      "status=sent",
    ]);
    expect(
      draftReads
        .filter((r) => arg(r.calls, "range"))
        .map((r) => arg(r.calls, "range")),
    ).toEqual([
      [1980, 1999],
      [40, 59],
    ]);
    expect(page).toMatchObject({ page: 2, total: 45 });
    expect(page!.drafts).toHaveLength(1);
  });

  it("a range past the end of an empty history is an empty first page, not a failure", async () => {
    const { client } = fakeClient((table, calls) => {
      if ((arg(calls, "select")?.[1] as { head?: boolean })?.head) {
        return { data: null, error: null, count: 0 };
      }
      return table === "inventory_order_drafts"
        ? {
            data: null,
            error: {
              code: "PGRST103",
              message: "Requested range not satisfiable",
            },
            count: null,
          }
        : { data: [], error: null };
    });
    mocks.createClient.mockResolvedValue(client);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSentOrderDraftsPage(ORG, LOC, 5)).toEqual({
      drafts: [],
      page: 0,
      pageSize: SENT_PAGE_SIZE,
      total: 0,
    });
  });

  it("reports nothing sent as an empty first page, and a failure as null", async () => {
    mocks.createClient.mockResolvedValue(
      fakeClient(() => ({ data: [], error: null, count: 0 })).client,
    );
    expect(await getSentOrderDraftsPage(ORG, LOC, 0)).toEqual({
      drafts: [],
      page: 0,
      pageSize: SENT_PAGE_SIZE,
      total: 0,
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue(
      fakeClient(() => ({ data: null, error: { message: "boom" } })).client,
    );
    expect(await getSentOrderDraftsPage(ORG, LOC, 0)).toBeNull();
  });
});

describe("getOrderDraftById", () => {
  it("is bound to organization and location, and returns frozen labels and sent facts", async () => {
    const { client, reads } = fakeClient((table) =>
      table === "inventory_order_drafts"
        ? { data: [draftRow(7)], error: null }
        : {
            data: [itemRow("d-7", { product_name: "Frozen name" })],
            error: null,
          },
    );
    mocks.createClient.mockResolvedValue(client);
    const found = await getOrderDraftById(ORG, LOC, "d-7");
    expect(
      filters(reads.find((r) => r.table === "inventory_order_drafts")!.calls),
    ).toEqual([`organization_id=${ORG}`, `location_id=${LOC}`, "id=d-7"]);
    expect(found.failed).toBe(false);
    expect(found.draft).toMatchObject({
      id: "d-7",
      status: "sent",
      vendorName: "Vendor 7",
      sentByName: "Mia",
      sentAt: "2026-10-01T01:30:00Z",
    });
    expect(found.draft!.lines[0]).toMatchObject({
      name: "Frozen name",
      suggestedQty: 8,
      orderQty: 6,
    });
  });

  it("says 'not found' (another tenant's id, or none) differently from 'could not load'", async () => {
    mocks.createClient.mockResolvedValue(
      fakeClient(() => ({ data: [], error: null })).client,
    );
    expect(await getOrderDraftById(ORG, LOC, "other-tenant")).toEqual({
      draft: null,
      failed: false,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue(
      fakeClient(() => ({ data: null, error: { message: "x" } })).client,
    );
    expect(await getOrderDraftById(ORG, LOC, "d-1")).toEqual({
      draft: null,
      failed: true,
    });
  });
});

describe("getActiveOrderDrafts still lists only active drafts", () => {
  it("filters status = draft and marks drafts as unsent", async () => {
    const { client, reads } = fakeClient((table) =>
      table === "inventory_order_drafts"
        ? {
            data: [
              draftRow(1, { status: "draft", sent_at: null, sent_by: null }),
            ],
            error: null,
          }
        : { data: [itemRow("d-1")], error: null },
    );
    mocks.createClient.mockResolvedValue(client);
    const drafts = await getActiveOrderDrafts(ORG, LOC);
    expect(
      filters(reads.find((r) => r.table === "inventory_order_drafts")!.calls),
    ).toContain("status=draft");
    expect(drafts![0]).toMatchObject({
      status: "draft",
      sentAt: null,
      sentByName: null,
    });
  });
});
