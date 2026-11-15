import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveClockedInRows: vi.fn(),
  listAttendanceIdentityLinks: vi.fn(),
  listOpenNativeSessionProfileIds: vi.fn(),
}));

vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveClockedInRows: mocks.getActiveClockedInRows,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  listAttendanceIdentityLinks: mocks.listAttendanceIdentityLinks,
}));
vi.mock("@/features/attendance/data/native-financial-data", () => ({
  listOpenNativeSessionProfileIds: mocks.listOpenNativeSessionProfileIds,
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

describe("fetchClockedInRoster — source selection by verified location (V2-006.006)", () => {
  const locationId = "00000000-0000-0000-0000-000000029777";

  function client(result: {
    data: { attendance_mode: string | null } | null;
    error: { code: string } | null;
  }) {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = async () => result;
    return { from: vi.fn(() => builder) } as never;
  }
  const modeOf = (attendance_mode: string | null) =>
    client({ data: { attendance_mode }, error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveClockedInRows.mockResolvedValue({
      ok: true,
      data: [activeRow(1)],
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [link("neon-person", 1)],
    });
  });

  it("INTERNAL: uses native open sessions and never touches the Neon reader or links", async () => {
    mocks.listOpenNativeSessionProfileIds.mockResolvedValue({
      ok: true,
      profileIds: ["native-a", "native-b"],
    });
    await expect(
      fetchClockedInRoster(modeOf("internal_the_lineup"), {
        organizationId,
        serviceDate: "2026-09-10",
        locationId,
      }),
    ).resolves.toEqual({ ok: true, data: ["native-a", "native-b"] });
    expect(mocks.listOpenNativeSessionProfileIds).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId, locationId },
    );
    expect(mocks.getActiveClockedInRows).not.toHaveBeenCalled();
    expect(mocks.listAttendanceIdentityLinks).not.toHaveBeenCalled();
  });

  it("INTERNAL: a failed native read is an error, never an empty or Neon-derived suggestion", async () => {
    mocks.listOpenNativeSessionProfileIds.mockResolvedValue({ ok: false });
    await expect(
      fetchClockedInRoster(modeOf("internal_the_lineup"), {
        organizationId,
        serviceDate: "2026-09-10",
        locationId,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Attendance data unavailable. Try again shortly.",
    });
    expect(mocks.getActiveClockedInRows).not.toHaveBeenCalled();
  });

  it("DISABLED: suggests nobody and reads no source", async () => {
    await expect(
      fetchClockedInRoster(modeOf("disabled"), {
        organizationId,
        serviceDate: "2026-09-10",
        locationId,
      }),
    ).resolves.toEqual({ ok: true, data: [] });
    expect(mocks.getActiveClockedInRows).not.toHaveBeenCalled();
    expect(mocks.listOpenNativeSessionProfileIds).not.toHaveBeenCalled();
  });

  for (const mode of ["external", null]) {
    it(`${mode ?? "unconfigured"}: keeps the existing Neon path exactly and never reads native`, async () => {
      await expect(
        fetchClockedInRoster(modeOf(mode), {
          organizationId,
          serviceDate: "2026-09-10",
          locationId,
        }),
      ).resolves.toEqual({ ok: true, data: ["neon-person"] });
      expect(mocks.getActiveClockedInRows).toHaveBeenCalledWith({
        serviceDate: "2026-09-10",
      });
      expect(mocks.listOpenNativeSessionProfileIds).not.toHaveBeenCalled();
    });
  }

  it("a database without the attendance-mode column (42703) is legacy: unchanged Neon path", async () => {
    await expect(
      fetchClockedInRoster(client({ data: null, error: { code: "42703" } }), {
        organizationId,
        serviceDate: "2026-09-10",
        locationId,
      }),
    ).resolves.toEqual({ ok: true, data: ["neon-person"] });
  });

  it("any other mode-read failure, or an unreadable location, fails closed (no guessed source)", async () => {
    for (const result of [
      { data: null, error: { code: "XX000" } },
      { data: null, error: null },
    ]) {
      mocks.getActiveClockedInRows.mockClear();
      await expect(
        fetchClockedInRoster(client(result), {
          organizationId,
          serviceDate: "2026-09-10",
          locationId,
        }),
      ).resolves.toEqual({
        ok: false,
        error: "Attendance data unavailable. Try again shortly.",
      });
      expect(mocks.getActiveClockedInRows).not.toHaveBeenCalled();
    }
  });

  it("without a locationId the behaviour is exactly the pre-V2 Neon path (no mode read)", async () => {
    const spy = vi.fn();
    await expect(
      fetchClockedInRoster({ from: spy } as never, {
        organizationId,
        serviceDate: "2026-09-10",
      }),
    ).resolves.toEqual({ ok: true, data: ["neon-person"] });
    expect(spy).not.toHaveBeenCalled();
  });
});
