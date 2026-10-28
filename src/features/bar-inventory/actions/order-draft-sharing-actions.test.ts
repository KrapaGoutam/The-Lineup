import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  requireLiveSession: vi.fn(),
  getActiveOrderDrafts: vi.fn(),
  getOrderDraftById: vi.fn(),
  getSentOrderDraftsPage: vi.fn(),
  getCatalogSnapshot: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("../data/order-draft-data", () => ({
  getActiveOrderDrafts: mocks.getActiveOrderDrafts,
  getOrderDraftById: mocks.getOrderDraftById,
  getSentOrderDraftsPage: mocks.getSentOrderDraftsPage,
}));
vi.mock("../data/catalog-data", () => ({
  getCatalogSnapshot: mocks.getCatalogSnapshot,
}));
vi.mock("../data/history-data", () => ({
  getHistoryEntries: vi.fn(),
  HISTORY_ROW_LIMIT: 1000,
  ITEM_HISTORY_LIMIT: 25,
}));

import { buildDemoCatalog } from "../domain/demo-catalog";
import type { OrderDraftView } from "../domain/order-draft-view";
import { exportDataAction } from "./inventory-actions";
import {
  getSentOrderDraftAction,
  listSentOrderDraftsAction,
  markOrderDraftSentAction,
} from "./order-draft-actions";

const ORG = "00000000-0000-0000-0000-000000031001";
const LOC = "00000000-0000-0000-0000-000000031002";
const DRAFT = "31000000-0000-4000-8000-000000000003";
const OTHER_DRAFT = "31000000-0000-4000-8000-000000000004";

const user = (
  designation: "owner" | "manager" | "assistant_manager" | "staff",
) => ({
  profileId: "profile-1",
  name: "Mia",
  role: designation === "staff" ? "server" : "manager",
  designation,
  organizationId: ORG,
});

const sentDraft: OrderDraftView = {
  id: DRAFT,
  vendorId: "v1",
  vendorName: "Faust",
  status: "sent",
  vendorNote: "=cmd|' /C calc'!A0",
  version: 4,
  updatedAt: "2026-10-27T16:00:00Z",
  updatedByName: "Mia",
  sentAt: "2026-10-27T16:00:00Z",
  sentByName: "Mia",
  lines: [
    {
      productId: "p1",
      name: "=Tito's",
      size: "750 mL",
      unit: "Bottle",
      sku: null,
      suggestedQty: 9,
      totalAtSnapshot: 3,
      parAtSnapshot: 12,
      statusAtSnapshot: "critical",
      orderQty: 6,
      included: true,
      itemNote: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.getCurrentUser.mockResolvedValue(user("manager"));
  mocks.getPrimaryLocation.mockResolvedValue({
    id: LOC,
    time_zone: "America/New_York",
  });
  mocks.getActiveOrderDrafts.mockResolvedValue([]);
  mocks.getCatalogSnapshot.mockResolvedValue({
    ...buildDemoCatalog(),
    loadedAt: "2026-10-27T16:00:00Z",
  });
});

describe("markOrderDraftSentAction (VOD-070/073/076)", () => {
  const input = {
    restaurantSlug: "the-monks",
    draftId: DRAFT,
    expectedVersion: 3,
  };

  it("calls only the Mark Sent RPC, with the server-derived organization and location and the reviewed version", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: DRAFT,
        status: "sent",
        version: 4,
        sent_by: "Mia",
        sent_at: "2026-10-27T16:00:00Z",
        changed: true,
      },
      error: null,
    });
    const result = await markOrderDraftSentAction(input);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("inventory_order_draft_mark_sent", {
      p_organization_id: ORG,
      p_location_id: LOC,
      p_draft_id: DRAFT,
      p_expected_version: 3,
    });
    expect(result).toMatchObject({
      ok: true,
      draftId: DRAFT,
      changed: true,
      sent: { sentByName: "Mia", sentAt: "2026-10-27T16:00:00Z" },
    });
  });

  it("passes an idempotent retry through as 'nothing changed' with the first send's facts", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: DRAFT,
        status: "sent",
        version: 4,
        sent_by: "Jo",
        sent_at: "2026-10-27T15:00:00Z",
        changed: false,
      },
      error: null,
    });
    expect(await markOrderDraftSentAction(input)).toMatchObject({
      ok: true,
      changed: false,
      sent: { sentByName: "Jo", sentAt: "2026-10-27T15:00:00Z" },
    });
  });

  it("returns a stale write (PT409) as a conflict and never reads it as sent", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message: "Someone else changed this order draft.",
        details: JSON.stringify({
          kind: "stale",
          entity: "order_draft",
          id: DRAFT,
          current_version: 5,
          updated_by: "Jo",
          updated_at: "2026-10-27T16:05:00Z",
        }),
      },
    });
    const result = await markOrderDraftSentAction(input);
    expect(result).toMatchObject({
      ok: false,
      conflict: { kind: "stale", entity: "order_draft", currentVersion: 5 },
    });
    expect(mocks.getActiveOrderDrafts).not.toHaveBeenCalled();
  });

  it("shows the database's own plain message when there is no quantity", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "Add a quantity before marking this order sent.",
      },
    });
    expect(await markOrderDraftSentAction(input)).toMatchObject({
      ok: false,
      error: "Add a quantity before marking this order sent.",
    });
  });

  it("refuses staff, a bad draft id and a bad version before any database call", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("staff"));
    expect(await markOrderDraftSentAction(input)).toEqual({
      ok: false,
      error: "Bar Inventory is not available for your role.",
    });
    mocks.getCurrentUser.mockResolvedValue(user("manager"));
    expect(
      await markOrderDraftSentAction({ ...input, draftId: "nope" }),
    ).toEqual({ ok: false, error: "That request is invalid." });
    expect(
      await markOrderDraftSentAction({ ...input, expectedVersion: 0 }),
    ).toEqual({ ok: false, error: "That request is invalid." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Sent reads: staff denied (VOD-093)", () => {
  it("list and detail refuse staff and never read the data layer", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("staff"));
    const denied = {
      ok: false,
      error: "Bar Inventory is not available for your role.",
    };
    expect(
      await listSentOrderDraftsAction({ restaurantSlug: "the-monks", page: 0 }),
    ).toEqual(denied);
    expect(
      await getSentOrderDraftAction({
        restaurantSlug: "the-monks",
        draftId: DRAFT,
      }),
    ).toEqual(denied);
    expect(mocks.getSentOrderDraftsPage).not.toHaveBeenCalled();
    expect(mocks.getOrderDraftById).not.toHaveBeenCalled();
  });

  it("reads the page for the server-derived organization and location", async () => {
    mocks.getSentOrderDraftsPage.mockResolvedValue({
      drafts: [],
      page: 2,
      pageSize: 20,
      total: 45,
    });
    const result = await listSentOrderDraftsAction({
      restaurantSlug: "the-monks",
      page: 2,
    });
    expect(mocks.getSentOrderDraftsPage).toHaveBeenCalledWith(ORG, LOC, 2);
    expect(result).toMatchObject({ ok: true, page: { total: 45 } });
    expect(
      await listSentOrderDraftsAction({
        restaurantSlug: "the-monks",
        page: -1,
      }),
    ).toEqual({ ok: false, error: "That request is invalid." });
  });

  it("detail returns only a Sent order", async () => {
    mocks.getOrderDraftById.mockResolvedValue({
      draft: sentDraft,
      failed: false,
    });
    expect(
      await getSentOrderDraftAction({
        restaurantSlug: "the-monks",
        draftId: DRAFT,
      }),
    ).toMatchObject({ ok: true, draft: { id: DRAFT, status: "sent" } });
    mocks.getOrderDraftById.mockResolvedValue({
      draft: { ...sentDraft, status: "draft" },
      failed: false,
    });
    expect(
      await getSentOrderDraftAction({
        restaurantSlug: "the-monks",
        draftId: DRAFT,
      }),
    ).toMatchObject({ ok: false });
    mocks.getOrderDraftById.mockResolvedValue({ draft: null, failed: false });
    expect(
      await getSentOrderDraftAction({
        restaurantSlug: "the-monks",
        draftId: OTHER_DRAFT,
      }),
    ).toEqual({ ok: false, error: "That sent order is not available." });
  });
});

describe("exportDataAction order_draft (VOD-060/061/062/063)", () => {
  const request = { kind: "order_draft" as const, draftId: DRAFT };

  it("loads the draft itself, bound to the server-derived organization and location, and builds the CSV", async () => {
    mocks.getOrderDraftById.mockResolvedValue({
      draft: sentDraft,
      failed: false,
    });
    const result = await exportDataAction({
      restaurantSlug: "the-monks",
      format: "csv",
      request,
    });
    expect(mocks.getOrderDraftById).toHaveBeenCalledWith(ORG, LOC, DRAFT);
    expect(result).toMatchObject({
      ok: true,
      encoding: "text",
      mime: "text/csv;charset=utf-8",
    });
    if (!result.ok) throw new Error("unreachable");
    expect(result.filename).toMatch(
      /^bar-inventory_the-monks_order-faust_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    // Suggested (the snapshot) is in the manager's file, and the hostile text is neutralised.
    expect(result.content).toContain(
      "Vendor,Item,Size,Unit,SKU,Suggested,Order Qty,Item Note",
    );
    expect(result.content).toContain("Faust,'=Tito's,750 mL,Bottle,,9,6,");
    expect(result.content).not.toMatch(/,=Tito/);
  });

  it("builds an XLSX (base64) with the same rows", async () => {
    mocks.getOrderDraftById.mockResolvedValue({
      draft: sentDraft,
      failed: false,
    });
    const result = await exportDataAction({
      restaurantSlug: "the-monks",
      format: "xlsx",
      request,
    });
    expect(result).toMatchObject({ ok: true, encoding: "base64" });
    if (!result.ok) throw new Error("unreachable");
    expect(
      Buffer.from(result.content, "base64").subarray(0, 2).toString(),
    ).toBe("PK");
  });

  it("ignores any rows the client tries to send: only the id travels", async () => {
    mocks.getOrderDraftById.mockResolvedValue({
      draft: sentDraft,
      failed: false,
    });
    const result = await exportDataAction({
      restaurantSlug: "the-monks",
      format: "csv",
      request: {
        ...request,
        rows: [["Evil", "row", "", "", "", "", 999, ""]],
        lines: [{ orderQty: 999 }],
      } as never,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.content).not.toContain("Evil");
    expect(result.content).not.toContain("999");
  });

  it("refuses another tenant's or a missing draft, a non-uuid id and an order with nothing to send", async () => {
    mocks.getOrderDraftById.mockResolvedValue({ draft: null, failed: false });
    expect(
      await exportDataAction({
        restaurantSlug: "the-monks",
        format: "csv",
        request: { kind: "order_draft", draftId: OTHER_DRAFT },
      }),
    ).toEqual({ ok: false, error: "That order draft is not available." });

    expect(
      await exportDataAction({
        restaurantSlug: "the-monks",
        format: "csv",
        request: { kind: "order_draft", draftId: "nope" },
      }),
    ).toEqual({ ok: false, error: "That request is invalid." });

    mocks.getOrderDraftById.mockResolvedValue({
      draft: { ...sentDraft, lines: [{ ...sentDraft.lines[0]!, orderQty: 0 }] },
      failed: false,
    });
    expect(
      await exportDataAction({
        restaurantSlug: "the-monks",
        format: "csv",
        request,
      }),
    ).toEqual({
      ok: false,
      error: "Add a quantity to at least one included line.",
    });
  });

  it("refuses staff before reading anything", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("staff"));
    expect(
      await exportDataAction({
        restaurantSlug: "the-monks",
        format: "csv",
        request,
      }),
    ).toEqual({
      ok: false,
      error: "Bar Inventory is not available for your role.",
    });
    expect(mocks.getOrderDraftById).not.toHaveBeenCalled();
    expect(mocks.getCatalogSnapshot).not.toHaveBeenCalled();
  });
});
