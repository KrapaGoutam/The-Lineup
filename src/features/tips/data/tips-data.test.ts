import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  locationForLoader: vi.fn(),
  getOrganizationRoster: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  locationForLoader: mocks.locationForLoader,
}));
// The organization-wide roster must never be consulted by the Tips loader.
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: mocks.getOrganizationRoster,
}));

import { getTipsContext } from "@/features/tips/data/tips-data";

const organizationId = "00000000-0000-4000-8000-0000000000a1";
const locationId = "00000000-0000-4000-8000-0000000000b1";

const rosterOk = [
  {
    profile_id: "p-1",
    display_name: "Casey Current",
    roles: ["server"],
    active: true,
    eligible: true,
  },
];
const dayOk = {
  tip_pool_id: 3,
  status: "estimating",
  intervals: [
    {
      id: "1",
      starts_at: "2026-11-07T16:00:00Z",
      ends_at: "2026-11-07T17:00:00Z",
      amount_cents: 1000,
      participant_ids: ["p-1"],
    },
  ],
  audit_log: [],
};

function rpcReturns(roster: unknown, day: unknown) {
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "tips_location_roster" ? roster : day,
  );
}

describe("getTipsContext (V2-005.003 read boundary)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locationForLoader.mockResolvedValue({
      id: locationId,
      time_zone: "America/New_York",
    });
  });

  it("reads only the two location-authorized RPCs, bound to the verified location", async () => {
    rpcReturns({ data: rosterOk, error: null }, { data: dayOk, error: null });
    const context = await getTipsContext(organizationId);
    expect(context?.unavailable).toBeUndefined();
    expect(context?.tipPoolId).toBe(3);
    expect(context?.selectableIds).toEqual(["p-1"]);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("tips_location_roster", {
      p_organization_id: organizationId,
      p_location_id: locationId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "tips_get_day_data",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_service_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    // No direct table reads that would bypass the staff/manager contract.
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getOrganizationRoster).not.toHaveBeenCalled();
  });

  it.each([
    ["roster", "PGRST202", "backend_not_ready"],
    ["roster", "42501", "access_denied"],
    ["roster", "XX000", "unavailable"],
    ["day", "PGRST202", "backend_not_ready"],
    ["day", "42501", "access_denied"],
  ])(
    "fails closed (no org-wide fallback, no data) when the %s RPC errors with %s",
    async (which, code, reason) => {
      const error = { data: null, error: { code, message: "boom" } };
      rpcReturns(
        which === "roster" ? error : { data: rosterOk, error: null },
        which === "day" ? error : { data: dayOk, error: null },
      );
      const context = await getTipsContext(organizationId);
      expect(context?.unavailable).toBe(reason);
      expect(context?.team).toEqual([]);
      expect(context?.selectableIds).toEqual([]);
      expect(context?.intervals).toEqual([]);
      expect(context?.tipPoolId).toBeNull();
      expect(mocks.getOrganizationRoster).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("fails closed on a malformed payload", async () => {
    rpcReturns(
      { data: rosterOk, error: null },
      { data: { junk: 1 }, error: null },
    );
    const context = await getTipsContext(organizationId);
    expect(context?.unavailable).toBe("unavailable");
    expect(context?.intervals).toEqual([]);
  });

  it("returns null when no location is verified", async () => {
    mocks.locationForLoader.mockResolvedValue(null);
    await expect(getTipsContext(organizationId)).resolves.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
