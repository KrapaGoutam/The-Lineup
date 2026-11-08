import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  entry: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: mocks.resolve,
}));
vi.mock("@/lib/current-user", () => ({ getEntryUser: mocks.entry }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

import { getInventoryActor } from "./inventory-actor";

beforeEach(() => {
  mocks.resolve.mockReset().mockResolvedValue({
    status: "resolved",
    context: {
      profileId: "real-profile",
      organizationId: "org",
      locationId: "location",
      timeZone: "America/New_York",
      access: {
        allowed: true,
        effectiveLevel: "manager",
      },
    },
  });
  mocks.entry.mockReset().mockResolvedValue({
    profileId: "real-profile",
    name: "Real actor",
    designation: "staff",
  });
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

it("hydrates genuine Overall/location authority using the verified scope", async () => {
  expect(await getInventoryActor("restaurant")).toEqual({
    organizationId: "org",
    scope: {
      organizationId: "org",
      locationId: "location",
      timeZone: "America/New_York",
    },
    viewer: {
      profileId: "real-profile",
      name: "Real actor",
      designation: "manager",
    },
  });
  expect(mocks.rpc).toHaveBeenCalledWith("inventory_location_authorized", {
    p_org: "org",
    p_location: "location",
  });
});

it("returns null when unauthorized at the active location", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect(await getInventoryActor("restaurant")).toBeNull();
});

it("returns null when context fails to resolve", async () => {
  mocks.resolve.mockResolvedValueOnce({ status: "not_found" });
  expect(await getInventoryActor("restaurant")).toBeNull();
});
