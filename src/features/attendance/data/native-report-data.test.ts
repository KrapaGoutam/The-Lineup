import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import {
  listNativeAttendance,
  mapSummaryRow,
  NATIVE_REPORT_ROW_LIMIT,
} from "./native-report-data";

vi.mock("server-only", () => ({}));

type SummaryRow =
  Database["public"]["Views"]["attendance_session_summaries"]["Row"];

function summary(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    session_id: "s1",
    organization_id: "o1",
    location_id: "l1",
    profile_id: "p1",
    service_date: "2026-11-09",
    status: "completed",
    clock_in_at: "2026-11-09T15:00:00Z",
    clock_out_at: "2026-11-09T23:00:00Z",
    gross_elapsed_seconds: 28800,
    total_break_seconds: 1800,
    paid_break_seconds: 0,
    unpaid_break_seconds: 0,
    unclassified_break_seconds: 1800,
    open_break_count: 0,
    break_count: 1,
    is_closed: true,
    break_policy_resolved: false,
    net_payable_seconds: null,
    version: 3,
    correction_count: 2,
    last_corrected_at: "2026-11-10T01:00:00Z",
    ...overrides,
  };
}

describe("mapSummaryRow", () => {
  it("labels provenance and keeps unresolved payable time null", () => {
    const row = mapSummaryRow(
      summary(),
      new Map([["p1", "Ada"]]),
      "America/Chicago",
    );
    expect(row).toMatchObject({
      employeeName: "Ada",
      source: "internal_the_lineup",
      timeZone: "America/Chicago",
      netPayableSeconds: null,
      breakPolicyResolved: false,
      correctionCount: 2,
      version: 3,
    });
  });

  it("falls back to a neutral name and never invents data for a malformed row", () => {
    expect(mapSummaryRow(summary(), new Map(), "UTC")?.employeeName).toBe(
      "Employee",
    );
    expect(
      mapSummaryRow(summary({ session_id: null }), new Map(), "UTC"),
    ).toBeNull();
    expect(
      mapSummaryRow(summary({ clock_in_at: null }), new Map(), "UTC"),
    ).toBeNull();
  });

  it("treats a missing resolution flag as unresolved (never as resolved)", () => {
    const row = mapSummaryRow(
      summary({ break_policy_resolved: null }),
      new Map(),
      "UTC",
    );
    expect(row?.breakPolicyResolved).toBe(false);
  });
});

function chain(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order", "in"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push(["limit", args]);
    return builder;
  };
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return { builder, calls };
}

describe("listNativeAttendance", () => {
  it("scopes to one location and date range, narrowing (never widening) by employee", async () => {
    const view = chain({ data: [summary()], error: null });
    const profiles = chain({
      data: [{ id: "p1", display_name: "Ada" }],
      error: null,
    });
    const from = vi.fn((table: string) =>
      table === "profiles" ? profiles.builder : view.builder,
    );

    const res = await listNativeAttendance(
      { from } as unknown as SupabaseClient<Database>,
      {
        locationId: "l1",
        startDate: "2026-11-01",
        endDate: "2026-11-09",
        timeZone: "America/Chicago",
        profileId: "p1",
      },
    );

    expect(from).toHaveBeenCalledWith("attendance_session_summaries");
    expect(view.calls).toContainEqual(["eq", ["location_id", "l1"]]);
    expect(view.calls).toContainEqual(["gte", ["service_date", "2026-11-01"]]);
    expect(view.calls).toContainEqual(["lte", ["service_date", "2026-11-09"]]);
    expect(view.calls).toContainEqual(["eq", ["profile_id", "p1"]]);
    expect(res.ok && res.rows[0].employeeName).toBe("Ada");
    expect(res.ok && res.truncated).toBe(false);
  });

  it("does not add an employee filter when none is requested", async () => {
    const view = chain({ data: [], error: null });
    const from = vi.fn(() => view.builder);
    await listNativeAttendance(
      { from } as unknown as SupabaseClient<Database>,
      {
        locationId: "l1",
        startDate: "2026-11-01",
        endDate: "2026-11-09",
        timeZone: "UTC",
      },
    );
    expect(
      view.calls.some(([m, a]) => m === "eq" && a[0] === "profile_id"),
    ).toBe(false);
  });

  it("reports truncation instead of silently dropping rows", async () => {
    const many = Array.from({ length: NATIVE_REPORT_ROW_LIMIT + 1 }, (_, i) =>
      summary({ session_id: `s${i}` }),
    );
    const view = chain({ data: many, error: null });
    const profiles = chain({ data: [], error: null });
    const from = vi.fn((t: string) =>
      t === "profiles" ? profiles.builder : view.builder,
    );
    const res = await listNativeAttendance(
      { from } as unknown as SupabaseClient<Database>,
      {
        locationId: "l1",
        startDate: "2026-11-01",
        endDate: "2026-11-09",
        timeZone: "UTC",
      },
    );
    expect(res.ok && res.truncated).toBe(true);
    expect(res.ok && res.rows.length).toBe(NATIVE_REPORT_ROW_LIMIT);
  });

  it("returns a generic error without leaking the database message", async () => {
    const view = chain({
      data: null,
      error: { code: "XX000", message: "relation secret" },
    });
    const from = vi.fn(() => view.builder);
    const res = await listNativeAttendance(
      { from } as unknown as SupabaseClient<Database>,
      {
        locationId: "l1",
        startDate: "2026-11-01",
        endDate: "2026-11-09",
        timeZone: "UTC",
      },
    );
    expect(res).toEqual({
      ok: false,
      error: "Attendance data unavailable. Try again.",
    });
  });
});
