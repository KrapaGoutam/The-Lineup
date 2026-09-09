import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchClockedInRoster: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  requireLiveSession: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/features/tips/data/fetch-clocked-in-roster", () => ({
  fetchClockedInRoster: mocks.fetchClockedInRoster,
}));

import { getClockedInRosterAction } from "./tips-actions";

const organizationId = "00000000-0000-0000-0000-000000029101";
const managerId = "00000000-0000-0000-0000-000000029102";
const serverId = "00000000-0000-0000-0000-000000029103";

const manager = {
  profileId: managerId,
  name: "Manager",
  role: "manager" as const,
  designation: "manager" as const,
  organizationId,
};
const server = {
  profileId: serverId,
  name: "Server",
  role: "server" as const,
  designation: "staff" as const,
  organizationId,
};

describe("getClockedInRosterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.requireLiveSession.mockResolvedValue(null);
  });

  it("refuses a request with a malformed restaurant slug before touching anything else", async () => {
    await expect(
      getClockedInRosterAction({ restaurantSlug: "Not A Slug!" }),
    ).resolves.toEqual({ ok: false, error: "That request is invalid." });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses a server -- only a manager or owner can pull the roster", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);

    await expect(
      getClockedInRosterAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({
      ok: false,
      error: "Only a manager or owner can pull the clocked-in team.",
    });
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled();
    expect(mocks.fetchClockedInRoster).not.toHaveBeenCalled();
  });

  it("re-derives the organization and service date server-side for a manager, never from the client", async () => {
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPrimaryLocation.mockResolvedValue({
      id: "loc-1",
      time_zone: "America/Chicago",
    });
    mocks.fetchClockedInRoster.mockResolvedValue({
      ok: true,
      data: ["profile-a", "profile-b"],
    });

    await expect(
      getClockedInRosterAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({
      ok: true,
      data: { profileIds: ["profile-a", "profile-b"] },
    });
    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(organizationId);
    expect(mocks.fetchClockedInRoster).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId }),
    );
  });

  it("reports a clear error when the restaurant has no primary location configured", async () => {
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPrimaryLocation.mockResolvedValue(null);

    await expect(
      getClockedInRosterAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({
      ok: false,
      error: "This restaurant has no primary location configured.",
    });
    expect(mocks.fetchClockedInRoster).not.toHaveBeenCalled();
  });

  it("propagates a failure from the roster lookup itself", async () => {
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPrimaryLocation.mockResolvedValue({
      id: "loc-1",
      time_zone: "America/Chicago",
    });
    mocks.fetchClockedInRoster.mockResolvedValue({
      ok: false,
      error: "Attendance data unavailable. Try again shortly.",
    });

    await expect(
      getClockedInRosterAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({
      ok: false,
      error: "Attendance data unavailable. Try again shortly.",
    });
  });
});
