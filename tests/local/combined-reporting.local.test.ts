import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createPayrollFixture,
  must,
  type PayrollFixture,
  type PayrollTestUser,
} from "./support/payroll-fixture";

/**
 * V2.0.7 — Combined Reporting against REAL authorization.
 *
 * The real Server Actions run with real Supabase Auth JWTs against the DISPOSABLE loopback
 * stack (the shared fixture refuses any non-loopback URL). Only the cookie-bound client
 * factory is replaced, so each "request" is made as exactly one fixture user. Nothing here
 * touches hosted DEV, Production or Neon, and the reports are read-only: row counts of every
 * financial table are compared before and after.
 */
const current = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}));

import {
  generateCombinedReportAction,
  getReportingOptionsAction,
} from "@/features/reporting/actions/reporting-actions";
import { loadReportingAuthorities } from "@/features/reporting/data/reporting-authority";
import type { CombinedReport } from "@/features/reporting/domain/report-types";

const NOV = { startDate: "2026-11-01", endDate: "2026-11-30" };

let fx: PayrollFixture;
const P: Record<string, number> = {};
const sessionIds: string[] = [];

function as(user: PayrollTestUser) {
  current.client = user.client;
}

async function report(
  user: PayrollTestUser,
  over: Record<string, unknown> = {},
): Promise<
  { ok: true; reports: CombinedReport[] } | { ok: false; error: string }
> {
  as(user);
  const res = await generateCombinedReportAction({
    organizationIds: null,
    locationIds: null,
    employeeKeys: null,
    content: "both",
    output: "combined",
    ...NOV,
    ...over,
  });
  return res.ok
    ? { ok: true, reports: [...res.data.reports] }
    : { ok: false, error: res.error };
}

/** Only this fixture's organizations (the Overall role sees every tenant in the stack). */
function mine(over: Record<string, unknown> = {}) {
  return { organizationIds: [fx.orgA.id, fx.orgB.id], ...over };
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of [
    "payroll_periods",
    "payroll_payments",
    "payroll_adjustments",
    "attendance_sessions",
    "audit_events",
    "attendance_identity_links",
  ] as const) {
    const { count } = await fx.admin
      .from(t)
      .select("*", { count: "exact", head: true })
      .in("organization_id", [fx.orgA.id, fx.orgB.id]);
    out[t] = count ?? 0;
  }
  return out;
}

beforeAll(async () => {
  fx = await createPayrollFixture();

  // Attendance source + module rows for every branch.
  for (const id of [fx.locA, fx.locB, fx.locC]) {
    must(
      await fx.admin
        .from("locations")
        .update({ attendance_mode: "internal_the_lineup" })
        .eq("id", id),
    );
  }
  must(
    await fx.admin.from("location_module_configs").insert(
      [fx.locA, fx.locB, fx.locC].map((location_id) => ({
        location_id,
        module_key: "attendance" as const,
        is_enabled: true,
      })),
    ),
  );

  // Native attendance: 2 shifts for Sam (Loc A), 1 for Sally (Loc B), 1 for the Org B manager.
  const session = (
    org: string,
    loc: string,
    profile: string,
    date: string,
    seconds: number,
  ) => {
    const id = randomUUID();
    sessionIds.push(id);
    return {
      id,
      organization_id: org,
      location_id: loc,
      profile_id: profile,
      service_date: date,
      status: "completed" as const,
      clock_in_at: `${date}T14:00:00Z`,
      clock_out_at: new Date(
        Date.parse(`${date}T14:00:00Z`) + seconds * 1000,
      ).toISOString(),
      gross_elapsed_seconds: seconds,
      total_break_seconds: 0,
      created_by: profile,
    };
  };
  must(
    await fx.admin
      .from("attendance_sessions")
      .insert([
        session(fx.orgA.id, fx.locA, fx.staffA.id, "2026-11-10", 28800),
        session(fx.orgA.id, fx.locA, fx.staffA.id, "2026-11-11", 21600),
        session(fx.orgA.id, fx.locB, fx.staffB.id, "2026-11-10", 18000),
        session(fx.orgB.id, fx.locC, fx.attackerB.id, "2026-11-10", 14400),
      ]),
  );

  // Payroll snapshots (external-keyed, as all historical periods are).
  const period = async (
    key: string,
    row: Record<string, unknown>,
  ): Promise<void> => {
    const r = must(
      await fx.admin
        .from("payroll_periods")
        .insert({
          generated_by: fx.orgAGM.id,
          rate_cents_snapshot: 1500,
          hours_snapshot: 40,
          period_month: "2026-11-01",
          ...row,
        } as never)
        .select("id")
        .single(),
    );
    P[key] = (r as { id: number }).id;
  };
  await period("sam", {
    organization_id: fx.orgA.id,
    location_id: fx.locA,
    neon_user_id: fx.neonIds.staffA,
    gross_cents: 60000,
    status: "locked",
  });
  await period("sally", {
    organization_id: fx.orgA.id,
    location_id: fx.locB,
    neon_user_id: fx.neonIds.staffB,
    gross_cents: 56000,
    status: "locked",
  });
  await period("orgLevel", {
    organization_id: fx.orgA.id,
    location_id: null,
    neon_user_id: fx.neonIds.multiStaff,
    gross_cents: 85000,
    status: "draft",
  });
  await period("samOctober", {
    organization_id: fx.orgA.id,
    location_id: fx.locA,
    neon_user_id: fx.neonIds.staffA,
    gross_cents: 11111,
    status: "locked",
    period_month: "2026-10-01",
  });
  await period("orgB", {
    organization_id: fx.orgB.id,
    location_id: fx.locC,
    neon_user_id: 987654,
    gross_cents: 99999,
    status: "locked",
    generated_by: fx.attackerB.id,
  });

  // Sam's ledger: one confirmed payment, one DRAFT payment, one adjustment.
  const pay = must(
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: P.sam,
        amount_cents: 20000,
        payment_date: "2026-11-15",
        comment: "Advance",
        status: "draft",
        created_by: fx.mgrA.id,
      })
      .select("id")
      .single(),
  ) as { id: number };
  must(
    await fx.mgrA.client
      .from("payroll_payments")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.mgrA.id,
      })
      .eq("id", pay.id),
  );
  must(
    await fx.admin.from("payroll_payments").insert({
      organization_id: fx.orgA.id,
      payroll_period_id: P.sam,
      amount_cents: 5000,
      payment_date: "2026-11-20",
      status: "draft",
      created_by: fx.mgrA.id,
    }),
  );
  must(
    await fx.admin.from("payroll_adjustments").insert({
      organization_id: fx.orgA.id,
      payroll_period_id: P.sam,
      delta_cents: -1000,
      reason: "Hours mis-keyed",
      created_by: fx.mgrA.id,
    }),
  );
});

afterAll(async () => {
  if (!fx) return;
  must(
    await fx.admin.from("attendance_sessions").delete().in("id", sessionIds),
  );
  await fx.teardown();
});

describe("real authorization — who may report on what", () => {
  const usable = async () => true;

  it("Org A general manager: both Org A branches, never Org B", async () => {
    const auth = await loadReportingAuthorities(fx.orgAGM.client, usable);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const ids = auth.authorities.map((a) => a.locationId);
    expect(ids).toContain(fx.locA);
    expect(ids).toContain(fx.locB);
    expect(ids).not.toContain(fx.locC);
    expect(auth.authorities.every((a) => a.attendance === "all")).toBe(true);
    expect(auth.authorities.every((a) => a.orgWide)).toBe(true);
  });

  it("Loc A manager: Loc A only, branch-level (not org-wide)", async () => {
    const auth = await loadReportingAuthorities(fx.mgrA.client, usable);
    expect(auth.ok && auth.authorities.map((a) => a.locationId)).toEqual([
      fx.locA,
    ]);
    expect(auth.ok && auth.authorities[0]).toMatchObject({
      attendance: "all",
      payroll: "all",
      orgWide: false,
    });
  });

  it("assistant manager gets exactly what the database grants (manage tier at their branch)", async () => {
    const auth = await loadReportingAuthorities(fx.asstA.client, usable);
    expect(auth.ok && auth.authorities.map((a) => a.locationId)).toEqual([
      fx.locA,
    ]);
    expect(auth.ok && auth.authorities[0]!.orgWide).toBe(false);
  });

  it("staff: self-only attendance and payroll at their own branch", async () => {
    const auth = await loadReportingAuthorities(fx.staffA.client, usable);
    expect(auth.ok && auth.authorities).toHaveLength(1);
    expect(auth.ok && auth.authorities[0]).toMatchObject({
      locationId: fx.locA,
      attendance: "self",
      payroll: "self",
    });
  });

  it("a revoked (inactive) member has NO authority anywhere", async () => {
    const auth = await loadReportingAuthorities(fx.revokedStaff.client, usable);
    expect(auth.ok && auth.authorities).toEqual([]);
  });

  it("the Org B manager sees Org B only", async () => {
    const auth = await loadReportingAuthorities(fx.attackerB.client, usable);
    expect(auth.ok && auth.authorities.map((a) => a.locationId)).toEqual([
      fx.locC,
    ]);
  });

  it("a disabled Payroll module removes payroll (not attendance) at that branch, per branch", async () => {
    const perBranch = async (
      module: "attendance" | "payroll",
      _o: string,
      loc: string,
    ) => !(module === "payroll" && loc === fx.locA);
    const auth = await loadReportingAuthorities(fx.orgAGM.client, perBranch);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const a = auth.authorities.find((x) => x.locationId === fx.locA)!;
    const b = auth.authorities.find((x) => x.locationId === fx.locB)!;
    expect(a).toMatchObject({ attendance: "all", payroll: "none" });
    expect(b).toMatchObject({ attendance: "all", payroll: "all" });
  });

  it("the Overall manager is organization-wide across tenants", async () => {
    const auth = await loadReportingAuthorities(fx.overall.client, usable);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const ids = auth.authorities.map((a) => a.locationId);
    expect(ids).toEqual(expect.arrayContaining([fx.locA, fx.locB, fx.locC]));
    expect(auth.authorities.every((a) => a.orgWide)).toBe(true);
  });
});

describe("real reports — isolation, scope and financial correctness", () => {
  it("Overall manager: one report across both organizations, totals exact, informational aggregate", async () => {
    const res = await report(fx.overall, mine());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.organizations.map((o) => o.id).sort()).toEqual(
      [fx.orgA.id, fx.orgB.id].sort(),
    );
    expect(r.summary.informationalAggregate).toBe(true);
    // Nov payroll: Sam 60000 + Sally 56000 + org-level draft 85000 + Org B 99999
    // (October is outside the period and is not summed).
    expect(r.summary.baseCents).toBe(60000 + 56000 + 85000 + 99999);
    expect(r.payrollEntries.some((e) => e.baseCents === 11111)).toBe(false);
    // Native attendance: 28800 + 21600 + 18000 + 14400 (all counted, no breaks)
    expect(r.summary.attendanceSeconds).toBe(28800 + 21600 + 18000 + 14400);
    expect(r.byOrganization).toHaveLength(2);
  });

  it("Sam's snapshot, ledger and balance are reported exactly as stored (draft payment not counted)", async () => {
    const res = await report(
      fx.orgAGM,
      mine({ organizationIds: [fx.orgA.id] }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sam = res.reports[0]!.payrollEntries.find(
      (e) => e.periodId === P.sam,
    )!;
    expect(sam.baseCents).toBe(60000);
    expect(sam.confirmedPaymentsCents).toBe(20000);
    expect(sam.draftPaymentsCents).toBe(5000);
    expect(sam.adjustmentDeltaCents).toBe(-1000);
    expect(sam.adjustmentEffectCents).toBe(1000);
    expect(sam.balanceCents).toBe(60000 - 20000 - -1000);
    expect(sam.paymentState).toBe("partially_paid");
    const ledger = res.reports[0]!.ledger.filter((l) =>
      l.employeeName.includes("Sam"),
    );
    expect(ledger.map((l) => l.ref).sort()).toHaveLength(3);
    expect(ledger.find((l) => l.status.startsWith("Draft"))).toBeTruthy();
  });

  it("Org A GM never receives Org B data, even asking for 'all authorized'", async () => {
    const res = await report(fx.orgAGM);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.organizations.map((o) => o.id)).toEqual([fx.orgA.id]);
    expect(r.payrollEntries.every((e) => e.organizationId === fx.orgA.id)).toBe(
      true,
    );
    expect(r.payrollEntries.some((e) => e.baseCents === 99999)).toBe(false);
    expect(r.attendanceRows.every((a) => a.organizationId === fx.orgA.id)).toBe(
      true,
    );
  });

  it("Org A GM: org-level (no-branch) payroll appears only when ALL branches are selected", async () => {
    const all = await report(fx.orgAGM);
    expect(
      all.ok &&
        all.reports[0]!.payrollEntries.some((e) => e.periodId === P.orgLevel),
    ).toBe(true);
    const one = await report(fx.orgAGM, { locationIds: [fx.locA] });
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(
      one.reports[0]!.payrollEntries.some((e) => e.periodId === P.orgLevel),
    ).toBe(false);
    expect(
      one.reports[0]!.exceptions.some(
        (x) => x.code === "org_level_payroll_excluded",
      ),
    ).toBe(true);
  });

  it("Loc A manager: only Loc A records — no Loc B, no org-level, no other organization", async () => {
    const res = await report(fx.mgrA);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.payrollEntries.map((e) => e.periodId)).toEqual([P.sam]);
    expect(r.attendanceRows.every((a) => a.locationId === fx.locA)).toBe(true);
    expect(r.branches.map((b) => b.id)).toEqual([fx.locA]);
    expect(r.summary.attendanceSeconds).toBe(28800 + 21600);
  });

  it("Loc A manager forging Loc B / Org B ids is refused as a whole and nothing is returned", async () => {
    for (const over of [
      { locationIds: [fx.locA, fx.locB] },
      { locationIds: [fx.locC] },
      { organizationIds: [fx.orgB.id] },
      { organizationIds: [fx.orgA.id], locationIds: [fx.locC] },
    ]) {
      const res = await report(fx.mgrA, over);
      expect(res.ok).toBe(false);
    }
  });

  it("Org B manager cannot name Org A organization or branches", async () => {
    expect(
      (await report(fx.attackerB, { organizationIds: [fx.orgA.id] })).ok,
    ).toBe(false);
    expect((await report(fx.attackerB, { locationIds: [fx.locA] })).ok).toBe(
      false,
    );
    const own = await report(fx.attackerB);
    expect(own.ok && own.reports[0]!.organizations.map((o) => o.id)).toEqual([
      fx.orgB.id,
    ]);
    expect(
      own.ok && own.reports[0]!.payrollEntries.map((e) => e.baseCents),
    ).toEqual([99999]);
  });

  it("a forged employee selection is refused (cross-employee)", async () => {
    const forged = `profile:${fx.staffB.id}`;
    expect((await report(fx.mgrA, { employeeKeys: [forged] })).ok).toBe(false);
    expect((await report(fx.staffA, { employeeKeys: [forged] })).ok).toBe(
      false,
    );
  });

  it("a manager can narrow to one employee and gets only that person", async () => {
    const res = await report(fx.mgrA, {
      employeeKeys: [`profile:${fx.staffA.id}`],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reports[0]!.employees.map((e) => e.key)).toEqual([
      `profile:${fx.staffA.id}`,
    ]);
  });

  it("STAFF sees only their own attendance and their own LOCKED payroll — no colleagues, no drafts", async () => {
    const res = await report(fx.staffA);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(
      r.attendanceRows.every(
        (a) => a.employeeKey === `profile:${fx.staffA.id}`,
      ),
    ).toBe(true);
    expect(r.summary.attendanceSeconds).toBe(28800 + 21600);
    expect(r.payrollEntries.map((e) => e.periodId)).toEqual([P.sam]);
    // a person sees confirmed payments only and no staff identities on them
    const sam = r.payrollEntries[0]!;
    expect(sam.payments.map((p) => p.status)).toEqual(["confirmed"]);
    expect(sam.draftPaymentsCents).toBe(0);
    expect(
      sam.payments.every((p) => p.createdBy === null && p.confirmedBy === null),
    ).toBe(true);
    expect(r.ledger.every((l) => l.actor === null)).toBe(true);
  });

  it("staff cannot widen to a manager's scope by passing 'all' filters", async () => {
    const res = await report(fx.staffA, { locationIds: [fx.locA] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reports[0]!.employees).toHaveLength(1);
    expect((await report(fx.staffA, { locationIds: [fx.locB] })).ok).toBe(
      false,
    );
  });

  it("a revoked member gets nothing, with a non-disclosing message", async () => {
    const res = await report(fx.revokedStaff);
    expect(res.ok).toBe(false);
  });

  it("a member with no branch assignment has nothing to report on (fail closed), never someone else's data", async () => {
    const res = await report(fx.unlinkedStaff, { content: "attendance" });
    expect(res.ok).toBe(false);
  });

  it("output split by branch yields one report per branch with its own totals", async () => {
    const res = await report(fx.orgAGM, { output: "by_branch" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byName = (n: string) =>
      res.reports.find((r) => r.branches.some((b) => b.name === n));
    expect(byName("Payroll Loc A")!.summary.baseCents).toBe(60000);
    expect(byName("Payroll Loc B")!.summary.baseCents).toBe(56000);
    // the org-level record is its own report, never folded into a branch
    expect(res.reports.some((r) => r.summary.baseCents === 85000)).toBe(true);
  });

  it("options offered to a branch manager are exactly their authorized scope", async () => {
    as(fx.mgrA);
    const opts = await getReportingOptionsAction();
    expect(opts.ok).toBe(true);
    if (!opts.ok) return;
    expect(opts.data.organizations.map((o) => o.id)).toEqual([fx.orgA.id]);
    expect(opts.data.branches.map((b) => b.id)).toEqual([fx.locA]);
    const keys = opts.data.employees.map((e) => e.key);
    expect(keys).toContain(`profile:${fx.staffA.id}`);
    expect(keys).not.toContain(`profile:${fx.staffB.id}`);
    expect(JSON.stringify(opts.data)).not.toContain(fx.orgB.id);
  });
});

describe("completeness beyond PostgREST's max_rows (1,000) — real PostgREST", () => {
  // Found by the independent review: PostgREST silently caps every response at max_rows, so a
  // reader that asks for "limit + 1" rows can never see that it was cut short.
  const SHIFTS_PER_DAY = 13;
  const DAYS = 92; // 2026-08-01 .. 2026-10-31
  const bigSessions: string[] = [];

  it("an All-employees attendance report returns EVERY shift when there are more than 1,000", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(Date.UTC(2026, 7, 1 + d))
        .toISOString()
        .slice(0, 10);
      for (let k = 0; k < SHIFTS_PER_DAY; k++) {
        const start = Date.parse(`${date}T08:00:00Z`) + k * 40 * 60 * 1000;
        const id = randomUUID();
        bigSessions.push(id);
        rows.push({
          id,
          organization_id: fx.orgA.id,
          location_id: fx.locA,
          profile_id: fx.staffA.id,
          service_date: date,
          status: "completed",
          clock_in_at: new Date(start).toISOString(),
          clock_out_at: new Date(start + 1800 * 1000).toISOString(),
          gross_elapsed_seconds: 1800,
          total_break_seconds: 0,
          created_by: fx.staffA.id,
        });
      }
    }
    expect(rows.length).toBeGreaterThan(1000);
    for (let i = 0; i < rows.length; i += 500) {
      must(
        await fx.admin
          .from("attendance_sessions")
          .insert(rows.slice(i, i + 500) as never),
      );
    }

    const res = await report(fx.orgAGM, {
      organizationIds: [fx.orgA.id],
      locationIds: [fx.locA],
      content: "attendance",
      startDate: "2026-08-01",
      endDate: "2026-10-31",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.attendanceRows).toHaveLength(rows.length); // all 1,196, not 1,000
    expect(r.summary.attendanceSeconds).toBe(rows.length * 1800);
    expect(r.completeness.complete).toBe(true);
    expect(r.attendanceSlices.every((x) => !x.isPartial)).toBe(true);
  }, 120_000);

  it("more shifts than the report may hold is REPORTED as incomplete, never returned as if whole", async () => {
    // 1,196 + enough extra to pass the 2,000-row ceiling for one branch.
    const extra: Array<Record<string, unknown>> = [];
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(Date.UTC(2026, 7, 1 + d))
        .toISOString()
        .slice(0, 10);
      for (let k = 0; k < SHIFTS_PER_DAY; k++) {
        const start = Date.parse(`${date}T18:00:00Z`) + k * 40 * 60 * 1000;
        const id = randomUUID();
        bigSessions.push(id);
        extra.push({
          id,
          organization_id: fx.orgA.id,
          location_id: fx.locA,
          profile_id: fx.staffA.id,
          service_date: date,
          status: "completed",
          clock_in_at: new Date(start).toISOString(),
          clock_out_at: new Date(start + 1800 * 1000).toISOString(),
          gross_elapsed_seconds: 1800,
          total_break_seconds: 0,
          created_by: fx.staffA.id,
        });
      }
    }
    for (let i = 0; i < extra.length; i += 500) {
      must(
        await fx.admin
          .from("attendance_sessions")
          .insert(extra.slice(i, i + 500) as never),
      );
    }
    const res = await report(fx.orgAGM, {
      organizationIds: [fx.orgA.id],
      locationIds: [fx.locA],
      content: "attendance",
      startDate: "2026-08-01",
      endDate: "2026-10-31",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.completeness.complete).toBe(false);
    expect(r.attendanceSlices.some((x) => x.isPartial)).toBe(true);
    expect(r.exceptions.some((x) => x.code === "attendance_truncated")).toBe(
      true,
    );
  }, 120_000);

  it("an All-employees payroll report returns EVERY period when there are more than 1,000", async () => {
    const base = 5_000_000 + Math.floor(Math.random() * 100_000);
    const rows = Array.from({ length: 1150 }, (_, i) => ({
      organization_id: fx.orgA.id,
      location_id: fx.locA,
      neon_user_id: base + i,
      period_month: "2026-09-01",
      hours_snapshot: 1,
      rate_cents_snapshot: 1000,
      gross_cents: 1000,
      status: "locked",
      generated_by: fx.orgAGM.id,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      must(
        await fx.admin
          .from("payroll_periods")
          .insert(rows.slice(i, i + 500) as never),
      );
    }
    const res = await report(fx.orgAGM, {
      organizationIds: [fx.orgA.id],
      locationIds: [fx.locA],
      content: "payroll",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.reports[0]!;
    expect(r.payrollEntries).toHaveLength(1150); // not silently cut at 1,000
    expect(r.summary.baseCents).toBe(1150 * 1000);
    expect(r.completeness.complete).toBe(true);
  }, 120_000);

  it("cleans up the bulk rows", async () => {
    for (let i = 0; i < bigSessions.length; i += 200) {
      must(
        await fx.admin
          .from("attendance_sessions")
          .delete()
          .in("id", bigSessions.slice(i, i + 200)),
      );
    }
    const { count } = await fx.admin
      .from("attendance_sessions")
      .select("*", { count: "exact", head: true })
      .in("id", bigSessions.slice(0, 200));
    expect(count).toBe(0);
  }, 120_000);
});

describe("reports are read-only", () => {
  it("running every kind of report changes no financial or attendance record", async () => {
    const before = await counts();
    for (const user of [
      fx.overall,
      fx.orgAGM,
      fx.mgrA,
      fx.staffA,
      fx.attackerB,
    ]) {
      await report(user);
      await report(user, { output: "by_branch" });
      await report(user, { content: "payroll" });
      await report(user, { content: "attendance" });
    }
    expect(await counts()).toEqual(before);
    // the stored snapshot is untouched
    const sam = must(
      await fx.admin
        .from("payroll_periods")
        .select("gross_cents, status")
        .eq("id", P.sam)
        .single(),
    ) as { gross_cents: number; status: string };
    expect(sam).toEqual({ gross_cents: 60000, status: "locked" });
  });
});
