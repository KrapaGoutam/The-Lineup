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

import { getPayrollActor } from "./payroll-actor";

beforeEach(() => {
  mocks.resolve.mockReset().mockResolvedValue({
    status: "resolved",
    context: {
      profileId: "real-profile",
      organizationId: "org-1",
      locationId: "loc-1",
      timeZone: "America/Chicago",
      access: {
        allowed: true,
        capabilities: ["location:manage", "location:access"],
        effectiveLevel: "manager",
      },
    },
  });
  mocks.entry.mockReset().mockResolvedValue({
    profileId: "real-profile",
    name: "Real Manager",
    designation: "manager",
  });
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

it("hydrates location manager authority using verified scope", async () => {
  const actor = await getPayrollActor("restaurant");
  expect(actor).toEqual({
    organizationId: "org-1",
    scope: {
      organizationId: "org-1",
      locationId: "loc-1",
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: "real-profile",
      name: "Real Manager",
      designation: "manager",
    },
    isOrgManager: false,
    isLocationManager: true,
    canManage: true,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("payroll_location_authorized", {
    p_organization_id: "org-1",
    p_location_id: "loc-1",
  });
});

it("hydrates org manager authority with org:admin capability", async () => {
  mocks.resolve.mockResolvedValue({
    status: "resolved",
    context: {
      profileId: "org-owner-profile",
      organizationId: "org-1",
      locationId: "loc-1",
      timeZone: "America/Chicago",
      access: {
        allowed: true,
        capabilities: ["org:admin", "location:manage"],
        effectiveLevel: "owner",
      },
    },
  });
  mocks.entry.mockResolvedValue({
    profileId: "org-owner-profile",
    name: "Org Owner",
    designation: "owner",
  });

  const actor = await getPayrollActor("restaurant");
  expect(actor?.isOrgManager).toBe(true);
  expect(actor?.isLocationManager).toBe(true);
  expect(actor?.canManage).toBe(true);
});

it("hydrates regular staff with canManage=false", async () => {
  mocks.resolve.mockResolvedValue({
    status: "resolved",
    context: {
      profileId: "staff-profile",
      organizationId: "org-1",
      locationId: "loc-1",
      timeZone: "America/Chicago",
      access: {
        allowed: true,
        capabilities: ["location:access"],
        effectiveLevel: "staff",
      },
    },
  });
  mocks.entry.mockResolvedValue({
    profileId: "staff-profile",
    name: "Staff Server",
    designation: "staff",
  });

  const actor = await getPayrollActor("restaurant");
  expect(actor?.isOrgManager).toBe(false);
  expect(actor?.isLocationManager).toBe(false);
  expect(actor?.canManage).toBe(false);
  expect(actor?.viewer.designation).toBe("staff");
});

it("fails closed if RPC returns error or false", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(await getPayrollActor("restaurant")).toBeNull();

  mocks.rpc.mockResolvedValue({ data: null, error: { message: "error" } });
  expect(await getPayrollActor("restaurant")).toBeNull();
});

it("fails closed if user profile doesn't match context profileId", async () => {
  mocks.entry.mockResolvedValue({
    profileId: "different-profile",
    name: "Different",
    designation: "manager",
  });
  expect(await getPayrollActor("restaurant")).toBeNull();
});
