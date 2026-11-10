import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  guardModule: vi.fn(),
  listNativeAttendance: vi.fn(),
  listSessionBreaks: vi.fn(),
  listLocationEmployees: vi.fn(),
  getSessionHistory: vi.fn(),
  correctNativeAttendanceSession: vi.fn(),
  submitManualAttendanceEntry: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("../data/attendance-actor", () => ({
  getAttendanceEntryUser: mocks.getCurrentUser,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: mocks.guardModule,
}));
vi.mock("../data/native-report-data", () => ({
  listNativeAttendance: mocks.listNativeAttendance,
  listSessionBreaks: mocks.listSessionBreaks,
  listLocationEmployees: mocks.listLocationEmployees,
  NATIVE_REPORT_ROW_LIMIT: 2000,
}));
vi.mock("../data/native-correction-data", () => ({
  getSessionHistory: mocks.getSessionHistory,
  correctNativeAttendanceSession: mocks.correctNativeAttendanceSession,
  submitManualAttendanceEntry: mocks.submitManualAttendanceEntry,
}));

import {
  correctAttendanceSessionAction,
  createBulkAttendanceEntriesAction,
  createManualAttendanceEntryAction,
  getAttendanceSessionDetailAction,
  getAttendanceSourceAction,
  getNativeAttendanceReportAction,
  listLocationEmployeesAction,
} from "./native-report-actions";

const SLUG = "monks-ale-house";
const LOC = "00000000-0000-0000-0000-0000000000b1";
const OTHER_LOC = "00000000-0000-0000-0000-0000000000b2";
const SESSION = "00000000-0000-0000-0000-00000000aaaa";
const PROFILE = "00000000-0000-0000-0000-0000000000c1";

/** Minimal chainable Supabase double: tables resolve to canned rows. */
function supabaseDouble(opts: {
  mode?: string | null;
  canManage?: boolean;
  sessionAtLocation?: boolean;
  locationRow?: boolean;
}) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: opts.canManage ?? false, error: null });
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    const result =
      table === "locations"
        ? {
            data:
              opts.locationRow === false
                ? null
                : {
                    name: "Monks Ale House",
                    attendance_mode: opts.mode ?? null,
                    time_zone: "America/Chicago",
                  },
            error: null,
          }
        : table === "attendance_session_summaries"
          ? {
              data:
                opts.sessionAtLocation === false
                  ? null
                  : { session_id: SESSION },
              error: null,
            }
          : { data: [], error: null };
    for (const m of ["select", "eq", "in"]) builder[m] = () => builder;
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return builder;
  });
  return { from, rpc };
}

function signedIn(double: ReturnType<typeof supabaseDouble>) {
  mocks.createClient.mockResolvedValue(double);
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.getCurrentUser.mockResolvedValue({
    profileId: PROFILE,
    organizationId: "org-1",
  });
  mocks.getPrimaryLocation.mockResolvedValue({
    id: LOC,
    time_zone: "America/Chicago",
  });
  mocks.guardModule.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("context resolution (shared by every action)", () => {
  it("fails closed for a dead session before touching anything", async () => {
    mocks.createClient.mockResolvedValue(supabaseDouble({}));
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    const res = await getAttendanceSourceAction({ restaurantSlug: SLUG });
    expect(res).toMatchObject({ ok: false, sessionInvalid: true });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("requires a signed-in member and a verified location", async () => {
    signedIn(supabaseDouble({}));
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await getAttendanceSourceAction({ restaurantSlug: SLUG })).ok).toBe(
      false,
    );

    signedIn(supabaseDouble({}));
    mocks.getPrimaryLocation.mockResolvedValue(null);
    expect(
      await getAttendanceSourceAction({ restaurantSlug: SLUG }),
    ).toMatchObject({
      ok: false,
      contextStale: true,
    });
  });

  it("applies the module guard to the verified location and honours a denial", async () => {
    signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
    mocks.guardModule.mockResolvedValue({
      ok: false,
      error: "off",
      moduleUnavailable: true,
    });
    const res = await getAttendanceSourceAction({ restaurantSlug: SLUG });
    expect(res).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(mocks.guardModule).toHaveBeenCalledWith({
      module: "attendance",
      organizationId: "org-1",
      location: { id: LOC, time_zone: "America/Chicago" },
    });
  });
});

describe("getAttendanceSourceAction", () => {
  it.each([
    ["internal_the_lineup", "internal"],
    ["external", "external"],
    ["disabled", "disabled"],
    [null, "unconfigured"],
  ])("mode %s → source %s", async (mode, source) => {
    signedIn(supabaseDouble({ mode, canManage: true }));
    const res = await getAttendanceSourceAction({ restaurantSlug: SLUG });
    expect(res.ok && res.data.source).toBe(source);
    expect(res.ok && res.data.canManage).toBe(true);
    expect(res.ok && res.data.locationId).toBe(LOC);
  });

  it("rejects a malformed slug", async () => {
    expect(
      await getAttendanceSourceAction({ restaurantSlug: "../etc" }),
    ).toMatchObject({ ok: false });
  });
});

describe("getNativeAttendanceReportAction", () => {
  const input = {
    restaurantSlug: SLUG,
    startDate: "2026-11-01",
    endDate: "2026-11-09",
  };

  it("reads the VERIFIED location, never one named by the request", async () => {
    signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
    mocks.listNativeAttendance.mockResolvedValue({
      ok: true,
      rows: [],
      truncated: false,
    });
    await getNativeAttendanceReportAction({
      ...input,
      // A tampered extra field must be ignored.
      ...({ locationId: OTHER_LOC } as object),
    });
    expect(mocks.listNativeAttendance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: LOC }),
    );
  });

  it.each(["external", "disabled", null])(
    "never reads native records (or falls back to them) in mode %s",
    async (mode) => {
      signedIn(supabaseDouble({ mode }));
      const res = await getNativeAttendanceReportAction(input);
      expect(res).toMatchObject({ ok: false, code: "not_internal" });
      expect(mocks.listNativeAttendance).not.toHaveBeenCalled();
    },
  );

  it("returns rows with honest totals and the location's time zone", async () => {
    signedIn(supabaseDouble({ mode: "internal_the_lineup", canManage: true }));
    mocks.listNativeAttendance.mockResolvedValue({
      ok: true,
      rows: [],
      truncated: true,
    });
    const res = await getNativeAttendanceReportAction(input);
    expect(res.ok && res.data).toMatchObject({
      truncated: true,
      timeZone: "America/Chicago",
      canManage: true,
    });
  });

  it("passes the employee filter through as a narrowing filter only", async () => {
    signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
    mocks.listNativeAttendance.mockResolvedValue({
      ok: true,
      rows: [],
      truncated: false,
    });
    await getNativeAttendanceReportAction({ ...input, profileId: PROFILE });
    expect(mocks.listNativeAttendance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ profileId: PROFILE }),
    );
  });

  describe("stale-tab binding (R1): the rows must be for the location on screen", () => {
    it("refuses to read when the location the UI shows is not the verified one", async () => {
      signedIn(
        supabaseDouble({ mode: "internal_the_lineup", canManage: true }),
      );
      const res = await getNativeAttendanceReportAction({
        ...input,
        expectedLocationId: OTHER_LOC,
      });
      expect(res).toMatchObject({ ok: false, contextStale: true });
      expect(mocks.listNativeAttendance).not.toHaveBeenCalled();
      // Refused before the module guard and the database are consulted for the wrong branch.
      expect(mocks.guardModule).not.toHaveBeenCalled();
    });

    it("proceeds when the expectation matches (case-insensitive)", async () => {
      signedIn(
        supabaseDouble({ mode: "internal_the_lineup", canManage: true }),
      );
      mocks.listNativeAttendance.mockResolvedValue({
        ok: true,
        rows: [],
        truncated: false,
      });
      const res = await getNativeAttendanceReportAction({
        ...input,
        expectedLocationId: LOC.toUpperCase(),
      });
      expect(res.ok).toBe(true);
      expect(mocks.listNativeAttendance).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ locationId: LOC }),
      );
    });

    it("a malformed expectation is an invalid request, not a silent pass", async () => {
      signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
      expect(
        await getNativeAttendanceReportAction({
          ...input,
          expectedLocationId: "not-a-uuid",
        }),
      ).toMatchObject({ ok: false });
      expect(mocks.listNativeAttendance).not.toHaveBeenCalled();
    });

    it("an omitted expectation keeps the direct/legacy behaviour (verified location)", async () => {
      signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
      mocks.listNativeAttendance.mockResolvedValue({
        ok: true,
        rows: [],
        truncated: false,
      });
      expect((await getNativeAttendanceReportAction(input)).ok).toBe(true);
    });
  });

  it("rejects invalid ranges", async () => {
    signedIn(supabaseDouble({ mode: "internal_the_lineup" }));
    for (const bad of [
      { ...input, startDate: "2026-11-09", endDate: "2026-11-01" },
      { ...input, startDate: "2026-01-01", endDate: "2026-11-09" },
      { ...input, startDate: "11/01/2026" },
      { ...input, profileId: "not-a-uuid" },
    ]) {
      expect(await getNativeAttendanceReportAction(bad)).toMatchObject({
        ok: false,
      });
    }
    expect(mocks.listNativeAttendance).not.toHaveBeenCalled();
  });
});

describe("getAttendanceSessionDetailAction", () => {
  it("refuses a session that is not at the verified location", async () => {
    signedIn(supabaseDouble({ sessionAtLocation: false }));
    const res = await getAttendanceSessionDetailAction({
      restaurantSlug: SLUG,
      sessionId: SESSION,
    });
    expect(res.ok).toBe(false);
    expect(mocks.getSessionHistory).not.toHaveBeenCalled();
  });

  it("returns breaks and the full history", async () => {
    signedIn(supabaseDouble({}));
    mocks.listSessionBreaks.mockResolvedValue({ ok: true, breaks: [] });
    mocks.getSessionHistory.mockResolvedValue({ ok: true, data: [] });
    const res = await getAttendanceSessionDetailAction({
      restaurantSlug: SLUG,
      sessionId: SESSION,
    });
    expect(res.ok && res.data).toMatchObject({ breaks: [], history: [] });
  });
});

describe("correctAttendanceSessionAction", () => {
  const good = {
    restaurantSlug: SLUG,
    sessionId: SESSION,
    expectedVersion: 2,
    reason: "Forgot to clock out",
    clockOutAt: "2026-11-09T19:00:00Z",
  };

  it("rejects an empty reason before any database call", async () => {
    signedIn(supabaseDouble({}));
    const res = await correctAttendanceSessionAction({ ...good, reason: "  " });
    expect(res.ok).toBe(false);
    expect(mocks.correctNativeAttendanceSession).not.toHaveBeenCalled();
  });

  it("refuses to act on a session at a different location than the verified one", async () => {
    signedIn(supabaseDouble({ sessionAtLocation: false }));
    const res = await correctAttendanceSessionAction(good);
    expect(res).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.correctNativeAttendanceSession).not.toHaveBeenCalled();
  });

  it("applies a valid correction and refreshes the report", async () => {
    signedIn(supabaseDouble({}));
    mocks.correctNativeAttendanceSession.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        idempotent: false,
        sessionId: SESSION,
        eventId: 9,
        correctionSeq: 1,
        version: 3,
      },
    });
    const res = await correctAttendanceSessionAction(good);
    expect(res.ok && res.data.version).toBe(3);
    expect(mocks.correctNativeAttendanceSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: SESSION,
        expectedVersion: 2,
        reason: "Forgot to clock out",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("surfaces database denials (stale / unauthorized) with their code", async () => {
    signedIn(supabaseDouble({}));
    mocks.correctNativeAttendanceSession.mockResolvedValue({
      ok: false,
      code: "stale",
      error:
        "This record was changed by someone else. Reload it and try again.",
    });
    const res = await correctAttendanceSessionAction(good);
    expect(res).toMatchObject({ ok: false, code: "stale" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("listLocationEmployeesAction", () => {
  it("rejects an invalid restaurant slug", async () => {
    const res = await listLocationEmployeesAction({
      restaurantSlug: "INVALID SLUG",
    });
    expect(res.ok).toBe(false);
  });

  it("denies access if caller lacks manager authority", async () => {
    signedIn(supabaseDouble({ canManage: false }));
    const res = await listLocationEmployeesAction({ restaurantSlug: SLUG });
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("returns employees for authorized managers", async () => {
    signedIn(supabaseDouble({ canManage: true }));
    mocks.listLocationEmployees.mockResolvedValue({
      ok: true,
      employees: [{ profileId: PROFILE, displayName: "Alice Server" }],
    });
    const res = await listLocationEmployeesAction({ restaurantSlug: SLUG });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([
        { profileId: PROFILE, displayName: "Alice Server" },
      ]);
    }
  });
});

describe("createManualAttendanceEntryAction", () => {
  const validEntry = {
    restaurantSlug: SLUG,
    profileId: PROFILE,
    serviceDate: "2026-11-09",
    clockInAt: "2026-11-09T15:00:00.000Z", // 09:00 AM America/Chicago
    clockOutAt: "2026-11-09T23:00:00.000Z", // 05:00 PM America/Chicago
    reason: "Missed punch entry by manager.",
    idempotencyKey: "op-manual-1",
  };

  it("denies access if caller lacks manager authority", async () => {
    signedIn(supabaseDouble({ canManage: false }));
    const res = await createManualAttendanceEntryAction(validEntry);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
    expect(mocks.submitManualAttendanceEntry).not.toHaveBeenCalled();
  });

  it("refuses when location is not internal attendance mode", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "external" }));
    const res = await createManualAttendanceEntryAction(validEntry);
    expect(res).toMatchObject({ ok: false, code: "not_internal" });
    expect(mocks.submitManualAttendanceEntry).not.toHaveBeenCalled();
  });

  it("fails if clock-in local date does not match service date", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "internal_the_lineup" }));
    const res = await createManualAttendanceEntryAction({
      ...validEntry,
      serviceDate: "2026-11-10", // mismatch: 15:00 UTC on Nov 9 is Nov 9 in Chicago
    });
    expect(res).toMatchObject({ ok: false, code: "invalid" });
    expect(mocks.submitManualAttendanceEntry).not.toHaveBeenCalled();
  });

  it("creates a manual entry, calls revalidatePath, and returns success response", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "internal_the_lineup" }));
    mocks.submitManualAttendanceEntry.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        idempotent: false,
        sessionId: SESSION,
        eventId: 101,
        clockOutEventId: 102,
        status: "completed",
      },
    });

    const res = await createManualAttendanceEntryAction(validEntry);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sessionId).toBe(SESSION);
      expect(res.data.status).toBe("completed");
    }
    expect(mocks.submitManualAttendanceEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locationId: LOC,
        profileId: PROFILE,
        serviceDate: "2026-11-09",
        idempotencyKey: "op-manual-1",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/attendance");
  });

  it("propagates database error codes (e.g. overlap or period_frozen)", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "internal_the_lineup" }));
    mocks.submitManualAttendanceEntry.mockResolvedValue({
      ok: false,
      code: "period_frozen",
      error:
        "Attendance cannot be recorded in an existing or frozen payroll month.",
    });

    const res = await createManualAttendanceEntryAction(validEntry);
    expect(res).toMatchObject({
      ok: false,
      code: "period_frozen",
      error: expect.stringContaining("frozen payroll month"),
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createBulkAttendanceEntriesAction", () => {
  const row1 = {
    rowId: "row-1",
    profileId: PROFILE,
    serviceDate: "2026-11-09",
    clockInAt: "2026-11-09T15:00:00.000Z",
    clockOutAt: "2026-11-09T19:00:00.000Z",
    reason: "Bulk entry 1",
    idempotencyKey: "bulk-key-1",
  };
  const row2 = {
    rowId: "row-2",
    profileId: "00000000-0000-0000-0000-0000000000c2",
    serviceDate: "2026-11-09",
    clockInAt: "2026-11-09T16:00:00.000Z",
    clockOutAt: "2026-11-09T22:00:00.000Z",
    reason: "Bulk entry 2",
    idempotencyKey: "bulk-key-2",
  };

  it("rejects empty batch", async () => {
    const res = await createBulkAttendanceEntriesAction({
      restaurantSlug: SLUG,
      entries: [],
    });
    expect(res.ok).toBe(false);
  });

  it("catches batch internal overlaps without calling submit for overlapping rows", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "internal_the_lineup" }));
    const overlappingRow2 = {
      ...row2,
      profileId: PROFILE, // same employee
      clockInAt: "2026-11-09T18:00:00.000Z", // overlaps row1
    };

    const res = await createBulkAttendanceEntriesAction({
      restaurantSlug: SLUG,
      entries: [row1, overlappingRow2],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.succeededCount).toBe(0);
      expect(res.data.failedCount).toBe(2);
      expect(res.data.results[0].code).toBe("overlap");
      expect(res.data.results[1].code).toBe("overlap");
    }
    expect(mocks.submitManualAttendanceEntry).not.toHaveBeenCalled();
  });

  it("executes independent rows and handles partial success and failure", async () => {
    signedIn(supabaseDouble({ canManage: true, mode: "internal_the_lineup" }));
    // row1 succeeds, row2 fails in database
    mocks.submitManualAttendanceEntry
      .mockResolvedValueOnce({
        ok: true,
        data: {
          success: true,
          idempotent: false,
          sessionId: "sess-1",
          eventId: 1,
          status: "completed",
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "overlap",
        error:
          "This entry overlaps another attendance session for the employee.",
      });

    const res = await createBulkAttendanceEntriesAction({
      restaurantSlug: SLUG,
      entries: [row1, row2],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.succeededCount).toBe(1);
      expect(res.data.failedCount).toBe(1);
      expect(res.data.results[0]).toMatchObject({ rowId: "row-1", ok: true });
      expect(res.data.results[1]).toMatchObject({
        rowId: "row-2",
        ok: false,
        code: "overlap",
      });
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/attendance");
  });
});
