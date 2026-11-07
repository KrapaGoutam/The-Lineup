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
import { getTasksActor } from "./tasks-actor";
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
        capabilities: ["location:operate"],
        effectiveLevel: "assistant_manager",
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
it("hydrates genuine Overall/location authority using the verified scope, without fabricating affiliation", async () => {
  expect(await getTasksActor("restaurant")).toEqual({
    organizationId: "org",
    scope: {
      organizationId: "org",
      locationId: "location",
      timeZone: "America/New_York",
    },
    viewer: {
      profileId: "real-profile",
      name: "Real actor",
      designation: "assistant_manager",
    },
  });
  expect(mocks.rpc).toHaveBeenCalledWith("tasks_location_authorized", {
    p_organization_id: "org",
    p_location_id: "location",
  });
});
it("a missing migration on Preview refuses before any old-schema operational RPC", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  expect(await getTasksActor("restaurant")).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("a revoked SQL session or changed identity fails closed", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(await getTasksActor("restaurant")).toBeNull();
  mocks.rpc.mockClear();
  mocks.entry.mockResolvedValue({ profileId: "other" });
  expect(await getTasksActor("restaurant")).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
