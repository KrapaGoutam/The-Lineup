import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPayrollActor: vi.fn(),
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  guardModule: vi.fn(),
  assertWorkspaceExpectation: vi.fn(),
  generateNativePayrollPeriod: vi.fn(),
  raiseConsumptionReviews: vi.fn(),
  listConsumptionReviews: vi.fn(),
  resolveConsumptionReview: vi.fn(),
  getSourceTransitionReadiness: vi.fn(),
  activation: vi.fn(),
}));

vi.mock("@/features/payroll/data/payroll-actor", () => ({
  getPayrollActor: mocks.getPayrollActor,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: mocks.guardModule,
}));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: mocks.assertWorkspaceExpectation,
}));
vi.mock("@/features/payroll/data/native-payroll-data", () => ({
  generateNativePayrollPeriod: mocks.generateNativePayrollPeriod,
  raiseConsumptionReviews: mocks.raiseConsumptionReviews,
  listConsumptionReviews: mocks.listConsumptionReviews,
  resolveConsumptionReview: mocks.resolveConsumptionReview,
  getSourceTransitionReadiness: mocks.getSourceTransitionReadiness,
}));
// Only the activation verdict is replaced; the REAL recorded approvals are covered below.
vi.mock(
  "@/features/attendance/domain/financial-source",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/features/attendance/domain/financial-source")
      >();
    return {
      ...original,
      evaluateFinancialActivation: (
        ...args: Parameters<typeof original.evaluateFinancialActivation>
      ) =>
        mocks.activation(...args) ??
        original.evaluateFinancialActivation(...args),
    };
  },
);

import {
  generateNativePayrollPeriodAction,
  getConsumptionReviewsAction,
  getSourceTransitionReadinessAction,
  resolveConsumptionReviewAction,
} from "./native-payroll-actions";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const PROFILE = "00000000-0000-0000-0000-000000000003";
const supabase = { tag: "supabase" };

function orgManager(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    scope: {
      organizationId: ORG,
      locationId: null,
      timeZone: "America/Chicago",
    },
    viewer: { profileId: "p-owner", name: "Owner", designation: "Owner" },
    isOrgManager: true,
    isLocationManager: false,
    canManage: true,
    ...overrides,
  };
}

const outcome = {
  periodId: 9,
  outcome: "created" as const,
  hours: 13.5,
  rateCents: 1500,
  grossCents: 20250,
  sessions: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPayrollActor.mockResolvedValue(orgManager());
  mocks.createClient.mockResolvedValue(supabase);
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.guardModule.mockResolvedValue(null);
  mocks.assertWorkspaceExpectation.mockResolvedValue({ ok: true });
  mocks.activation.mockReturnValue(undefined);
  mocks.generateNativePayrollPeriod.mockResolvedValue({
    ok: true,
    data: outcome,
  });
});

describe("generateNativePayrollPeriodAction", () => {
  const input = {
    restaurantSlug: "the-lineup",
    profileId: PROFILE,
    periodMonth: "2026-09-17",
  };

  it("never calls the database while the recorded owner-policy gate is closed", async () => {
    const result = await generateNativePayrollPeriodAction(input);
    expect(result).toMatchObject({ ok: false, code: "not_activated" });
    expect(mocks.generateNativePayrollPeriod).not.toHaveBeenCalled();
  });

  it("relays one atomic call for the org's own id and the first of the month once the gate is open", async () => {
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    const result = await generateNativePayrollPeriodAction(input);
    expect(result).toEqual({ ok: true, data: outcome });
    expect(mocks.generateNativePayrollPeriod).toHaveBeenCalledExactlyOnceWith(
      supabase,
      {
        organizationId: ORG,
        profileId: PROFILE,
        periodMonth: "2026-09-01",
      },
    );
  });

  it("takes the organization from the verified actor, never from the request", async () => {
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    await generateNativePayrollPeriodAction({
      ...input,
      organizationId: "00000000-0000-0000-0000-0000000000ff",
    } as typeof input);
    expect(
      mocks.generateNativePayrollPeriod.mock.calls[0]![1].organizationId,
    ).toBe(ORG);
  });

  it("maps a database refusal to a safe message and code", async () => {
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    mocks.generateNativePayrollPeriod.mockResolvedValue({
      ok: false,
      error: {
        code: "dual_identity",
        message: "already paid under the other identity",
      },
    });
    expect(await generateNativePayrollPeriodAction(input)).toEqual({
      ok: false,
      error: "already paid under the other identity",
      code: "dual_identity",
    });
  });

  it.each([
    ["not signed in", null, "You need to sign in to see payroll."],
    [
      "a location manager",
      orgManager({ isOrgManager: false, isLocationManager: true }),
      "Native payroll needs organization-wide payroll authority.",
    ],
    [
      "a non-manager",
      orgManager({ canManage: false }),
      "Native payroll needs organization-wide payroll authority.",
    ],
  ])("refuses %s before anything else", async (_label, actor, error) => {
    mocks.getPayrollActor.mockResolvedValue(actor);
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    expect(await generateNativePayrollPeriodAction(input)).toEqual({
      ok: false,
      error,
    });
    expect(mocks.generateNativePayrollPeriod).not.toHaveBeenCalled();
  });

  it("rejects a malformed request without reading the actor", async () => {
    expect(
      await generateNativePayrollPeriodAction({
        ...input,
        profileId: "not-a-uuid",
      }),
    ).toEqual({ ok: false, error: "That payroll request is invalid." });
    expect(mocks.getPayrollActor).not.toHaveBeenCalled();
  });

  it("passes a stale tab through as contextStale", async () => {
    mocks.getPayrollActor.mockResolvedValue(
      orgManager({
        scope: {
          organizationId: ORG,
          locationId: "loc-1",
          timeZone: "America/Chicago",
        },
      }),
    );
    mocks.assertWorkspaceExpectation.mockResolvedValue({
      ok: false,
      code: "stale",
    });
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    expect(await generateNativePayrollPeriodAction(input)).toMatchObject({
      ok: false,
      contextStale: true,
    });
    expect(mocks.generateNativePayrollPeriod).not.toHaveBeenCalled();
  });

  it("stops at an unavailable module and at a revoked session", async () => {
    mocks.activation.mockReturnValue({
      status: "ACTIVE",
      basis: "approved_policy",
    });
    mocks.guardModule.mockResolvedValue({
      ok: false,
      error: "Payroll is not enabled",
      moduleUnavailable: true,
    });
    expect(await generateNativePayrollPeriodAction(input)).toMatchObject({
      moduleUnavailable: true,
    });
    mocks.guardModule.mockResolvedValue(null);
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "expired",
      sessionInvalid: true,
    });
    expect(await generateNativePayrollPeriodAction(input)).toMatchObject({
      sessionInvalid: true,
    });
    expect(mocks.generateNativePayrollPeriod).not.toHaveBeenCalled();
  });
});

describe("the recorded owner-policy gate (real constants)", () => {
  it("is closed: native attendance is not consumed until the owner authorizes activation", async () => {
    mocks.activation.mockReturnValue(undefined);
    const result = await generateNativePayrollPeriodAction({
      restaurantSlug: "the-lineup",
      profileId: PROFILE,
      periodMonth: "2026-09-01",
    });
    expect(result).toMatchObject({ ok: false, code: "not_activated" });
  });
});

describe("getConsumptionReviewsAction", () => {
  it("raises, then lists, for the verified organization only", async () => {
    mocks.raiseConsumptionReviews.mockResolvedValue({
      ok: true,
      data: { raised: 1 },
    });
    mocks.listConsumptionReviews.mockResolvedValue({
      ok: true,
      data: [{ id: 1 }],
    });
    const result = await getConsumptionReviewsAction({
      restaurantSlug: "the-lineup",
    });
    expect(result).toEqual({ ok: true, data: [{ id: 1 }] });
    expect(mocks.raiseConsumptionReviews).toHaveBeenCalledWith(supabase, {
      organizationId: ORG,
    });
    expect(mocks.listConsumptionReviews).toHaveBeenCalledWith(supabase, {
      organizationId: ORG,
    });
  });

  it("does not list when raising was refused", async () => {
    mocks.raiseConsumptionReviews.mockResolvedValue({
      ok: false,
      error: { code: "denied", message: "You don't have access to payroll." },
    });
    expect(
      await getConsumptionReviewsAction({ restaurantSlug: "the-lineup" }),
    ).toMatchObject({
      ok: false,
      code: "denied",
    });
    expect(mocks.listConsumptionReviews).not.toHaveBeenCalled();
  });
});

describe("resolveConsumptionReviewAction", () => {
  const base = {
    restaurantSlug: "the-lineup",
    reviewId: 4,
    note: "owner reviewed",
  };

  it("links an adjustment only when the decision records one", async () => {
    mocks.resolveConsumptionReview.mockResolvedValue({
      ok: true,
      data: { state: "adjustment_recorded", deltaNetSeconds: 1800 },
    });
    const ok = await resolveConsumptionReviewAction({
      ...base,
      decision: "adjustment_recorded",
      payrollAdjustmentId: 7,
    });
    expect(ok).toEqual({
      ok: true,
      data: { state: "adjustment_recorded", deltaNetSeconds: 1800 },
    });
    expect(mocks.resolveConsumptionReview).toHaveBeenCalledWith(supabase, {
      reviewId: 4,
      decision: "adjustment_recorded",
      note: "owner reviewed",
      payrollAdjustmentId: 7,
    });
  });

  it.each([
    [
      "an adjustment decision without an adjustment",
      { decision: "adjustment_recorded" as const },
    ],
    [
      "a no-adjustment decision that names an adjustment",
      { decision: "no_adjustment_needed" as const, payrollAdjustmentId: 7 },
    ],
    ["a blank note", { decision: "no_adjustment_needed" as const, note: "  " }],
  ])("rejects %s before any database call", async (_label, extra) => {
    const result = await resolveConsumptionReviewAction({ ...base, ...extra });
    expect(result).toEqual({
      ok: false,
      error: "That payroll request is invalid.",
    });
    expect(mocks.resolveConsumptionReview).not.toHaveBeenCalled();
  });

  it("refuses a location manager (organization-wide authority only)", async () => {
    mocks.getPayrollActor.mockResolvedValue(
      orgManager({ isOrgManager: false }),
    );
    expect(
      await resolveConsumptionReviewAction({
        ...base,
        decision: "no_adjustment_needed",
      }),
    ).toMatchObject({ ok: false });
    expect(mocks.resolveConsumptionReview).not.toHaveBeenCalled();
  });
});

describe("getSourceTransitionReadinessAction", () => {
  it("relays the database's readiness for the requested location and mode", async () => {
    mocks.getSourceTransitionReadiness.mockResolvedValue({
      ok: true,
      data: { blocked: true, blockers: ["open_sessions"] },
    });
    const result = await getSourceTransitionReadinessAction({
      restaurantSlug: "the-lineup",
      locationId: "00000000-0000-0000-0000-0000000000b1",
      targetMode: "external",
    });
    expect(result).toMatchObject({ ok: true });
    expect(mocks.getSourceTransitionReadiness).toHaveBeenCalledWith(supabase, {
      locationId: "00000000-0000-0000-0000-0000000000b1",
      targetMode: "external",
    });
  });

  it("rejects an unknown target mode", async () => {
    expect(
      await getSourceTransitionReadinessAction({
        restaurantSlug: "the-lineup",
        locationId: "00000000-0000-0000-0000-0000000000b1",
        targetMode: "neon" as "external",
      }),
    ).toEqual({ ok: false, error: "That payroll request is invalid." });
  });
});
