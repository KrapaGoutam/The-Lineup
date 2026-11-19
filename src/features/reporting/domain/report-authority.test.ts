import { describe, expect, it } from "vitest";

import type { ResolverCapability } from "@/features/auth/domain/access-resolver";

import {
  resolveLocationAuthority,
  resolveReportSelection,
  validateEmployeeSelection,
  type AuthorityFacts,
  type LocationAuthority,
} from "./report-authority";

const MEMBER: ResolverCapability[] = [
  "org:member",
  "location:access",
  "location:operate",
];
const MANAGER: ResolverCapability[] = [
  ...MEMBER,
  "location:manage",
  "location:assistant_manage",
];
const ORG_ADMIN: ResolverCapability[] = [...MANAGER, "org:admin"];

function facts(over: Partial<AuthorityFacts>): AuthorityFacts {
  return {
    organizationId: "org-tap",
    organizationName: "Liquor Tap",
    organizationSlug: "liquor-tap",
    locationId: "loc-league",
    locationName: "League City",
    timeZone: "America/Chicago",
    attendanceMode: "internal_the_lineup",
    allowed: true,
    capabilities: MEMBER,
    attendanceModuleUsable: true,
    payrollModuleUsable: true,
    dbAttendanceManage: false,
    ...over,
  };
}

describe("resolveLocationAuthority (fail closed)", () => {
  it("staff get SELF attendance and SELF payroll only", () => {
    const a = resolveLocationAuthority(facts({}));
    expect(a.attendance).toBe("self");
    expect(a.payroll).toBe("self");
    expect(a.orgWide).toBe(false);
  });

  it("a branch manager gets ALL at the branch, never org-wide", () => {
    const a = resolveLocationAuthority(
      facts({ capabilities: MANAGER, dbAttendanceManage: true }),
    );
    expect(a.attendance).toBe("all");
    expect(a.payroll).toBe("all");
    expect(a.orgWide).toBe(false);
  });

  it("organization admins / overall managers are org-wide", () => {
    const a = resolveLocationAuthority(
      facts({ capabilities: ORG_ADMIN, dbAttendanceManage: true }),
    );
    expect(a.orgWide).toBe(true);
    expect(a.payroll).toBe("all");
  });

  it("attendance permission WITHOUT payroll permission is possible (module off)", () => {
    const a = resolveLocationAuthority(
      facts({
        capabilities: MANAGER,
        dbAttendanceManage: true,
        payrollModuleUsable: false,
      }),
    );
    expect(a.attendance).toBe("all");
    expect(a.payroll).toBe("none");
  });

  it("the database verdict wins over a stale resolver (revoked → no manage)", () => {
    const a = resolveLocationAuthority(
      facts({ capabilities: MANAGER, dbAttendanceManage: false }),
    );
    expect(a.attendance).toBe("self");
    expect(a.payroll).toBe("self");
  });

  it("a database 'yes' without management tier never grants payroll-all", () => {
    const a = resolveLocationAuthority(
      facts({ capabilities: MEMBER, dbAttendanceManage: true }),
    );
    expect(a.attendance).toBe("all");
    expect(a.payroll).toBe("self");
  });

  it("no location access or a disallowed resolution grants nothing", () => {
    expect(resolveLocationAuthority(facts({ allowed: false })).attendance).toBe(
      "none",
    );
    expect(
      resolveLocationAuthority(facts({ capabilities: ["org:member"] })).payroll,
    ).toBe("none");
  });

  it("a disabled module removes that content even for an owner", () => {
    const a = resolveLocationAuthority(
      facts({
        capabilities: ORG_ADMIN,
        dbAttendanceManage: true,
        attendanceModuleUsable: false,
      }),
    );
    expect(a.attendance).toBe("none");
    expect(a.payroll).toBe("all");
  });
});

function auth(over: Partial<LocationAuthority>): LocationAuthority {
  return {
    organizationId: "org-tap",
    organizationName: "Liquor Tap",
    organizationSlug: "liquor-tap",
    locationId: "loc-league",
    locationName: "League City",
    timeZone: "America/Chicago",
    attendanceMode: "internal_the_lineup",
    attendance: "all",
    payroll: "all",
    orgWide: false,
    ...over,
  };
}

const LEAGUE = auth({});
const NASA = auth({ locationId: "loc-nasa", locationName: "NASA" });
const WEBSTER = auth({
  organizationId: "org-monks",
  organizationName: "The Monk's",
  locationId: "loc-webster",
  locationName: "Webster",
  attendanceMode: "external",
});

const BASE = {
  organizationIds: null,
  locationIds: null,
  employeeKeys: null,
  content: "both" as const,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
};

describe("resolveReportSelection", () => {
  it("all authorized = everything the caller may see, nothing more", () => {
    const r = resolveReportSelection([LEAGUE, NASA, WEBSTER], BASE);
    expect(r.ok && r.locations.map((l) => l.locationId)).toEqual([
      "loc-league",
      "loc-nasa",
      "loc-webster",
    ]);
  });

  it("refuses a forged organization id as a whole, with a non-disclosing message", () => {
    const r = resolveReportSelection([LEAGUE], {
      ...BASE,
      organizationIds: ["org-other"],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("forbidden_selection");
    expect(!r.ok && r.message).not.toMatch(/org-other/);
  });

  it("refuses a forged branch id even when another branch in the request is valid", () => {
    const r = resolveReportSelection([LEAGUE], {
      ...BASE,
      locationIds: ["loc-league", "loc-hidden"],
    });
    expect(!r.ok && r.code).toBe("forbidden_selection");
  });

  it("refuses a branch paired with an organization that does not own it", () => {
    const r = resolveReportSelection([LEAGUE, WEBSTER], {
      ...BASE,
      organizationIds: ["org-monks"],
      locationIds: ["loc-league"],
    });
    expect(!r.ok && r.code).toBe("forbidden_selection");
  });

  it("supports multiple selected branches and filters to them", () => {
    const r = resolveReportSelection([LEAGUE, NASA, WEBSTER], {
      ...BASE,
      locationIds: ["loc-league", "loc-nasa"],
    });
    expect(r.ok && r.locations.map((l) => l.locationName)).toEqual([
      "League City",
      "NASA",
    ]);
  });

  it("reports (does not silently drop) branches where the requested content is not authorized", () => {
    const noPayroll = auth({
      locationId: "loc-nasa",
      locationName: "NASA",
      payroll: "none",
    });
    const r = resolveReportSelection([LEAGUE, noPayroll], BASE);
    expect(r.ok && r.notAuthorizedFor).toEqual([
      expect.objectContaining({ content: "payroll" }),
    ]);
  });

  it("refuses payroll-only when no selected branch grants payroll", () => {
    const none = auth({ payroll: "none" });
    const r = resolveReportSelection([none], { ...BASE, content: "payroll" });
    expect(!r.ok && r.code).toBe("content_not_authorized");
  });

  it("enforces the 92-day range and valid ordering", () => {
    expect(
      resolveReportSelection([LEAGUE], {
        ...BASE,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toMatchObject({ ok: false, code: "range_too_long" });
    expect(
      resolveReportSelection([LEAGUE], {
        ...BASE,
        startDate: "2026-11-30",
        endDate: "2026-11-01",
      }),
    ).toMatchObject({ ok: false, code: "invalid_range" });
  });

  it("rejects an oversized employee selection instead of silently truncating it", () => {
    const keys = Array.from({ length: 201 }, (_, i) => `profile:${i}`);
    expect(
      resolveReportSelection([LEAGUE], { ...BASE, employeeKeys: keys }),
    ).toMatchObject({ ok: false, code: "too_many_employees" });
  });

  it("an empty authority list authorizes nothing", () => {
    expect(resolveReportSelection([], BASE)).toMatchObject({
      ok: false,
      code: "nothing_authorized",
    });
  });
});

describe("validateEmployeeSelection", () => {
  const roster = new Set(["profile:a", "profile:b"]);
  it("accepts null and rostered keys", () => {
    expect(validateEmployeeSelection(null, roster).ok).toBe(true);
    expect(validateEmployeeSelection(["profile:a"], roster).ok).toBe(true);
  });
  it("refuses a forged employee key", () => {
    const r = validateEmployeeSelection(["profile:a", "profile:zzz"], roster);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).not.toMatch(/zzz/);
  });
});
