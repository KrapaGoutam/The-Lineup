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

import { getRecipesActor } from "./recipes-actor";

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
        effectiveLevel: "server",
      },
    },
  });
  mocks.entry.mockReset().mockResolvedValue({
    profileId: "real-profile",
    name: "Real actor",
    designation: "server",
  });
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

it("hydrates recipes actor for staff member with read access", async () => {
  expect(await getRecipesActor("restaurant")).toEqual({
    organizationId: "org",
    scope: {
      organizationId: "org",
      locationId: "location",
      timeZone: "America/New_York",
    },
    viewer: {
      profileId: "real-profile",
      name: "Real actor",
      designation: "server",
    },
    isManager: false,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("recipes_org_authorized", {
    p_organization_id: "org",
  });
});

it("identifies manager roles", async () => {
  mocks.resolve.mockResolvedValueOnce({
    status: "resolved",
    context: {
      profileId: "real-profile",
      organizationId: "org",
      locationId: "location",
      access: { allowed: true, effectiveLevel: "manager" },
    },
  });
  const actor = await getRecipesActor("restaurant");
  expect(actor?.isManager).toBe(true);
});

it("returns null when unauthorized for org recipes", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect(await getRecipesActor("restaurant")).toBeNull();
});
