import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  guardModule: vi.fn(),
  listNativeAttendance: vi.fn(),
  listSessionBreaks: vi.fn(),
  getSessionHistory: vi.fn(),
  correctNativeAttendanceSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: mocks.guardModule,
}));
vi.mock("../data/native-report-data", () => ({
  listNativeAttendance: mocks.listNativeAttendance,
  listSessionBreaks: mocks.listSessionBreaks,
  NATIVE_REPORT_ROW_LIMIT: 2000,
}));
vi.mock("../data/native-correction-data", () => ({
  getSessionHistory: mocks.getSessionHistory,
  correctNativeAttendanceSession: mocks.correctNativeAttendanceSession,
}));

import {
  correctAttendanceSessionAction,
  getAttendanceSessionDetailAction,
  getAttendanceSourceAction,
  getNativeAttendanceReportAction,
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
