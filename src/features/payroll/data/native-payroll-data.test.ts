import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateNativePayrollPeriod,
  getSourceTransitionReadiness,
  listConsumptionReviews,
  raiseConsumptionReviews,
  resolveConsumptionReview,
} from "./native-payroll-data";

type Rpc = ReturnType<typeof vi.fn>;
const client = (rpc: Rpc) =>
  ({ rpc }) as unknown as Parameters<typeof generateNativePayrollPeriod>[0];

describe("generateNativePayrollPeriod", () => {
  it("sends all three arguments to the single atomic RPC and nothing else", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        periodId: 3,
        outcome: "created",
        hours: "13.5",
        rateCents: 1500,
        grossCents: 20250,
        sessions: 2,
      },
      error: null,
    });
    const result = await generateNativePayrollPeriod(client(rpc), {
      organizationId: "org",
      profileId: "prof",
      periodMonth: "2026-09-01",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "payroll_generate_native_period",
      {
        p_organization_id: "org",
        p_profile_id: "prof",
        p_period_month: "2026-09-01",
      },
    );
    expect(result).toEqual({
      ok: true,
      data: {
        periodId: 3,
        outcome: "created",
        hours: 13.5,
        rateCents: 1500,
        grossCents: 20250,
        sessions: 2,
      },
    });
  });

  it("returns the database refusal mapped, never raw", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "DUAL_IDENTITY_DUPLICATE: row 17 of org secret",
      },
    });
    const result = await generateNativePayrollPeriod(client(rpc), {
      organizationId: "o",
      profileId: "p",
      periodMonth: "2026-09-01",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "dual_identity" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("treats a malformed success payload as unavailable (never an invented period)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { periodId: "x" }, error: null });
    expect(
      await generateNativePayrollPeriod(client(rpc), {
        organizationId: "o",
        profileId: "p",
        periodMonth: "2026-09-01",
      }),
    ).toMatchObject({ ok: false, error: { code: "unknown" } });
  });
});

describe("raise / resolve / readiness", () => {
  it("raiseConsumptionReviews returns the count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    expect(
      await raiseConsumptionReviews(client(rpc), { organizationId: "o" }),
    ).toEqual({ ok: true, data: { raised: 2 } });
    expect(rpc).toHaveBeenCalledWith("payroll_raise_consumption_reviews", {
      p_organization_id: "o",
    });
  });

  it("resolveConsumptionReview sends the adjustment id only when it exists", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { state: "no_adjustment_needed", deltaNetSeconds: null },
      error: null,
    });
    await resolveConsumptionReview(client(rpc), {
      reviewId: 1,
      decision: "no_adjustment_needed",
      note: "n n n",
      payrollAdjustmentId: null,
    });
    expect(rpc).toHaveBeenLastCalledWith("payroll_resolve_consumption_review", {
      p_review_id: 1,
      p_decision: "no_adjustment_needed",
      p_note: "n n n",
    });
    await resolveConsumptionReview(client(rpc), {
      reviewId: 2,
      decision: "adjustment_recorded",
      note: "n n n",
      payrollAdjustmentId: 9,
    });
    expect(rpc).toHaveBeenLastCalledWith("payroll_resolve_consumption_review", {
      p_review_id: 2,
      p_decision: "adjustment_recorded",
      p_note: "n n n",
      p_payroll_adjustment_id: 9,
    });
  });

  it("getSourceTransitionReadiness keeps only well-typed fields", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        blocked: true,
        blockers: ["open_sessions", 7],
        enforced: true,
        time_zone: "America/Chicago",
        location_local_date: "2026-12-01",
        effective_period_month: "2026-12-01",
        counts: { open_sessions: 1, junk: "x" },
        warnings: { tip_pools_not_finalized: 2 },
      },
      error: null,
    });
    const result = await getSourceTransitionReadiness(client(rpc), {
      locationId: "l",
      targetMode: "external",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        blocked: true,
        blockers: ["open_sessions"],
        enforced: true,
        timeZone: "America/Chicago",
        locationLocalDate: "2026-12-01",
        effectivePeriodMonth: "2026-12-01",
        counts: { open_sessions: 1 },
        warnings: { tip_pools_not_finalized: 2 },
      },
    });
  });
});

describe("listConsumptionReviews", () => {
  it("maps rows and filters by organization (RLS is the authority)", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          period_id: 2,
          session_id: "s",
          profile_id: "p",
          location_id: "l",
          consumed_version: 1,
          observed_version: 2,
          observed_voided: false,
          state: "pending_review",
          delta_net_seconds: null,
          decision_note: null,
          payroll_adjustment_id: null,
          created_at: "2026-11-10T00:00:00Z",
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const result = await listConsumptionReviews({ from } as never, {
      organizationId: "o",
    });
    expect(from).toHaveBeenCalledWith("payroll_attendance_consumption_reviews");
    expect(eq).toHaveBeenCalledWith("organization_id", "o");
    expect(result).toMatchObject({
      ok: true,
      data: [{ id: 1, periodId: 2, state: "pending_review", sessionId: "s" }],
    });
  });
});
