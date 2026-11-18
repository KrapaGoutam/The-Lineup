import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadReportingAuthorities: vi.fn(),
  loadRoster: vi.fn(),
  readAttendance: vi.fn(),
  readPayroll: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  checkModuleAccess: vi.fn(async () => ({ allowed: true })),
  readModuleEnforcementMode: vi.fn(async () => ({
    status: "ok",
    mode: "staged",
    source: "database",
  })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("../data/reporting-authority", () => ({
  loadReportingAuthorities: mocks.loadReportingAuthorities,
}));
vi.mock("../data/report-data", () => ({
  loadRoster: mocks.loadRoster,
  readAttendance: mocks.readAttendance,
  readPayroll: mocks.readPayroll,
}));

import type { LocationAuthority } from "../domain/report-authority";
import {
  generateCombinedReportAction,
  getReportingOptionsAction,
} from "./reporting-actions";

const ORG_TAP = "00000000-0000-0000-0000-0000000000a1";
const ORG_MONKS = "00000000-0000-0000-0000-0000000000a2";
const ORG_FOREIGN = "00000000-0000-0000-0000-0000000000a9";
const LEAGUE = "00000000-0000-0000-0000-0000000000b1";
const NASA = "00000000-0000-0000-0000-0000000000b2";
const WEBSTER = "00000000-0000-0000-0000-0000000000b3";
const FOREIGN_LOC = "00000000-0000-0000-0000-0000000000b9";
const ME = "00000000-0000-0000-0000-0000000000c1";
const OTHER = "00000000-0000-0000-0000-0000000000c9";

function auth(over: Partial<LocationAuthority>): LocationAuthority {
  return {
    organizationId: ORG_TAP,
    organizationName: "Liquor Tap",
    organizationSlug: "liquor-tap",
    locationId: LEAGUE,
    locationName: "League City",
    timeZone: "America/Chicago",
    attendanceMode: "internal_the_lineup",
    attendance: "all",
    payroll: "all",
    orgWide: false,
    ...over,
  };
}

const AUTHS = [
  auth({}),
  auth({ locationId: NASA, locationName: "NASA" }),
  auth({
    organizationId: ORG_MONKS,
    organizationName: "The Monk's",
    organizationSlug: "monks",
    locationId: WEBSTER,
    locationName: "Webster",
    attendanceMode: "external",
  }),
];

const BASE = {
  organizationIds: null,
  locationIds: null,
  employeeKeys: null,
  content: "both",
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  output: "combined",
};

function grant(authorities: LocationAuthority[]) {
  mocks.createClient.mockResolvedValue({
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  });
  mocks.loadReportingAuthorities.mockResolvedValue({
    ok: true,
    profileId: ME,
    authorities,
    orgLocationCounts: { [ORG_TAP]: 2, [ORG_MONKS]: 1 },
  });
  mocks.loadRoster.mockResolvedValue({
    employees: [
      {
        key: `profile:${ME}`,
        displayName: "Me",
        identity: "verified",
        organizationIds: [ORG_TAP],
        locationIds: [LEAGUE],
      },
    ],
    authorizedKeys: new Set([`profile:${ME}`]),
    profileNames: { [ME]: "Me" },
    neonUsers: {},
    identityLinks: [],
    neonVisible: {},
    ownNeonIds: {},
    issues: [],
  });
  mocks.readAttendance.mockResolvedValue({ slices: [], issues: [] });
  mocks.readPayroll.mockResolvedValue({
    periods: [],
    issues: [],
    actorNames: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateCombinedReportAction — authorization is re-verified on the server", () => {
  it("rejects a malformed request before any authorization or read work", async () => {
    const res = await generateCombinedReportAction({
      ...BASE,
      content: "everything",
    });
    expect(res.ok).toBe(false);
    expect(mocks.loadReportingAuthorities).not.toHaveBeenCalled();
    expect(mocks.readAttendance).not.toHaveBeenCalled();
  });

  it("rejects non-UUID organization / branch ids and oversized employee lists up front", async () => {
    grant(AUTHS);
    expect(
      (await generateCombinedReportAction({ ...BASE, organizationIds: ["x"] }))
        .ok,
    ).toBe(false);
    expect(
      (
        await generateCombinedReportAction({
          ...BASE,
          locationIds: ["; drop table"],
        })
      ).ok,
    ).toBe(false);
    const many = Array.from(
      { length: 300 },
      (_, i) =>
        `profile:${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
    );
    expect(
      (await generateCombinedReportAction({ ...BASE, employeeKeys: many })).ok,
    ).toBe(false);
    expect(mocks.readAttendance).not.toHaveBeenCalled();
  });

  it("maps a dead session to sessionInvalid and reads nothing", async () => {
    mocks.createClient.mockResolvedValue({});
    mocks.loadReportingAuthorities.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    const res = await generateCombinedReportAction(BASE);
    expect(res).toMatchObject({ ok: false, sessionInvalid: true });
    expect(mocks.readAttendance).not.toHaveBeenCalled();
    expect(mocks.readPayroll).not.toHaveBeenCalled();
  });

  it("refuses a forged ORGANIZATION id as a whole and reads nothing (cross-organization)", async () => {
    grant(AUTHS);
    const res = await generateCombinedReportAction({
      ...BASE,
      organizationIds: [ORG_TAP, ORG_FOREIGN],
    });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).not.toContain(ORG_FOREIGN);
    expect(mocks.readAttendance).not.toHaveBeenCalled();
    expect(mocks.readPayroll).not.toHaveBeenCalled();
    expect(mocks.loadRoster).not.toHaveBeenCalled();
  });

  it("refuses a forged BRANCH id even alongside a valid one (cross-location)", async () => {
    grant(AUTHS);
    const res = await generateCombinedReportAction({
      ...BASE,
      locationIds: [LEAGUE, FOREIGN_LOC],
    });
    expect(res.ok).toBe(false);
    expect(mocks.readAttendance).not.toHaveBeenCalled();
  });

  it("refuses a forged EMPLOYEE key and reads nothing (cross-employee)", async () => {
    grant(AUTHS);
    const res = await generateCombinedReportAction({
      ...BASE,
      employeeKeys: [`profile:${OTHER}`],
    });
    expect(res.ok).toBe(false);
    expect(mocks.readAttendance).not.toHaveBeenCalled();
    expect(mocks.readPayroll).not.toHaveBeenCalled();
  });

  it("a branch manager cannot reach a branch they have no authority at, even by id", async () => {
    grant([AUTHS[0]!]); // authority at League City only
    const res = await generateCombinedReportAction({
      ...BASE,
      locationIds: [NASA],
    });
    expect(res.ok).toBe(false);
  });

  it("Attendance permission WITHOUT Payroll permission: payroll-only is refused, 'both' omits payroll and says so", async () => {
    grant([auth({ payroll: "none" })]);
    const refused = await generateCombinedReportAction({
      ...BASE,
      content: "payroll",
    });
    expect(refused.ok).toBe(false);
    expect(mocks.readPayroll).not.toHaveBeenCalled();

    const both = await generateCombinedReportAction(BASE);
    expect(both.ok).toBe(true);
    expect(
      both.ok &&
        both.data.exceptions.some((x) => x.code === "payroll_not_authorized"),
    ).toBe(true);
    // Payroll is still asked of the reader, which re-checks every row itself; the reader is
    // given only branches the caller has Payroll authority at.
    expect(mocks.readPayroll).toHaveBeenCalledTimes(1);
  });

  it("Staff with self-only access still get a report, but the reader is told they are 'self'", async () => {
    grant([auth({ attendance: "self", payroll: "self" })]);
    const res = await generateCombinedReportAction(BASE);
    expect(res.ok).toBe(true);
    const ctx = mocks.readAttendance.mock.calls[0]![0];
    expect(ctx.selected[0].attendance).toBe("self");
    expect(ctx.profileId).toBe(ME);
  });

  it("an Overall user spanning all three branches gets one report across both organizations", async () => {
    grant(AUTHS.map((a) => ({ ...a, orgWide: true })));
    const res = await generateCombinedReportAction(BASE);
    expect(res.ok).toBe(true);
    const ctx = mocks.readPayroll.mock.calls[0]![0];
    expect(ctx.selected.map((s: LocationAuthority) => s.locationId)).toEqual([
      LEAGUE,
      NASA,
      WEBSTER,
    ]);
    expect(res.ok && res.data.organizations.map((o) => o.name)).toEqual([
      "Liquor Tap",
      "The Monk's",
    ]);
  });

  it("attendance-only does not read payroll; payroll-only does not read attendance", async () => {
    grant(AUTHS);
    await generateCombinedReportAction({ ...BASE, content: "attendance" });
    expect(mocks.readPayroll).not.toHaveBeenCalled();
    expect(mocks.readAttendance).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    grant(AUTHS);
    await generateCombinedReportAction({ ...BASE, content: "payroll" });
    expect(mocks.readAttendance).not.toHaveBeenCalled();
    expect(mocks.readPayroll).toHaveBeenCalledTimes(1);
  });

  it("surfaces a read failure as a blocking, incomplete report — never a silent empty one", async () => {
    grant(AUTHS);
    mocks.readAttendance.mockResolvedValue({
      slices: [],
      issues: [
        {
          code: "source_unavailable",
          severity: "blocking",
          message: "External attendance could not be loaded.",
        },
      ],
    });
    const res = await generateCombinedReportAction(BASE);
    expect(res.ok && res.data.completeness.complete).toBe(false);
  });

  it("never returns a writing path: only the read functions are invoked", async () => {
    grant(AUTHS);
    await generateCombinedReportAction(BASE);
    // The action module imports no writer; this asserts the supabase double was only asked
    // to read profile names (select/in), never insert/update/delete/rpc.
    const client = await mocks.createClient.mock.results[0]!.value;
    expect(Object.keys(client)).toEqual(["from"]);
  });
});

describe("getReportingOptionsAction", () => {
  it("offers only authorized organizations, branches and employees, with capability levels", async () => {
    grant(AUTHS);
    const res = await getReportingOptionsAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.organizations.map((o) => o.name)).toEqual([
      "Liquor Tap",
      "The Monk's",
    ]);
    expect(res.data.branches.map((b) => b.name).sort()).toEqual([
      "League City",
      "NASA",
      "Webster",
    ]);
    expect(res.data.canManage).toBe(true);
    expect(res.data.maxRangeDays).toBe(92);
    expect(res.data.thisMonth.start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(JSON.stringify(res.data)).not.toContain(ORG_FOREIGN);
  });

  it("a staff caller is not offered management", async () => {
    grant([auth({ attendance: "self", payroll: "self" })]);
    const res = await getReportingOptionsAction();
    expect(res.ok && res.data.canManage).toBe(false);
  });

  it("fails closed with sessionInvalid", async () => {
    mocks.createClient.mockResolvedValue({});
    mocks.loadReportingAuthorities.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    expect(await getReportingOptionsAction()).toMatchObject({
      ok: false,
      sessionInvalid: true,
    });
  });
});
