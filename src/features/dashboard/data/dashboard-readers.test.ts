import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  listPayrollPeriods: vi.fn(),
  getPayrollBalancesForPeriods: vi.fn(),
  readAll: vi.fn(),
}));

vi.mock("@/features/payroll/data/payroll-data", () => ({
  listPayrollPeriods: mocks.listPayrollPeriods,
  getPayrollBalancesForPeriods: mocks.getPayrollBalancesForPeriods,
}));
vi.mock("@/features/bar-inventory/data/catalog-data", () => ({
  readAll: mocks.readAll,
  STOCK_COLUMNS: "product_id, on_hand",
}));

import {
  readAttendanceCard,
  readLowStockCard,
  readPayrollCard,
  readTipsCard,
} from "./dashboard-readers";

type Result = { data?: unknown; error?: { code?: string } | null };

/** A chainable, awaitable PostgREST stand-in that records every filter applied. */
function fakeClient(tables: Record<string, Result>, rpcResult?: Result) {
  const log: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const rpc = vi.fn(async () => ({
    data: rpcResult?.data ?? null,
    error: rpcResult?.error ?? null,
  }));
  const client = {
    rpc,
    from(table: string) {
      const entry = { table, ops: [] as Array<[string, unknown[]]> };
      log.push(entry);
      const result = tables[table] ?? { data: [], error: null };
      const done = {
        data: result.data ?? null,
        error: result.error ?? null,
      };
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "limit"]) {
        chain[op] = (...args: unknown[]) => {
          entry.ops.push([op, args]);
          return chain;
        };
      }
      chain.maybeSingle = async () => done;
      chain.then = (resolve: (value: typeof done) => void) => resolve(done);
      return chain;
    },
  };
  return { client: client as never, log, rpc };
}

const ORG = "org-1";
const LOC = "loc-1";

const internal = { data: { attendance_mode: "internal_the_lineup" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readAttendanceCard", () => {
  it("internal mode: counts distinct open sessions of THIS branch, filtered by organization, location and open statuses", async () => {
    const { client, log } = fakeClient({
      locations: internal,
      attendance_session_summaries: {
        data: [
          { profile_id: "a", status: "active" },
          { profile_id: "a", status: "active" },
          { profile_id: "b", status: "on_break" },
        ],
      },
    });
    const result = await readAttendanceCard(client, {
      organizationId: ORG,
      locationId: LOC,
    });
    expect(result).toEqual({
      status: "ok",
      data: { clockedIn: 2, onBreak: 1, sourceLabel: "TheLineup Internal" },
    });
    const ops = log.find(
      (l) => l.table === "attendance_session_summaries",
    )!.ops;
    expect(ops).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(ops).toContainEqual(["eq", ["location_id", LOC]]);
    expect(ops).toContainEqual(["in", ["status", ["active", "on_break"]]]);
  });

  it("a valid empty answer is a real zero", async () => {
    const { client } = fakeClient({
      locations: internal,
      attendance_session_summaries: { data: [] },
    });
    expect(
      await readAttendanceCard(client, {
        organizationId: ORG,
        locationId: LOC,
      }),
    ).toMatchObject({ status: "ok", data: { clockedIn: 0 } });
  });

  it.each([
    [
      "external",
      { data: { attendance_mode: "external" } },
      /external time clock/,
    ],
    [
      "unconfigured",
      { data: { attendance_mode: null } },
      /hasn't chosen an attendance source/,
    ],
    [
      "disabled",
      { data: { attendance_mode: "disabled" } },
      /turned off|off for this branch/i,
    ],
  ])(
    "%s mode is Unavailable with its own reason and never reads sessions",
    async (_n, location, reason) => {
      const { client, log } = fakeClient({ locations: location });
      const result = await readAttendanceCard(client, {
        organizationId: ORG,
        locationId: LOC,
      });
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable")
        expect(result.reason).toMatch(reason);
      expect(log.some((l) => l.table === "attendance_session_summaries")).toBe(
        false,
      );
    },
  );

  it("a database that predates the attendance-mode column (42703) is legacy external: Unavailable, not a guess", async () => {
    const { client } = fakeClient({
      locations: { data: null, error: { code: "42703" } },
    });
    expect(
      (
        await readAttendanceCard(client, {
          organizationId: ORG,
          locationId: LOC,
        })
      ).status,
    ).toBe("unavailable");
  });

  it("an unreadable branch or a failed read is Unavailable, never 0", async () => {
    const cases: Array<Record<string, Result>> = [
      { locations: { data: null, error: { code: "XX000" } } },
      { locations: { data: null } },
      {
        locations: internal,
        attendance_session_summaries: { data: null, error: { code: "XX000" } },
      },
    ];
    for (const tables of cases) {
      const { client } = fakeClient(tables);
      expect(
        (
          await readAttendanceCard(client, {
            organizationId: ORG,
            locationId: LOC,
          })
        ).status,
      ).toBe("unavailable");
    }
  });

  it("exactly 1000 rows is Unavailable (the read may have been truncated)", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      profile_id: `p${i}`,
      status: "active",
    }));
    const { client } = fakeClient({
      locations: internal,
      attendance_session_summaries: { data: rows },
    });
    expect(
      (
        await readAttendanceCard(client, {
          organizationId: ORG,
          locationId: LOC,
        })
      ).status,
    ).toBe("unavailable");
  });
});

describe("readPayrollCard", () => {
  const external = { data: { attendance_mode: "external" } };
  const period = (
    id: number,
    periodMonth: string,
    status: "draft" | "locked",
  ) => ({
    id,
    periodMonth,
    status,
    grossCents: 10_000,
  });

  it("reads only this branch's periods and totals draft count (current month) and outstanding balance", async () => {
    const { client } = fakeClient({ locations: external });
    mocks.listPayrollPeriods.mockResolvedValue({
      ok: true,
      data: [
        period(1, "2026-11-01", "draft"),
        period(2, "2026-11-01", "locked"),
        period(3, "2026-10-01", "draft"),
      ],
    });
    mocks.getPayrollBalancesForPeriods.mockResolvedValue({
      ok: true,
      data: new Map([
        [1, { balanceCents: 10_000 }],
        [2, { balanceCents: 2_500 }],
        [3, { balanceCents: -4_000 }],
      ]),
    });
    const result = await readPayrollCard(client, {
      organizationId: ORG,
      locationId: LOC,
      serviceDate: "2026-11-19",
    });
    expect(mocks.listPayrollPeriods).toHaveBeenCalledWith(client, {
      organizationId: ORG,
      locationId: LOC,
    });
    expect(result).toEqual({
      status: "ok",
      data: {
        draftPeriods: 1,
        periodMonth: "2026-11-01",
        outstandingBalanceCents: 12_500,
        periodsCounted: 3,
      },
    });
  });

  it("the accounting month comes from the branch-local service date", async () => {
    const { client } = fakeClient({ locations: external });
    mocks.listPayrollPeriods.mockResolvedValue({ ok: true, data: [] });
    mocks.getPayrollBalancesForPeriods.mockResolvedValue({
      ok: true,
      data: new Map(),
    });
    const result = await readPayrollCard(client, {
      organizationId: ORG,
      locationId: LOC,
      serviceDate: "2026-12-01",
    });
    expect(result).toMatchObject({
      status: "ok",
      data: { periodMonth: "2026-12-01", draftPeriods: 0 },
    });
  });

  it("an internal-attendance branch is Unavailable (native periods have no branch list reader): never an unproven zero", async () => {
    const { client } = fakeClient({ locations: internal });
    const result = await readPayrollCard(client, {
      organizationId: ORG,
      locationId: LOC,
      serviceDate: "2026-11-19",
    });
    expect(result.status).toBe("unavailable");
    expect(mocks.listPayrollPeriods).not.toHaveBeenCalled();
  });

  it("a failed period read, a failed balance read, or 1000 periods is Unavailable, never $0.00", async () => {
    const { client } = fakeClient({ locations: external });
    mocks.listPayrollPeriods.mockResolvedValueOnce({ ok: false, error: "x" });
    expect(
      (
        await readPayrollCard(client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
        })
      ).status,
    ).toBe("unavailable");

    mocks.listPayrollPeriods.mockResolvedValueOnce({
      ok: true,
      data: [period(1, "2026-11-01", "draft")],
    });
    mocks.getPayrollBalancesForPeriods.mockResolvedValueOnce({
      ok: false,
      error: "x",
    });
    expect(
      (
        await readPayrollCard(client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
        })
      ).status,
    ).toBe("unavailable");

    mocks.listPayrollPeriods.mockResolvedValueOnce({
      ok: true,
      data: Array.from({ length: 1000 }, (_, i) =>
        period(i, "2026-11-01", "draft"),
      ),
    });
    expect(
      (
        await readPayrollCard(client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
        })
      ).status,
    ).toBe("unavailable");
  });

  it("an unreadable branch source is Unavailable", async () => {
    const { client } = fakeClient({
      locations: { data: null, error: { code: "XX000" } },
    });
    expect(
      (
        await readPayrollCard(client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
        })
      ).status,
    ).toBe("unavailable");
  });
});

describe("readTipsCard", () => {
  const range = (isManager: boolean) => ({
    time_zone: "America/Chicago",
    from: "2026-11-19",
    to: "2026-11-19",
    viewer_level: isManager ? 2 : 1,
    pools: [
      {
        pool_id: 1,
        service_date: "2026-11-19",
        status: "saved",
        updated_at: "2026-11-19T20:00:00Z",
        intervals: [
          {
            id: 1,
            starts_at: "2026-11-19T22:00:00Z",
            ends_at: "2026-11-20T02:00:00Z",
            amount_cents: 14_001,
            cash_cents: 10_001,
            card_cents: 4_000,
            tender_recorded: true,
            revision: 1,
            voided_at: null,
            participant_ids: ["me"],
            shares: [],
          },
        ],
        allocations: [
          {
            profile_id: "me",
            amount_cents: 14_001,
            cash_cents: 10_001,
            card_cents: 4_000,
          },
        ],
        revisions: [],
      },
    ],
  });

  it("calls tips_get_range for exactly the verified branch and the service date, without revisions", async () => {
    const { client, rpc } = fakeClient({}, { data: range(true) });
    const result = await readTipsCard(client, {
      organizationId: ORG,
      locationId: LOC,
      serviceDate: "2026-11-19",
      profileId: "me",
    });
    expect(rpc).toHaveBeenCalledWith("tips_get_range", {
      p_organization_id: ORG,
      p_location_id: LOC,
      p_from: "2026-11-19",
      p_to: "2026-11-19",
      p_include_revisions: false,
    });
    expect(result).toMatchObject({
      status: "ok",
      data: {
        view: "manager",
        totalCents: 14_001,
        cashCents: 10_001,
        cardCents: 4_000,
      },
    });
  });

  it("staff payload yields only the caller's own share", async () => {
    const { client } = fakeClient({}, { data: range(false) });
    expect(
      await readTipsCard(client, {
        organizationId: ORG,
        locationId: LOC,
        serviceDate: "2026-11-19",
        profileId: "me",
      }),
    ).toMatchObject({
      status: "ok",
      data: { view: "staff", totalCents: 14_001 },
    });
  });

  it("an RPC error or an unexpected payload is Unavailable, never $0.00", async () => {
    const denied = fakeClient({}, { error: { code: "42501" } });
    expect(
      (
        await readTipsCard(denied.client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
          profileId: "me",
        })
      ).status,
    ).toBe("unavailable");
    const odd = fakeClient({}, { data: { nonsense: true } });
    expect(
      (
        await readTipsCard(odd.client, {
          organizationId: ORG,
          locationId: LOC,
          serviceDate: "2026-11-19",
          profileId: "me",
        })
      ).status,
    ).toBe("unavailable");
  });
});

describe("readLowStockCard", () => {
  it("reads products org-wide and stock for THIS branch only, then applies the Bar Inventory rules", async () => {
    const { client } = fakeClient({});
    mocks.readAll.mockImplementation(async (_c, table: string) =>
      table === "inventory_products"
        ? [
            { id: "crit", active: true },
            { id: "gone", active: false },
          ]
        : [
            {
              product_id: "crit",
              on_hand: 1,
              backup: 0,
              cutoff: 4,
              warning: null,
              par: null,
              version: 1,
              updated_at: null,
            },
            {
              product_id: "gone",
              on_hand: 0,
              backup: 0,
              cutoff: 4,
              warning: null,
              par: null,
              version: 1,
              updated_at: null,
            },
          ],
    );
    const result = await readLowStockCard(client, {
      organizationId: ORG,
      locationId: LOC,
      timeZone: "America/Chicago",
    });
    expect(result).toEqual({
      status: "ok",
      data: { needsOrdering: 1, critical: 1, low: 0 },
    });
    const stockCall = mocks.readAll.mock.calls.find(
      (c) => c[1] === "inventory_stock",
    )!;
    expect(stockCall[3]).toBe(ORG);
    expect(stockCall[4]).toMatchObject({ locationId: LOC });
  });

  it("a failed products or stock read is Unavailable, never 0", async () => {
    const { client } = fakeClient({});
    mocks.readAll.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    expect(
      (
        await readLowStockCard(client, {
          organizationId: ORG,
          locationId: LOC,
          timeZone: "America/Chicago",
        })
      ).status,
    ).toBe("unavailable");
    mocks.readAll.mockResolvedValueOnce([]).mockResolvedValueOnce(null);
    expect(
      (
        await readLowStockCard(client, {
          organizationId: ORG,
          locationId: LOC,
          timeZone: "America/Chicago",
        })
      ).status,
    ).toBe("unavailable");
  });

  it("a thrown read is contained as Unavailable", async () => {
    const { client } = fakeClient({});
    mocks.readAll.mockRejectedValue(new Error("boom"));
    expect(
      (
        await readLowStockCard(client, {
          organizationId: ORG,
          locationId: LOC,
          timeZone: "America/Chicago",
        })
      ).status,
    ).toBe("unavailable");
  });
});
