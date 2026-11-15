import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  moduleAllowed: vi.fn(),
  readAll: vi.fn(),
  rpc: vi.fn(),
  locations: [] as {
    id: string;
    name: string;
    active: boolean;
    archived_at: string | null;
  }[],
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./catalog-data", () => ({
  readAll: mocks.readAll,
  STOCK_COLUMNS: "product_id",
  STORAGE_AREA_COLUMNS: "id",
  STORAGE_SHELF_COLUMNS: "id",
  STORAGE_PLACEMENT_COLUMNS: "id",
}));

import { getBranchStorageOverview } from "./storage-overview-data";

const ORG = "00000000-0000-4000-8000-0000000e6101";
const A = "00000000-0000-4000-8000-0000000e61a1"; // authorized
const B = "00000000-0000-4000-8000-0000000e61b1"; // NOT authorized (e.g. another manager's branch)
const C = "00000000-0000-4000-8000-0000000e61c1"; // authorized, but Bar Inventory disabled
const D = "00000000-0000-4000-8000-0000000e61d1"; // authorized

function fakeSupabase() {
  const query: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order"]) {
    query[m] = () => query;
  }
  query.overrideTypes = async () => ({ data: mocks.locations, error: null });
  return { from: () => query, rpc: mocks.rpc };
}

const area = (id: string, loc: string) => ({
  id,
  location_id: loc,
  name: `Area ${id}`,
  kind: "cooler",
  display_order: 1,
  active: true,
  version: 1,
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  created_by: "x",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locations = [A, B, C, D].map((id, i) => ({
    id,
    name: `Branch ${"ABCD"[i]}`,
    active: true,
    archived_at: null,
  }));
  mocks.createClient.mockResolvedValue(fakeSupabase());
  mocks.rpc.mockImplementation(
    async (_name: string, args: { p_location_id: string }) => ({
      data: args.p_location_id !== B,
      error: null,
    }),
  );
  mocks.moduleAllowed.mockImplementation(async (id: string) => id !== C);
});

describe("getBranchStorageOverview (read-only all-branches loader)", () => {
  it("proves each branch with the database authority RPC and the module gate, then reads ONLY those", async () => {
    mocks.readAll.mockImplementation(async (_s: unknown, table: string) => {
      if (table === "inventory_storage_areas") {
        return [area("a-A", A), area("a-D", D)];
      }
      return [];
    });
    const overview = await getBranchStorageOverview(
      ORG,
      A,
      mocks.moduleAllowed,
    );

    // Authority is asked per branch, with the server's organization id.
    const asked = mocks.rpc.mock.calls.map(([n, a]) => [
      n,
      a.p_organization_id,
      a.p_location_id,
    ]);
    expect(asked).toEqual(
      [A, B, C, D].map((id) => ["inventory_location_authorized", ORG, id]),
    );
    expect(overview!.branches.map((b) => b.locationId)).toEqual([A, D]);
    expect(overview!.activeLocationId).toBe(A);

    // Every table read names only the allowed branches: B (not authorized) and
    // C (module disabled) are never queried.
    expect(mocks.readAll).toHaveBeenCalledTimes(4);
    for (const call of mocks.readAll.mock.calls) {
      expect(call[4].locationIds).toEqual([A, D]);
    }
  });

  it("drops any row that is not from an allowed branch even if the database returned it", async () => {
    mocks.readAll.mockImplementation(async (_s: unknown, table: string) => {
      if (table === "inventory_storage_areas") {
        // a row from the unauthorized branch B slipped into the result
        return [area("a-A", A), area("a-B", B)];
      }
      return [];
    });
    const overview = await getBranchStorageOverview(
      ORG,
      A,
      mocks.moduleAllowed,
    );
    const all = overview!.branches.flatMap((b) => b.areas.map((x) => x.id));
    expect(all).toEqual(["a-A"]);
  });

  it("keeps each branch's own stock row for the SAME product (never blended)", async () => {
    const stock = (loc: string, onHand: number) => ({
      location_id: loc,
      product_id: "product-1",
      on_hand: onHand,
      backup: 0,
      cutoff: null,
      warning: null,
      par: null,
      version: 1,
      updated_at: null,
      updated_by: null,
      last_adjusted_at: null,
    });
    mocks.readAll.mockImplementation(async (_s: unknown, table: string) =>
      table === "inventory_stock" ? [stock(A, 18), stock(D, 3)] : [],
    );
    const overview = await getBranchStorageOverview(
      ORG,
      A,
      mocks.moduleAllowed,
    );
    const byBranch = Object.fromEntries(
      overview!.branches.map((b) => [
        b.locationId,
        b.stock.map((s) => s.onHand),
      ]),
    );
    expect(byBranch).toEqual({ [A]: [18], [D]: [3] });
  });

  it("returns no branches (and reads nothing) when the caller may manage none", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const overview = await getBranchStorageOverview(
      ORG,
      A,
      mocks.moduleAllowed,
    );
    expect(overview).toEqual({ branches: [], activeLocationId: A });
    expect(mocks.readAll).not.toHaveBeenCalled();
  });

  it("treats an authority RPC error as NOT authorized (fails closed)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const overview = await getBranchStorageOverview(
      ORG,
      A,
      mocks.moduleAllowed,
    );
    expect(overview!.branches).toEqual([]);
    expect(mocks.readAll).not.toHaveBeenCalled();
  });

  it("returns null (a load failure) when a table read fails, never partial data", async () => {
    mocks.readAll.mockImplementation(async (_s: unknown, table: string) =>
      table === "inventory_storage_placements" ? null : [],
    );
    expect(
      await getBranchStorageOverview(ORG, A, mocks.moduleAllowed),
    ).toBeNull();
  });
});
