import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import {
  NATIVE_FINANCIAL_ROW_LIMIT,
  listOpenNativeSessionProfileIds,
  readNativeFinancialAttendance,
  toNativeSummaryInput,
} from "./native-financial-data";

vi.mock("server-only", () => ({}));

type SummaryRow =
  Database["public"]["Views"]["attendance_session_summaries"]["Row"];

const ORG = "org-1";
const LOC = "loc-1";
const PERIOD = { startDate: "2026-05-01", endDate: "2026-05-31" };

/** A completed, resolved 8h session: 09:00–17:00 CDT on 2026-05-04. */
function summary(over: Partial<SummaryRow> = {}): SummaryRow {
  return {
    session_id: "s1",
    organization_id: ORG,
    location_id: LOC,
    profile_id: "p1",
    service_date: "2026-05-04",
    status: "completed",
    clock_in_at: "2026-05-04T14:00:00.000Z",
    clock_out_at: "2026-05-04T22:00:00.000Z",
    gross_elapsed_seconds: 28800,
    total_break_seconds: 0,
    paid_break_seconds: 0,
    unpaid_break_seconds: 0,
    unclassified_break_seconds: 0,
    open_break_count: 0,
    break_count: 0,
    is_closed: true,
    break_policy_resolved: true,
    net_payable_seconds: 28800,
    version: 1,
    correction_count: 0,
    last_corrected_at: null,
    ...over,
  };
}

interface Calls {
  rpc: { fn: string; args: unknown }[];
  filters: { op: string; col: string; val: unknown }[];
  limit?: number;
  orders: string[];
  selected?: string;
}

function double(opts: {
  canManage?: boolean | null;
  rpcError?: { code: string } | null;
  rows?: SummaryRow[] | null;
  queryError?: { code: string } | null;
  throws?: boolean;
}) {
  const calls: Calls = { rpc: [], filters: [], orders: [] };
  const builder: Record<string, unknown> = {};
  const chain = (op: string) => (col: string, val: unknown) => {
    calls.filters.push({ op, col, val });
    return builder;
  };
  builder.select = (s: string) => {
    calls.selected = s;
    return builder;
  };
  builder.eq = chain("eq");
  builder.gte = chain("gte");
  builder.lte = chain("lte");
  builder.in = chain("in");
  builder.order = (col: string) => {
    calls.orders.push(col);
    return builder;
  };
  builder.limit = (n: number) => {
    calls.limit = n;
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (opts.throws) throw new Error("boom");
    return Promise.resolve({
      data: opts.rows ?? [],
      error: opts.queryError ?? null,
    }).then(resolve);
  };
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.rpc.push({ fn, args });
      return {
        data: opts.canManage === undefined ? true : opts.canManage,
        error: opts.rpcError ?? null,
      };
    },
    from: () => builder,
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const PARAMS = {
  organizationId: ORG,
  locationId: LOC,
  timeZone: "America/Chicago",
  period: PERIOD,
};

describe("toNativeSummaryInput", () => {
  it("maps a complete row", () => {
    expect(toNativeSummaryInput(summary())).toMatchObject({
      sessionId: "s1",
      organizationId: ORG,
      netPayableSeconds: 28800,
      version: 1,
    });
  });

  it("rejects a row missing any required field (never invents a value)", () => {
    for (const key of [
      "session_id",
      "organization_id",
      "location_id",
      "profile_id",
      "service_date",
      "status",
      "clock_in_at",
      "version",
      "break_policy_resolved",
      "total_break_seconds",
      "unpaid_break_seconds",
      "open_break_count",
      "correction_count",
    ] as const) {
      expect(toNativeSummaryInput(summary({ [key]: null }))).toBeNull();
    }
  });

  it("preserves a null payable (unresolved) instead of coercing it to zero", () => {
    expect(
      toNativeSummaryInput(summary({ net_payable_seconds: null }))
        ?.netPayableSeconds,
    ).toBeNull();
  });
});

describe("readNativeFinancialAttendance — outcomes are distinct", () => {
  it("returns canonical eligible records for the verified location and period", async () => {
    const { client, calls } = double({ rows: [summary()] });
    const res = await readNativeFinancialAttendance(client, PARAMS);
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.source).toBe("INTERNAL_THE_LINEUP");
    expect(res.truncated).toBe(false);
    expect(res.records).toHaveLength(1);
    expect(res.records[0]).toMatchObject({
      attendanceSource: "INTERNAL_THE_LINEUP",
      isFinanciallyEligible: true,
      payable: { kind: "seconds", seconds: 28800 },
    });
    // Tenant, location and period are all pushed into the query.
    expect(calls.filters).toEqual(
      expect.arrayContaining([
        { op: "eq", col: "organization_id", val: ORG },
        { op: "eq", col: "location_id", val: LOC },
        { op: "gte", col: "service_date", val: "2026-05-01" },
        { op: "lte", col: "service_date", val: "2026-05-31" },
      ]),
    );
  });

  it("orders deterministically so repeated reads give the same sequence", async () => {
    const { client, calls } = double({ rows: [] });
    await readNativeFinancialAttendance(client, PARAMS);
    expect(calls.orders).toEqual(["service_date", "clock_in_at", "session_id"]);
  });

  it("checks authority BEFORE reading: a denied caller is ACCESS_DENIED, not an empty report", async () => {
    const { client, calls } = double({ canManage: false, rows: [] });
    const res = await readNativeFinancialAttendance(client, PARAMS);
    expect(res).toEqual({ status: "ACCESS_DENIED" });
    expect(calls.rpc).toEqual([
      { fn: "attendance_can_manage", args: { p_location_id: LOC } },
    ]);
    expect(calls.selected).toBeUndefined(); // the table was never queried
  });

  it("treats a null authority answer as denied (fail closed)", async () => {
    const { client } = double({ canManage: null });
    expect(await readNativeFinancialAttendance(client, PARAMS)).toEqual({
      status: "ACCESS_DENIED",
    });
  });

  it("maps a 42501 from the authority check to ACCESS_DENIED and any other error to SOURCE_ERROR", async () => {
    expect(
      await readNativeFinancialAttendance(
        double({ rpcError: { code: "42501" } }).client,
        PARAMS,
      ),
    ).toEqual({ status: "ACCESS_DENIED" });
    expect(
      await readNativeFinancialAttendance(
        double({ rpcError: { code: "XX000" } }).client,
        PARAMS,
      ),
    ).toEqual({ status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" });
  });

  it("a query failure is SOURCE_ERROR — never an empty set of records", async () => {
    const res = await readNativeFinancialAttendance(
      double({ queryError: { code: "XX000" } }).client,
      PARAMS,
    );
    expect(res).toEqual({
      status: "SOURCE_ERROR",
      source: "INTERNAL_THE_LINEUP",
    });
    expect(res).not.toHaveProperty("records");
  });

  it("a thrown exception is SOURCE_ERROR", async () => {
    expect(
      await readNativeFinancialAttendance(
        double({ throws: true }).client,
        PARAMS,
      ),
    ).toEqual({ status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" });
  });

  it("a malformed row fails the whole read instead of silently dropping hours", async () => {
    const res = await readNativeFinancialAttendance(
      double({ rows: [summary(), summary({ session_id: null })] }).client,
      PARAMS,
    );
    expect(res).toEqual({
      status: "SOURCE_ERROR",
      source: "INTERNAL_THE_LINEUP",
    });
  });

  it("an authorised read with zero rows is OK + empty (distinct from every failure)", async () => {
    const res = await readNativeFinancialAttendance(
      double({ rows: [] }).client,
      PARAMS,
    );
    expect(res).toMatchObject({ status: "OK", records: [], truncated: false });
  });

  it("flags truncation instead of cutting silently, and drops the probe row", async () => {
    const rows = Array.from(
      { length: NATIVE_FINANCIAL_ROW_LIMIT + 1 },
      (_, i) => summary({ session_id: `s${i}` }),
    );
    const { client, calls } = double({ rows });
    const res = await readNativeFinancialAttendance(client, PARAMS);
    expect(calls.limit).toBe(NATIVE_FINANCIAL_ROW_LIMIT + 1);
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.truncated).toBe(true);
    expect(res.records).toHaveLength(NATIVE_FINANCIAL_ROW_LIMIT);
  });

  it("surfaces unresolved, voided and open sessions rather than omitting them", async () => {
    const rows = [
      summary({ session_id: "ok" }),
      summary({
        session_id: "unclassified",
        break_policy_resolved: false,
        net_payable_seconds: null,
        total_break_seconds: 900,
      }),
      summary({
        session_id: "void",
        status: "voided",
        is_closed: false,
        net_payable_seconds: null,
      }),
      summary({
        session_id: "open",
        status: "active",
        clock_out_at: null,
        gross_elapsed_seconds: null,
        net_payable_seconds: null,
        break_policy_resolved: false,
        is_closed: false,
      }),
    ];
    const res = await readNativeFinancialAttendance(
      double({ rows }).client,
      PARAMS,
    );
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.records.map((r) => [r.sourceRecordId, r.recordStatus])).toEqual([
      ["ok", "COMPLETE_AND_RESOLVED"],
      ["unclassified", "UNCLASSIFIED_BREAK"],
      ["void", "VOIDED"],
      ["open", "OPEN_SESSION"],
    ]);
  });

  it("a row from another organization or location that slipped past the filter is excluded, not counted", async () => {
    const rows = [
      summary({ session_id: "foreign-org", organization_id: "org-2" }),
      summary({ session_id: "foreign-loc", location_id: "loc-2" }),
    ];
    const res = await readNativeFinancialAttendance(
      double({ rows }).client,
      PARAMS,
    );
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.records.every((r) => !r.isFinanciallyEligible)).toBe(true);
    expect(res.records[0].ineligibilityReasons).toContain(
      "ORGANIZATION_MISMATCH",
    );
    expect(res.records[1].ineligibilityReasons).toContain("LOCATION_MISMATCH");
  });

  it("flags a session returned twice (retry / overlapping read) so it is counted once", async () => {
    const rows = [
      summary({ session_id: "dup" }),
      summary({ session_id: "dup" }),
    ];
    const res = await readNativeFinancialAttendance(
      double({ rows }).client,
      PARAMS,
    );
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.records.map((r) => r.isFinanciallyEligible)).toEqual([
      true,
      false,
    ]);
  });

  it("narrows to one employee and demands a match when asked", async () => {
    const { client, calls } = double({
      rows: [summary({ profile_id: "someone-else" })],
    });
    const res = await readNativeFinancialAttendance(client, {
      ...PARAMS,
      profileId: "p1",
    });
    expect(calls.filters).toContainEqual({
      op: "eq",
      col: "profile_id",
      val: "p1",
    });
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.records[0].ineligibilityReasons).toContain("EMPLOYEE_MISMATCH");
  });

  it("passes already-consumed ids through so reuse is surfaced", async () => {
    const res = await readNativeFinancialAttendance(
      double({ rows: [summary({ session_id: "used" })] }).client,
      { ...PARAMS, alreadyConsumedSourceIds: new Set(["used"]) },
    );
    if (res.status !== "OK") throw new Error("expected OK");
    expect(res.records[0].ineligibilityReasons).toContain("ALREADY_CONSUMED");
  });

  it("is deterministic: the same rows give an identical result on every call", async () => {
    const rows = [summary({ session_id: "a" }), summary({ session_id: "b" })];
    const first = await readNativeFinancialAttendance(
      double({ rows }).client,
      PARAMS,
    );
    const second = await readNativeFinancialAttendance(
      double({ rows }).client,
      PARAMS,
    );
    expect(second).toEqual(first);
  });
});

describe("listOpenNativeSessionProfileIds (Tips roster suggestion)", () => {
  it("returns distinct profiles with an active or on-break session at the location", async () => {
    const { client, calls } = double({
      rows: [
        summary({ profile_id: "a" }),
        summary({ profile_id: "a" }),
        summary({ profile_id: "b" }),
      ],
    });
    const res = await listOpenNativeSessionProfileIds(client, {
      organizationId: ORG,
      locationId: LOC,
    });
    expect(res).toEqual({ ok: true, profileIds: ["a", "b"] });
    expect(calls.filters).toEqual(
      expect.arrayContaining([
        { op: "eq", col: "organization_id", val: ORG },
        { op: "eq", col: "location_id", val: LOC },
        { op: "in", col: "status", val: ["active", "on_break"] },
      ]),
    );
  });

  it("a failed read is { ok:false }, never an empty roster", async () => {
    expect(
      await listOpenNativeSessionProfileIds(
        double({ queryError: { code: "XX000" } }).client,
        { organizationId: ORG, locationId: LOC },
      ),
    ).toEqual({ ok: false });
    expect(
      await listOpenNativeSessionProfileIds(double({ throws: true }).client, {
        organizationId: ORG,
        locationId: LOC,
      }),
    ).toEqual({ ok: false });
  });
});
