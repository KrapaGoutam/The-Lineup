import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveClockedInRows: vi.fn(),
  listAttendanceIdentityLinks: vi.fn(),
}));

vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveClockedInRows: mocks.getActiveClockedInRows,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  listAttendanceIdentityLinks: mocks.listAttendanceIdentityLinks,
}));

import { fetchClockedInRoster } from "./fetch-clocked-in-roster";

const organizationId = "00000000-0000-0000-0000-000000029001";
const supabase = {} as never;

function activeRow(userId: number, id = userId) {
  return {
    id,
    userId,
    date: "2026-09-10",
    clockIn: "2026-09-10T11:00:00-05:00",
    clockOut: null,
    hoursWorked: null,
    autoClockedOut: false,
  };
}

function link(profileId: string, neonUserId: number) {
  return {
    profileId,
    neonUserId,
    linkedBy: "00000000-0000-0000-0000-0000000000aa",
    linkedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("fetchClockedInRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves an active Neon row to its linked profile id, strictly by id, never by name", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({
      ok: true,
      data: [activeRow(1)],
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [link("profile-a", 1)],
    });

    await expect(
      fetchClockedInRoster(supabase, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({ ok: true, data: ["profile-a"] });
  });

  it("silently excludes an active Neon user with no identity link at all", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({
      ok: true,
      data: [activeRow(1), activeRow(2)],
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [link("profile-a", 1)], // Neon user 2 has no link
    });

    await expect(
      fetchClockedInRoster(supabase, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({ ok: true, data: ["profile-a"] });
  });

  it("dedupes if the same linked person somehow has more than one open row", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({
      ok: true,
      data: [activeRow(1, 101), activeRow(1, 102)],
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [link("profile-a", 1)],
    });

    const result = await fetchClockedInRoster(supabase, {
      organizationId,
      serviceDate: "2026-09-10",
    });
    expect(result).toEqual({ ok: true, data: ["profile-a"] });
  });

  it("returns an empty roster when nobody is currently clocked in", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({ ok: true, data: [] });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [link("profile-a", 1)],
    });

    await expect(
      fetchClockedInRoster(supabase, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({ ok: true, data: [] });
  });

  it("propagates a failure from the Neon read without consulting links", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({
      ok: false,
      error: "Attendance data unavailable. Try again shortly.",
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({ ok: true, data: [] });

    await expect(
      fetchClockedInRoster(supabase, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Attendance data unavailable. Try again shortly.",
    });
  });

  it("propagates a failure from the identity-link read", async () => {
    mocks.getActiveClockedInRows.mockResolvedValue({ ok: true, data: [] });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: false,
      error: "Unable to reach attendance links right now.",
    });

    await expect(
      fetchClockedInRoster(supabase, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Unable to reach attendance links right now.",
    });
  });
});
