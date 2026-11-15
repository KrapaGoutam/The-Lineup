import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  getAttendanceEntryUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  guardModule: vi.fn(),
  readNativeFinancialAttendance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("../data/attendance-actor", () => ({
  getAttendanceEntryUser: mocks.getAttendanceEntryUser,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: mocks.guardModule,
}));
vi.mock("../data/native-financial-data", () => ({
  readNativeFinancialAttendance: mocks.readNativeFinancialAttendance,
}));

import { getAttendanceFinancialReadinessAction } from "./financial-readiness-actions";

const SLUG = "the-monks";
const LOC = "loc-1";
const ORG = "org-1";
const INPUT = {
  restaurantSlug: SLUG,
  startDate: "2026-05-01",
  endDate: "2026-05-31",
};

function locationDouble(
  row: { attendance_mode: string | null; time_zone: string } | null,
  error: unknown = null,
) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = async () => ({ data: row, error });
  return { from: vi.fn(() => builder) };
}

function signedIn(
  row: Parameters<typeof locationDouble>[0],
  error: unknown = null,
) {
  const client = locationDouble(row, error);
  mocks.createClient.mockResolvedValue(client);
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.getAttendanceEntryUser.mockResolvedValue({
    profileId: "p1",
    organizationId: ORG,
  });
  mocks.getPrimaryLocation.mockResolvedValue({
    id: LOC,
    time_zone: "America/Chicago",
  });
  mocks.guardModule.mockResolvedValue(null);
  return client;
}

const okRead = {
  status: "OK" as const,
  source: "INTERNAL_THE_LINEUP" as const,
  records: [],
  truncated: false,
};

beforeEach(() => vi.clearAllMocks());

describe("input validation", () => {
  it("rejects bad slug, inverted range and a range over 92 days before touching anything", async () => {
    for (const bad of [
      { ...INPUT, restaurantSlug: "Not A Slug!" },
      { ...INPUT, startDate: "2026-06-01", endDate: "2026-05-01" },
      { ...INPUT, startDate: "2026-01-01", endDate: "2026-12-31" },
      { ...INPUT, startDate: "nope" },
    ]) {
      expect((await getAttendanceFinancialReadinessAction(bad)).ok).toBe(false);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("identity, location and module gates", () => {
  it("fails closed for a dead session before resolving anyone", async () => {
    mocks.createClient.mockResolvedValue({});
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    expect(await getAttendanceFinancialReadinessAction(INPUT)).toMatchObject({
      ok: false,
      sessionInvalid: true,
    });
    expect(mocks.getAttendanceEntryUser).not.toHaveBeenCalled();
  });

  it("requires a canonical-context user and a verified location", async () => {
    signedIn({ attendance_mode: "internal_the_lineup", time_zone: "UTC" });
    mocks.getAttendanceEntryUser.mockResolvedValue(null);
    expect((await getAttendanceFinancialReadinessAction(INPUT)).ok).toBe(false);

    signedIn({ attendance_mode: "internal_the_lineup", time_zone: "UTC" });
    mocks.getPrimaryLocation.mockResolvedValue(null);
    expect(await getAttendanceFinancialReadinessAction(INPUT)).toMatchObject({
      ok: false,
      contextStale: true,
    });
    expect(mocks.readNativeFinancialAttendance).not.toHaveBeenCalled();
  });

  it("applies the attendance module guard to the verified location, and a denial stops everything", async () => {
    signedIn({ attendance_mode: "internal_the_lineup", time_zone: "UTC" });
    mocks.guardModule.mockResolvedValue({
      ok: false,
      error: "off",
      moduleUnavailable: true,
    });
    const res = await getAttendanceFinancialReadinessAction(INPUT);
    expect(res).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(mocks.guardModule).toHaveBeenCalledWith({
      module: "attendance",
      organizationId: ORG,
      location: { id: LOC, time_zone: "America/Chicago" },
    });
    expect(mocks.readNativeFinancialAttendance).not.toHaveBeenCalled();
  });

  it("R1 stale-tab binding: the preview is for the location on screen, never the other branch", async () => {
    const SHOWN = "00000000-0000-0000-0000-0000000000b2";
    const VERIFIED = "00000000-0000-0000-0000-0000000000b1";
    signedIn({ attendance_mode: "internal_the_lineup", time_zone: "UTC" });
    mocks.getPrimaryLocation.mockResolvedValue({
      id: VERIFIED,
      time_zone: "America/Chicago",
    });
    const res = await getAttendanceFinancialReadinessAction({
      ...INPUT,
      expectedLocationId: SHOWN,
    });
    expect(res).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.guardModule).not.toHaveBeenCalled();
    expect(mocks.readNativeFinancialAttendance).not.toHaveBeenCalled();

    mocks.readNativeFinancialAttendance.mockResolvedValue(okRead);
    const ok = await getAttendanceFinancialReadinessAction({
      ...INPUT,
      expectedLocationId: VERIFIED.toUpperCase(),
    });
    expect(ok.ok).toBe(true);
    expect(mocks.readNativeFinancialAttendance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: VERIFIED }),
    );
  });

  it("R1: a malformed expectedLocationId is rejected before anything is touched", async () => {
    expect(
      (
        await getAttendanceFinancialReadinessAction({
          ...INPUT,
          expectedLocationId: "loc-1",
        })
      ).ok,
    ).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("an unreadable location is an error, not a default mode", async () => {
    signedIn(null);
    expect((await getAttendanceFinancialReadinessAction(INPUT)).ok).toBe(false);
    signedIn(
      { attendance_mode: "internal_the_lineup", time_zone: "UTC" },
      { code: "XX000" },
    );
    expect((await getAttendanceFinancialReadinessAction(INPUT)).ok).toBe(false);
  });
});

describe("source selection — one source per location, never merged", () => {
  it("INTERNAL reads native records for the verified org/location/period and reports the policy block", async () => {
    signedIn({
      attendance_mode: "internal_the_lineup",
      time_zone: "America/Chicago",
    });
    mocks.readNativeFinancialAttendance.mockResolvedValue(okRead);
    const res = await getAttendanceFinancialReadinessAction(INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      kind: "NATIVE",
      previewOnly: true,
      state: "INTERNAL_THE_LINEUP",
      activation: { status: "BLOCKED_POLICY" },
      period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    });
    expect(mocks.readNativeFinancialAttendance).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizationId: ORG,
        locationId: LOC,
        timeZone: "America/Chicago",
        period: { startDate: "2026-05-01", endDate: "2026-05-31" },
      },
    );
  });

  it("the request can never name the location or organization: only the verified ones are used", async () => {
    signedIn({ attendance_mode: "internal_the_lineup", time_zone: "UTC" });
    mocks.readNativeFinancialAttendance.mockResolvedValue(okRead);
    await getAttendanceFinancialReadinessAction({
      ...INPUT,
      locationId: "attacker-loc",
      organizationId: "attacker-org",
    } as never);
    const call = mocks.readNativeFinancialAttendance.mock.calls[0][1];
    expect(call.locationId).toBe(LOC);
    expect(call.organizationId).toBe(ORG);
  });

  for (const mode of ["external", null]) {
    it(`${mode ?? "unconfigured"} is NOT read: no native query, no new Neon path`, async () => {
      signedIn({ attendance_mode: mode, time_zone: "UTC" });
      const res = await getAttendanceFinancialReadinessAction(INPUT);
      expect(res).toMatchObject({
        ok: true,
        data: {
          kind: "EXTERNAL_UNCHANGED",
          previewOnly: true,
          activation: { status: "ACTIVE_LEGACY_UNCHANGED" },
        },
      });
      expect(mocks.readNativeFinancialAttendance).not.toHaveBeenCalled();
    });
  }

  it("DISABLED yields no attendance hours and reads nothing", async () => {
    signedIn({ attendance_mode: "disabled", time_zone: "UTC" });
    const res = await getAttendanceFinancialReadinessAction(INPUT);
    expect(res).toMatchObject({
      ok: true,
      data: { kind: "DISABLED", activation: { status: "NO_ATTENDANCE_HOURS" } },
    });
    expect(mocks.readNativeFinancialAttendance).not.toHaveBeenCalled();
  });
});

describe("read outcomes are never flattened into an empty report", () => {
  beforeEach(() =>
    signedIn({
      attendance_mode: "internal_the_lineup",
      time_zone: "America/Chicago",
    }),
  );

  it("ACCESS_DENIED → access_denied error", async () => {
    mocks.readNativeFinancialAttendance.mockResolvedValue({
      status: "ACCESS_DENIED",
    });
    expect(await getAttendanceFinancialReadinessAction(INPUT)).toMatchObject({
      ok: false,
      code: "access_denied",
    });
  });

  for (const status of ["SOURCE_ERROR", "SOURCE_UNAVAILABLE"] as const) {
    it(`${status} → source_error, no readiness object`, async () => {
      mocks.readNativeFinancialAttendance.mockResolvedValue({
        status,
        source: "INTERNAL_THE_LINEUP",
      });
      const res = await getAttendanceFinancialReadinessAction(INPUT);
      expect(res).toMatchObject({ ok: false, code: "source_error" });
      expect(res).not.toHaveProperty("data");
    });
  }

  it("an OK read with excluded records reports them with reasons and incomplete totals", async () => {
    mocks.readNativeFinancialAttendance.mockResolvedValue({
      ...okRead,
      records: [
        {
          attendanceSource: "INTERNAL_THE_LINEUP",
          employeeId: "e1",
          externalUserId: null,
          sourceRecordId: "s1",
          serviceDate: "2026-05-04",
          isFinanciallyEligible: false,
          recordStatus: "UNCLASSIFIED_BREAK",
          ineligibilityReasons: ["UNCLASSIFIED_BREAK"],
          payable: { kind: "unresolved" },
        },
      ],
    });
    const res = await getAttendanceFinancialReadinessAction(INPUT);
    if (!res.ok || res.data.kind !== "NATIVE")
      throw new Error("expected NATIVE");
    expect(res.data.readiness.totalsComplete).toBe(false);
    expect(res.data.readiness.excludedByReason).toEqual({
      UNCLASSIFIED_BREAK: 1,
    });
    expect(res.data.readiness.employees[0].finalizable).toBe(false);
  });

  it("an unexpected throw is a generic error that leaks nothing", async () => {
    mocks.readNativeFinancialAttendance.mockRejectedValue(
      new Error("secret table x"),
    );
    const res = await getAttendanceFinancialReadinessAction(INPUT);
    expect(res).toEqual({
      ok: false,
      error: "Attendance data unavailable. Try again.",
    });
  });
});
