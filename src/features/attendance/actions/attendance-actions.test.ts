import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
  getCurrentUser: vi.fn(),
  getOwnAttendanceLink: vi.fn(),
  listAttendanceIdentityLinks: vi.fn(),
  removeAttendanceIdentityLink: vi.fn(),
  requireLiveSession: vi.fn(),
  upsertAttendanceIdentityLink: vi.fn(),
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
vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveNeonUsers: mocks.getActiveNeonUsers,
  getAttendanceRows: mocks.getAttendanceRows,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  getOwnAttendanceLink: mocks.getOwnAttendanceLink,
  listAttendanceIdentityLinks: mocks.listAttendanceIdentityLinks,
  removeAttendanceIdentityLink: mocks.removeAttendanceIdentityLink,
  upsertAttendanceIdentityLink: mocks.upsertAttendanceIdentityLink,
}));

import {
  getAttendanceAccessAction,
  getAttendanceDashboardTotalsAction,
  getAttendanceReportAction,
} from "./attendance-actions";

const organizationId = "00000000-0000-0000-0000-000000019101";
const managerId = "00000000-0000-0000-0000-000000019102";
const serverId = "00000000-0000-0000-0000-000000019103";

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

describe("Feature 019 attendance access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
  });

  it("returns all scope for a manager without consulting an identity link", async () => {
    mocks.getCurrentUser.mockResolvedValue(manager);

    await expect(
      getAttendanceAccessAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({ ok: true, data: { scope: "all" } });
    expect(mocks.getOwnAttendanceLink).not.toHaveBeenCalled();
  });

  it("returns self scope for a server with a deliberate identity link", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);
    mocks.getOwnAttendanceLink.mockResolvedValue({
      ok: true,
      data: {
        profileId: serverId,
        neonUserId: 42,
        linkedBy: managerId,
        linkedAt: "2026-09-07T12:00:00.000Z",
      },
    });
    const person = {
      id: 42,
      fullName: "Server",
      role: "Server",
      phone: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      isActive: true,
    };
    mocks.getActiveNeonUsers.mockResolvedValue({ ok: true, data: [person] });

    await expect(
      getAttendanceAccessAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({
      ok: true,
      data: { scope: "self", neonUserId: 42, person },
    });
  });

  it("fails closed to unlinked when a server has no link", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    await expect(
      getAttendanceAccessAction({ restaurantSlug: "the-monks" }),
    ).resolves.toEqual({ ok: true, data: { scope: "unlinked" } });
    expect(mocks.getActiveNeonUsers).not.toHaveBeenCalled();
  });

  it("silently replaces a server's tampered user id with their linked id", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);
    mocks.getOwnAttendanceLink.mockResolvedValue({
      ok: true,
      data: {
        profileId: serverId,
        neonUserId: 42,
        linkedBy: managerId,
        linkedAt: "2026-09-07T12:00:00.000Z",
      },
    });
    mocks.getAttendanceRows.mockResolvedValue({ ok: true, data: [] });

    const result = await getAttendanceReportAction({
      restaurantSlug: "the-monks",
      userIds: [999],
      period: { type: "this-month" },
      todayLocalDate: "2026-09-07",
    });

    expect(result).toEqual({ ok: true, data: { rows: [] } });
    expect(mocks.getAttendanceRows).toHaveBeenCalledWith({
      userIds: [42],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("does not query Neon at all for an unlinked server", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    await expect(
      getAttendanceReportAction({
        restaurantSlug: "the-monks",
        userIds: [999],
        period: { type: "this-month" },
        todayLocalDate: "2026-09-07",
      }),
    ).resolves.toEqual({ ok: true, data: { rows: [] } });
    expect(mocks.getAttendanceRows).not.toHaveBeenCalled();
  });

  it("scopes every dashboard query to the server's linked identity", async () => {
    mocks.getCurrentUser.mockResolvedValue(server);
    mocks.getOwnAttendanceLink.mockResolvedValue({
      ok: true,
      data: {
        profileId: serverId,
        neonUserId: 42,
        linkedBy: managerId,
        linkedAt: "2026-09-07T12:00:00.000Z",
      },
    });
    mocks.getAttendanceRows.mockResolvedValue({ ok: true, data: [] });

    await expect(
      getAttendanceDashboardTotalsAction({
        restaurantSlug: "the-monks",
        todayLocalDate: "2026-09-07",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        day: { totalHours: 0, excludedRowCount: 0 },
        week: { totalHours: 0, excludedRowCount: 0 },
        month: { totalHours: 0, excludedRowCount: 0 },
      },
    });
    expect(mocks.getAttendanceRows).toHaveBeenCalledTimes(3);
    expect(mocks.getAttendanceRows).toHaveBeenNthCalledWith(1, {
      userIds: [42],
      startDate: "2026-09-07",
      endDate: "2026-09-07",
    });
    expect(mocks.getAttendanceRows).toHaveBeenNthCalledWith(2, {
      userIds: [42],
      startDate: "2026-09-07",
      endDate: "2026-09-13",
    });
    expect(mocks.getAttendanceRows).toHaveBeenNthCalledWith(3, {
      userIds: [42],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("rejects malformed action input before resolving authorization", async () => {
    await expect(
      getAttendanceReportAction({
        restaurantSlug: "../other-tenant",
        userIds: [-1],
        period: { type: "this-month" },
        todayLocalDate: "not-a-date",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "That attendance request is invalid.",
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });
});
