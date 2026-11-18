import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
  listAttendanceIdentityLinks: vi.fn(),
  listLocationEmployees: vi.fn(),
  listNativeAttendance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveNeonUsers: mocks.getActiveNeonUsers,
  getAttendanceRows: mocks.getAttendanceRows,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  listAttendanceIdentityLinks: mocks.listAttendanceIdentityLinks,
}));
vi.mock("@/features/attendance/data/native-report-data", () => ({
  listLocationEmployees: mocks.listLocationEmployees,
  listNativeAttendance: mocks.listNativeAttendance,
}));

import type { LocationAuthority } from "../domain/report-authority";
import {
  loadRoster,
  readAttendance,
  readPayroll,
  type ReadContext,
  type Roster,
} from "./report-data";

const TAP = "org-tap";
const MONKS = "org-monks";
const LEAGUE = "loc-league";
const NASA = "loc-nasa";
const WEBSTER = "loc-webster";
const ME = "p-me";
const OTHER = "p-other";

function auth(over: Partial<LocationAuthority>): LocationAuthority {
  return {
    organizationId: TAP,
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

type PeriodRow = Record<string, unknown>;
function periodRow(over: PeriodRow): PeriodRow {
  return {
    id: 1,
    organization_id: TAP,
    location_id: LEAGUE,
    attendance_source: "internal_the_lineup",
    profile_id: ME,
    neon_user_id: null,
    period_month: "2026-11-01",
    hours_snapshot: 10,
    rate_cents_snapshot: 2000,
    gross_cents: 20000,
    status: "locked",
    ...over,
  };
}

/** Chainable double: each table resolves to canned rows (RLS is simulated by the test). */
/**
 * Chainable double. It emulates PostgREST's response cap: however many rows a `range` asks
 * for, at most `cap` come back, and the exact total is reported separately (as
 * `count: "exact"` does). RLS is simulated by the test choosing the rows.
 */
function db(
  tables: {
    payroll_periods?: PeriodRow[];
    payroll_payments?: PeriodRow[];
    payroll_adjustments?: PeriodRow[];
    profiles?: PeriodRow[];
  },
  cap = 1000,
) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const from = vi.fn((table: string) => {
    const rec = { table, filters: [] as Array<[string, unknown]> };
    calls.push(rec);
    const rows =
      (tables as Record<string, PeriodRow[] | undefined>)[table] ?? [];
    const b: Record<string, unknown> = {};
    let window: [number, number] | null = null;
    for (const m of ["select", "order", "limit"]) b[m] = () => b;
    b.range = (from: number, to: number) => {
      window = [from, to];
      return b;
    };
    for (const m of ["eq", "in"]) {
      b[m] = (col: string, val: unknown) => {
        rec.filters.push([`${m}:${col}`, val]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => void) => {
      if (!window)
        return resolve({ data: rows, error: null, count: rows.length });
      const [from, to] = window;
      const end = Math.min(to, from + cap - 1);
      resolve({
        data: rows.slice(from, end + 1),
        error: null,
        count: rows.length,
      });
    };
    return b;
  });
  return { client: { from } as never, calls };
}

const EMPTY_ROSTER: Roster = {
  employees: [],
  authorizedKeys: new Set(),
  profileNames: {},
  neonUsers: {},
  identityLinks: [],
  neonVisible: {},
  ownNeonIds: {},
  issues: [],
};

function ctx(over: Partial<ReadContext> & { client: never }): ReadContext {
  const authorities = over.authorities ?? [auth({})];
  return {
    supabase: over.client,
    profileId: ME,
    authorities,
    selected: over.selected ?? authorities,
    matched: over.matched ?? over.selected ?? authorities,
    orgLocationCounts: over.orgLocationCounts ?? { [TAP]: authorities.length },
    filters: over.filters ?? {
      content: "both",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      employeeKeys: null,
    },
    roster: over.roster ?? EMPTY_ROSTER,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listNativeAttendance.mockResolvedValue({
    ok: true,
    rows: [],
    truncated: false,
  });
  mocks.getAttendanceRows.mockResolvedValue({ ok: true, data: [] });
  mocks.getActiveNeonUsers.mockResolvedValue({ ok: true, data: [] });
  mocks.listAttendanceIdentityLinks.mockResolvedValue({ ok: true, data: [] });
  mocks.listLocationEmployees.mockResolvedValue({ ok: true, employees: [] });
});

describe("readPayroll — a second, independent authority check on every row", () => {
  it("drops a row at a branch the caller has no authority at, even if the database returned it", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 1, location_id: LEAGUE }),
        periodRow({ id: 2, location_id: "loc-elsewhere", profile_id: OTHER }),
      ],
    });
    const res = await readPayroll(ctx({ client }));
    expect(res.periods.map((p) => p.periodId)).toEqual([1]);
  });

  it("drops a row at a branch whose Payroll module is off (no payroll authority there)", async () => {
    const { client } = db({
      payroll_periods: [periodRow({ id: 1, location_id: NASA })],
    });
    const nasaOff = auth({
      locationId: NASA,
      locationName: "NASA",
      payroll: "none",
    });
    const res = await readPayroll(
      ctx({ client, authorities: [auth({}), nasaOff], selected: [auth({})] }),
    );
    expect(res.periods).toEqual([]);
  });

  it("drops rows at branches that are authorized but not selected", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 1, location_id: LEAGUE }),
        periodRow({ id: 2, location_id: NASA, profile_id: OTHER }),
      ],
    });
    const nasa = auth({ locationId: NASA, locationName: "NASA" });
    const res = await readPayroll(
      ctx({ client, authorities: [auth({}), nasa], selected: [nasa] }),
    );
    expect(res.periods.map((p) => p.periodId)).toEqual([2]);
  });

  it("STAFF: sees only their own LOCKED record, never a colleague's, never a draft", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 1, profile_id: ME, status: "locked" }),
        periodRow({ id: 2, profile_id: OTHER, status: "locked" }),
        periodRow({ id: 3, profile_id: ME, status: "draft" }),
      ],
      payroll_payments: [
        {
          id: 1,
          payroll_period_id: 1,
          amount_cents: 5000,
          payment_date: "2026-11-15",
          comment: null,
          status: "confirmed",
          created_by: "m-1",
          confirmed_by: "m-1",
          confirmed_at: null,
          reverses_payment_id: null,
        },
        {
          id: 2,
          payroll_period_id: 1,
          amount_cents: 999,
          payment_date: "2026-11-16",
          comment: null,
          status: "draft",
          created_by: "m-1",
          confirmed_by: null,
          confirmed_at: null,
          reverses_payment_id: null,
        },
      ],
    });
    const res = await readPayroll(
      ctx({
        client,
        authorities: [auth({ attendance: "self", payroll: "self" })],
      }),
    );
    expect(res.periods.map((p) => p.periodId)).toEqual([1]);
    // a person sees confirmed payments only and no staff identities
    expect(res.periods[0]!.payments.map((p) => p.id)).toEqual([1]);
    expect(res.periods[0]!.payments[0]!.createdBy).toBeNull();
    expect(res.periods[0]!.payments[0]!.confirmedBy).toBeNull();
    expect(res.actorNames).toEqual({});
  });

  it("a manager sees draft periods, draft payments and actor names", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 3, profile_id: OTHER, status: "draft" }),
      ],
      payroll_payments: [
        {
          id: 9,
          payroll_period_id: 3,
          amount_cents: 100,
          payment_date: "2026-11-15",
          comment: null,
          status: "draft",
          created_by: "m-1",
          confirmed_by: null,
          confirmed_at: null,
          reverses_payment_id: null,
        },
      ],
      profiles: [{ id: "m-1", display_name: "Mia Manager" }],
    });
    const res = await readPayroll(ctx({ client }));
    expect(res.periods[0]!.status).toBe("draft");
    expect(res.periods[0]!.payments).toHaveLength(1);
    expect(res.actorNames).toEqual({ "m-1": "Mia Manager" });
  });

  it("filters to the selected employees (profile key and its linked Neon identity)", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 1, profile_id: ME }),
        periodRow({ id: 2, profile_id: OTHER }),
        periodRow({
          id: 3,
          organization_id: MONKS,
          location_id: WEBSTER,
          attendance_source: "external_neon",
          profile_id: null,
          neon_user_id: 7,
        }),
      ],
    });
    const monks = auth({
      organizationId: MONKS,
      organizationName: "The Monk's",
      locationId: WEBSTER,
      locationName: "Webster",
      attendanceMode: "external",
    });
    const res = await readPayroll(
      ctx({
        client,
        authorities: [auth({}), monks],
        orgLocationCounts: { [TAP]: 1, [MONKS]: 1 },
        filters: {
          content: "payroll",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          employeeKeys: [`profile:${ME}`],
        },
        roster: {
          ...EMPTY_ROSTER,
          identityLinks: [
            { organizationId: MONKS, neonUserId: 7, profileId: ME },
          ],
        },
      }),
    );
    expect(res.periods.map((p) => p.periodId).sort()).toEqual([1, 3]);
  });

  it("only queries the organizations the caller has payroll authority in (no cross-organization read)", async () => {
    const { client, calls } = db({ payroll_periods: [] });
    await readPayroll(ctx({ client }));
    const orgFilters = calls
      .filter((c) => c.table === "payroll_periods")
      .flatMap((c) => c.filters)
      .filter(([k]) => k === "eq:organization_id");
    expect(orgFilters).toEqual([["eq:organization_id", TAP]]);
  });

  it("org-level (no branch) record: attributed to the SOLE branch of a one-branch organization", async () => {
    const monks = auth({
      organizationId: MONKS,
      locationId: WEBSTER,
      locationName: "Webster",
      orgWide: true,
    });
    const { client } = db({
      payroll_periods: [
        periodRow({
          id: 5,
          organization_id: MONKS,
          location_id: null,
          attendance_source: "external_neon",
          profile_id: null,
          neon_user_id: 7,
        }),
      ],
    });
    const res = await readPayroll(
      ctx({ client, authorities: [monks], orgLocationCounts: { [MONKS]: 1 } }),
    );
    expect(res.periods[0]).toMatchObject({
      locationId: WEBSTER,
      branchAttribution: "inferred_sole_branch",
    });
  });

  it("org-level record in a multi-branch organization is shown only when ALL branches are selected, else reported as excluded", async () => {
    const orgWide = (id: string, name: string) =>
      auth({ locationId: id, locationName: name, orgWide: true });
    const league = orgWide(LEAGUE, "League City");
    const nasa = orgWide(NASA, "NASA");
    const row = periodRow({ id: 5, location_id: null, profile_id: OTHER });

    const all = await readPayroll(
      ctx({
        client: db({ payroll_periods: [row] }).client,
        authorities: [league, nasa],
        selected: [league, nasa],
        orgLocationCounts: { [TAP]: 2 },
      }),
    );
    expect(all.periods[0]).toMatchObject({
      locationId: null,
      branchAttribution: "organization_level",
    });

    const one = await readPayroll(
      ctx({
        client: db({ payroll_periods: [row] }).client,
        authorities: [league, nasa],
        selected: [league],
        orgLocationCounts: { [TAP]: 2 },
      }),
    );
    expect(one.periods).toEqual([]);
    expect(
      one.issues.some((i) => i.code === "org_level_payroll_excluded"),
    ).toBe(true);
  });

  it("org-level payroll is shown when every branch was chosen even if one branch has Payroll off", async () => {
    const orgWide = (id: string, name: string, payroll: "all" | "none") =>
      auth({ locationId: id, locationName: name, orgWide: true, payroll });
    const league = orgWide(LEAGUE, "League City", "all");
    const nasa = orgWide(NASA, "NASA", "none"); // Payroll module off here
    const row = periodRow({ id: 5, location_id: null, profile_id: OTHER });
    const res = await readPayroll(
      ctx({
        client: db({ payroll_periods: [row] }).client,
        authorities: [league, nasa],
        selected: [league], // content-narrowed (payroll)
        matched: [league, nasa], // …but the user chose BOTH branches
        orgLocationCounts: { [TAP]: 2 },
      }),
    );
    expect(res.periods).toHaveLength(1);
    expect(
      res.issues.some((i) => i.code === "org_level_payroll_excluded"),
    ).toBe(false);
  });

  it("a branch manager (not org-wide) never receives an org-level record", async () => {
    const { client } = db({
      payroll_periods: [
        periodRow({ id: 5, location_id: null, profile_id: OTHER }),
      ],
    });
    const res = await readPayroll(
      ctx({
        client,
        authorities: [
          auth({}),
          auth({ locationId: NASA, locationName: "NASA" }),
        ],
        orgLocationCounts: { [TAP]: 2 },
      }),
    );
    expect(res.periods).toEqual([]);
  });

  it("reports a truncated read as blocking (never silently incomplete)", async () => {
    const many = Array.from({ length: 2001 }, (_, i) =>
      periodRow({ id: i + 1 }),
    );
    const { client } = db({ payroll_periods: many });
    const res = await readPayroll(ctx({ client }));
    expect(res.issues.some((i) => i.code === "payroll_truncated")).toBe(true);
    expect(res.periods.length).toBeLessThanOrEqual(2000);
  });

  it("reads payments and adjustments in bounded IN-lists (never one huge query) for a large report", async () => {
    const many = Array.from({ length: 450 }, (_, i) =>
      periodRow({ id: i + 1, profile_id: `p-${i}` }),
    );
    const { client, calls } = db({ payroll_periods: many });
    const res = await readPayroll(ctx({ client }));
    expect(res.periods).toHaveLength(450); // All employees is never silently cut at 200
    const lists = calls
      .filter((c) => c.table === "payroll_payments")
      .flatMap((c) => c.filters)
      .filter(([k]) => k === "in:payroll_period_id")
      .map(([, v]) => (v as number[]).length);
    expect(lists).toEqual([100, 100, 100, 100, 50]);
  });

  it("reads ALL periods even though the server caps every response at 1,000 rows", async () => {
    const many = Array.from({ length: 1750 }, (_, i) =>
      periodRow({ id: i + 1, profile_id: `p-${i}` }),
    );
    const { client } = db({ payroll_periods: many }, 1000);
    const res = await readPayroll(ctx({ client }));
    expect(res.periods).toHaveLength(1750);
    expect(res.issues.some((i) => i.code === "payroll_truncated")).toBe(false);
  });

  it("reads a ledger larger than one response without dropping payments", async () => {
    const periods = Array.from({ length: 5 }, (_, i) =>
      periodRow({ id: i + 1, profile_id: `p-${i}` }),
    );
    // 5 periods × 300 draft payments = 1,500 rows behind a 1,000-row cap
    const payments = periods.flatMap((p) =>
      Array.from({ length: 300 }, (_, k) => ({
        id: (p.id as number) * 1000 + k,
        payroll_period_id: p.id,
        amount_cents: 100,
        payment_date: "2026-11-15",
        comment: null,
        status: "draft",
        created_by: "m-1",
        confirmed_by: null,
        confirmed_at: null,
        reverses_payment_id: null,
      })),
    );
    const { client } = db(
      { payroll_periods: periods, payroll_payments: payments, profiles: [] },
      1000,
    );
    const res = await readPayroll(ctx({ client }));
    expect(res.periods.reduce((n, p) => n + p.payments.length, 0)).toBe(1500);
    expect(res.issues.some((i) => i.severity === "blocking")).toBe(false);
  });

  it("an unreadable ledger page is blocking, and the payroll figures are not presented as complete", async () => {
    const { client } = db({ payroll_periods: [periodRow({ id: 1 })] });
    const real = (
      client as unknown as { from: (t: string) => Record<string, unknown> }
    ).from;
    (client as unknown as { from: (t: string) => unknown }).from = (
      t: string,
    ) => {
      const b = real(t);
      if (t !== "payroll_payments") return b;
      b.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { code: "x" }, count: null });
      return b;
    };
    const res = await readPayroll(ctx({ client }));
    expect(res.issues.some((i) => i.severity === "blocking")).toBe(true);
  });

  it("covers every month a cross-year range touches", async () => {
    const { client, calls } = db({ payroll_periods: [] });
    await readPayroll(
      ctx({
        client,
        filters: {
          content: "payroll",
          startDate: "2025-12-15",
          endDate: "2026-01-15",
          employeeKeys: null,
        },
      }),
    );
    const months = calls
      .flatMap((c) => c.filters)
      .find(([k]) => k === "in:period_month");
    expect(months?.[1]).toEqual(["2025-12-01", "2026-01-01"]);
  });
});

describe("readAttendance", () => {
  it("self-level reads only the caller's own native rows", async () => {
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [auth({ attendance: "self", payroll: "self" })],
      }),
    );
    expect(mocks.listNativeAttendance.mock.calls[0]![1].profileIds).toEqual([
      ME,
    ]);
  });

  it("self attendance is NOT pulled into a report scoped to a different employee", async () => {
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [auth({ attendance: "self", payroll: "self" })],
        filters: {
          content: "attendance",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          employeeKeys: [`profile:${OTHER}`],
        },
      }),
    );
    expect(mocks.listNativeAttendance).not.toHaveBeenCalled();
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [auth({ attendance: "self", payroll: "self" })],
        filters: {
          content: "attendance",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          employeeKeys: [`profile:${ME}`],
        },
      }),
    );
    expect(mocks.listNativeAttendance).toHaveBeenCalledTimes(1);
  });

  it("an external branch the caller only has SELF access to never exposes people managed elsewhere", async () => {
    const monksSelf = auth({
      organizationId: MONKS,
      organizationName: "The Monk's",
      locationId: "loc-b",
      locationName: "Branch B",
      attendanceMode: "external",
      attendance: "self",
      payroll: "self",
    });
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [monksSelf],
        orgLocationCounts: { [MONKS]: 2 },
        roster: {
          ...EMPTY_ROSTER,
          // the caller manages another external branch, so staff 7 and 8 are visible org-wide…
          neonVisible: { [MONKS]: [7, 8, 9] },
          ownNeonIds: { [MONKS]: 9 },
        },
      }),
    );
    // …but a self-only selection reads only the caller's own external identity.
    expect(mocks.getAttendanceRows.mock.calls[0]![0].userIds).toEqual([9]);
  });

  it("never reads an external source for a branch that is not explicitly 'external' (no cross-tenant Neon leak)", async () => {
    const res = await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [auth({ attendanceMode: null })],
      }),
    );
    expect(mocks.getAttendanceRows).not.toHaveBeenCalled();
    expect(res.slices).toEqual([]);
    expect(res.issues[0]).toMatchObject({ code: "source_unavailable" });
  });

  it("requests only Neon ids the caller may see, intersected with the employee filter", async () => {
    const monks = auth({
      organizationId: MONKS,
      organizationName: "The Monk's",
      locationId: WEBSTER,
      locationName: "Webster",
      attendanceMode: "external",
      orgWide: true,
    });
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [monks],
        orgLocationCounts: { [MONKS]: 1 },
        filters: {
          content: "attendance",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          employeeKeys: [`neon:${MONKS}:7`, `neon:${MONKS}:99`],
        },
        roster: { ...EMPTY_ROSTER, neonVisible: { [MONKS]: [7, 8] } },
      }),
    );
    expect(mocks.getAttendanceRows.mock.calls[0]![0].userIds).toEqual([7]);
  });

  it("does not query Neon at all when no external person is visible", async () => {
    const monks = auth({
      organizationId: MONKS,
      locationId: WEBSTER,
      attendanceMode: "external",
    });
    await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [monks],
        roster: { ...EMPTY_ROSTER, neonVisible: { [MONKS]: [] } },
      }),
    );
    expect(mocks.getAttendanceRows).not.toHaveBeenCalled();
  });

  it("flags a failed external read as blocking instead of reporting zero hours", async () => {
    mocks.getAttendanceRows.mockResolvedValue({ ok: false, error: "x" });
    const monks = auth({
      organizationId: MONKS,
      organizationName: "The Monk's",
      locationId: WEBSTER,
      attendanceMode: "external",
    });
    const res = await readAttendance(
      ctx({
        client: db({}).client,
        authorities: [monks],
        orgLocationCounts: { [MONKS]: 1 },
        roster: { ...EMPTY_ROSTER, neonVisible: { [MONKS]: [7] } },
      }),
    );
    expect(res.issues[0]).toMatchObject({
      code: "source_unavailable",
      severity: "blocking",
    });
  });

  it("reports truncation of a native read so totals are never presented as complete", async () => {
    mocks.listNativeAttendance.mockResolvedValue({
      ok: true,
      rows: [],
      truncated: true,
    });
    const res = await readAttendance(ctx({ client: db({}).client }));
    expect(res.slices[0]!.report.isPartial).toBe(true);
  });
});

describe("loadRoster — who the caller may select", () => {
  const monks = (over: Partial<LocationAuthority> = {}) =>
    auth({
      organizationId: MONKS,
      organizationName: "The Monk's",
      locationId: WEBSTER,
      locationName: "Webster",
      attendanceMode: "external",
      ...over,
    });

  beforeEach(() => {
    mocks.getActiveNeonUsers.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 7,
          fullName: "Ava (clock)",
          role: "Server",
          phone: null,
          createdAt: "",
          isActive: true,
        },
        {
          id: 8,
          fullName: "Unlinked Una",
          role: "Host",
          phone: null,
          createdAt: "",
          isActive: true,
        },
      ],
    });
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [
        { profileId: "p-ava", neonUserId: 7, linkedBy: "x", linkedAt: "" },
      ],
    });
    mocks.listLocationEmployees.mockResolvedValue({
      ok: true,
      employees: [{ profileId: "p-ava", displayName: "Ava Cruz" }],
    });
  });

  it("organization-wide authority sees every Neon user; the linked one merges into the verified profile", async () => {
    const roster = await loadRoster(
      db({ profiles: [{ id: ME, display_name: "Me" }] }).client,
      ME,
      [monks({ orgWide: true })],
    );
    expect(roster.neonVisible[MONKS]).toEqual([7, 8]);
    const keys = roster.employees.map((e) => e.key);
    expect(keys).toContain("profile:p-ava");
    expect(keys).toContain(`neon:${MONKS}:8`);
    expect(keys).not.toContain(`neon:${MONKS}:7`);
    expect(
      roster.employees.find((e) => e.key === `neon:${MONKS}:8`)!.identity,
    ).toBe("unmapped_external");
  });

  it("a branch manager sees ONLY Neon people verifiably linked to a member of their branch", async () => {
    const roster = await loadRoster(
      db({ profiles: [{ id: ME, display_name: "Me" }] }).client,
      ME,
      [monks({ orgWide: false })],
    );
    expect(roster.neonVisible[MONKS]).toEqual([7]);
    expect(roster.employees.map((e) => e.key)).not.toContain(`neon:${MONKS}:8`);
  });

  it("self-only sees just their own external identity, if linked", async () => {
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [{ profileId: ME, neonUserId: 8, linkedBy: "x", linkedAt: "" }],
    });
    const roster = await loadRoster(
      db({ profiles: [{ id: ME, display_name: "Me" }] }).client,
      ME,
      [monks({ attendance: "self", payroll: "self" })],
    );
    expect(roster.neonVisible[MONKS]).toEqual([8]);
    expect(mocks.getActiveNeonUsers).not.toHaveBeenCalled();
  });

  it("loads verified identity links for an INTERNAL organization too, so old external-keyed payroll still resolves to its linked person", async () => {
    mocks.listAttendanceIdentityLinks.mockResolvedValue({
      ok: true,
      data: [
        { profileId: "p-ava", neonUserId: 7, linkedBy: "x", linkedAt: "" },
      ],
    });
    const roster = await loadRoster(
      db({ profiles: [{ id: ME, display_name: "Me" }] }).client,
      ME,
      [auth({ orgWide: true })],
    );
    expect(mocks.listAttendanceIdentityLinks).toHaveBeenCalledTimes(1);
    expect(roster.identityLinks).toEqual([
      { organizationId: TAP, neonUserId: 7, profileId: "p-ava" },
    ]);
    // internal organization: the external clock is never consulted
    expect(mocks.getActiveNeonUsers).not.toHaveBeenCalled();
  });

  it("an unreachable external clock is a blocking issue, not an empty roster", async () => {
    mocks.getActiveNeonUsers.mockResolvedValue({ ok: false, error: "x" });
    const roster = await loadRoster(
      db({ profiles: [{ id: ME, display_name: "Me" }] }).client,
      ME,
      [monks({ orgWide: true })],
    );
    expect(roster.issues.some((i) => i.severity === "blocking")).toBe(true);
  });
});
