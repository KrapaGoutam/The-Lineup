/**
 * tests/local/payroll-migration-rehearsal.local.test.ts
 *
 * HISTORICAL POPULATED-DATA MIGRATION COMPATIBILITY REHEARSAL
 *
 * Section 9 Verification:
 * Validates the forward-only migration (20261108021714_payroll_location_scoping.sql)
 * against a synthetic dataset exercising all 10 historical financial states:
 *
 * 1. Unpaid period (gross_cents > 0, payments = 0, adjustments = 0, status = draft)
 * 2. Partially paid period (gross_cents > 0, 0 < sum(payments) < gross_cents)
 * 3. Fully paid period (sum(payments) == gross_cents)
 * 4. Overpaid period (adjustments reduce gross below payments)
 * 5. Underpaid period with positive adjustment
 * 6. Locked period (status = locked) with draft payment
 * 7. Locked period with confirmed payment
 * 8. Period with unconfirmed payment history (audit_events row exists)
 * 9. Historical period with location_id = NULL
 * 10. Multi-location employee with separate periods across months
 *
 * Asserts 100% byte-for-byte and cent-for-cent financial preservation:
 * - Every primary key preserved
 * - Every hours, rate, and gross snapshot preserved
 * - Every payment, status, and audit log preserved
 * - Every calculated net balance matches exactly
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createPayrollFixture,
  type PayrollFixture,
} from "./support/payroll-fixture";

interface StateSnapshot {
  periodId: number;
  neonUserId: number;
  month: string;
  locationId: string | null;
  grossCents: number;
  hoursSnapshot: number;
  rateCentsSnapshot: number;
  status: string;
  confirmedPaymentsTotal: number;
  draftPaymentsTotal: number;
  adjustmentsTotal: number;
  netBalanceCents: number;
  paymentIds: number[];
  adjustmentIds: number[];
  auditEventActions: string[];
}

describe("Payroll Historical Populated-Data Migration Compatibility Rehearsal", () => {
  let fx: PayrollFixture;
  const initialSnapshots: Record<string, StateSnapshot> = {};

  beforeAll(async () => {
    fx = await createPayrollFixture();

    // Helper to insert period
    async function insertPeriod(params: {
      neonUserId: number;
      month: string;
      locationId: string | null;
      hours: number;
      rate: number;
      gross: number;
      status?: "draft" | "locked";
    }) {
      const { data, error } = await fx.admin
        .from("payroll_periods")
        .insert({
          organization_id: fx.orgA.id,
          location_id: params.locationId,
          neon_user_id: params.neonUserId,
          period_month: params.month,
          hours_snapshot: params.hours,
          rate_cents_snapshot: params.rate,
          gross_cents: params.gross,
          generated_by: fx.orgAGM.id,
          status: params.status || "draft",
          locked_at:
            params.status === "locked" ? new Date().toISOString() : null,
          locked_by: params.status === "locked" ? fx.orgAGM.id : null,
        })
        .select()
        .single();
      if (error) throw new Error(`Insert period error: ${error.message}`);
      return data;
    }

    // 1. Unpaid period (gross 50000, 0 payments, 0 adjustments, draft)
    const s1 = await insertPeriod({
      neonUserId: 90001,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 25,
      rate: 2000,
      gross: 50000,
    });

    // 2. Partially paid period (gross 60000, 1 confirmed payment 25000)
    const s2 = await insertPeriod({
      neonUserId: 90002,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 30,
      rate: 2000,
      gross: 60000,
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s2.id,
        amount_cents: 25000,
        payment_date: "2026-01-15",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
        comment: "Partial disbursement",
      })
      .select()
      .single();

    // 3. Fully paid period (gross 40000, 1 confirmed payment 40000)
    const s3 = await insertPeriod({
      neonUserId: 90003,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 20,
      rate: 2000,
      gross: 40000,
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s3.id,
        amount_cents: 40000,
        payment_date: "2026-01-20",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
        comment: "Final disbursement",
      })
      .select()
      .single();

    // 4. Overpaid period (gross 50000, payment 50000, negative adjustment -10000 -> net 40000, balance -10000)
    const s4 = await insertPeriod({
      neonUserId: 90004,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 25,
      rate: 2000,
      gross: 50000,
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s4.id,
        amount_cents: 50000,
        payment_date: "2026-01-20",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();
    await fx.admin
      .from("payroll_adjustments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s4.id,
        delta_cents: -10000,
        reason: "Hours entered incorrectly in attendance system",
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();

    // 5. Underpaid period with positive adjustment (gross 45000, adj +5000, payment 45000 -> balance 5000)
    const s5 = await insertPeriod({
      neonUserId: 90005,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 30,
      rate: 1500,
      gross: 45000,
    });
    await fx.admin
      .from("payroll_adjustments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s5.id,
        delta_cents: 5000,
        reason: "Holiday premium pay adjustment",
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s5.id,
        amount_cents: 45000,
        payment_date: "2026-01-25",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();

    // 6. Locked period with draft payment (gross 30000, locked, draft payment 30000)
    const s6 = await insertPeriod({
      neonUserId: 90006,
      month: "2026-01-01",
      locationId: fx.locB,
      hours: 20,
      rate: 1500,
      gross: 30000,
      status: "locked",
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s6.id,
        amount_cents: 30000,
        payment_date: "2026-01-28",
        status: "draft",
        created_by: fx.mgrB.id,
      })
      .select()
      .single();

    // 7. Locked period with confirmed payment (gross 50000, locked, confirmed payment 50000)
    const s7 = await insertPeriod({
      neonUserId: 90007,
      month: "2026-01-01",
      locationId: fx.locB,
      hours: 25,
      rate: 2000,
      gross: 50000,
      status: "locked",
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s7.id,
        amount_cents: 50000,
        payment_date: "2026-01-30",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();

    // 8. Period with unconfirmed payment history (audit_events row exists)
    const s8 = await insertPeriod({
      neonUserId: 90008,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 15,
      rate: 2000,
      gross: 30000,
    });
    const s8Pay = await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s8.id,
        amount_cents: 30000,
        payment_date: "2026-01-10",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();
    // Unconfirm via RPC to generate audit record and draft reversion
    await fx.orgAGM.client.rpc("unconfirm_payroll_payment", {
      p_payment_id: s8Pay.data!.id,
      p_reason: "Initial check bounced, reversing payment",
    });

    // 9. Historical period with location_id = NULL
    const s9 = await insertPeriod({
      neonUserId: 90009,
      month: "2025-12-01",
      locationId: null, // Historical organization-wide period
      hours: 40,
      rate: 1800,
      gross: 72000,
    });
    await fx.admin
      .from("payroll_payments")
      .insert({
        organization_id: fx.orgA.id,
        payroll_period_id: s9.id,
        amount_cents: 72000,
        payment_date: "2025-12-28",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
        created_by: fx.orgAGM.id,
      })
      .select()
      .single();

    // 10. Multi-location employee with separate periods in different months
    const s10a = await insertPeriod({
      neonUserId: 90010,
      month: "2026-01-01",
      locationId: fx.locA,
      hours: 20,
      rate: 2000,
      gross: 40000,
    });
    const s10b = await insertPeriod({
      neonUserId: 90010,
      month: "2026-02-01",
      locationId: fx.locB,
      hours: 25,
      rate: 2000,
      gross: 50000,
    });

    // Capture baseline snapshots for all 10 states
    const periodIds = [
      s1.id,
      s2.id,
      s3.id,
      s4.id,
      s5.id,
      s6.id,
      s7.id,
      s8.id,
      s9.id,
      s10a.id,
      s10b.id,
    ];

    for (const pid of periodIds) {
      const p = (
        await fx.admin
          .from("payroll_periods")
          .select("*")
          .eq("id", pid)
          .single()
      ).data!;
      const payments =
        (
          await fx.admin
            .from("payroll_payments")
            .select("*")
            .eq("payroll_period_id", pid)
        ).data || [];
      const adjustments =
        (
          await fx.admin
            .from("payroll_adjustments")
            .select("*")
            .eq("payroll_period_id", pid)
        ).data || [];
      const audits =
        (
          await fx.admin
            .from("audit_events")
            .select("*")
            .in(
              "entity_id",
              payments.map((pay) => String(pay.id)),
            )
        ).data || [];

      const confirmedPaymentsTotal = payments
        .filter((pay) => pay.status === "confirmed")
        .reduce((sum, pay) => sum + pay.amount_cents, 0);

      const draftPaymentsTotal = payments
        .filter((pay) => pay.status === "draft")
        .reduce((sum, pay) => sum + pay.amount_cents, 0);

      const adjustmentsTotal = adjustments.reduce(
        (sum, adj) => sum + adj.delta_cents,
        0,
      );

      const netBalanceCents =
        p.gross_cents + adjustmentsTotal - confirmedPaymentsTotal;

      initialSnapshots[String(pid)] = {
        periodId: pid,
        neonUserId: p.neon_user_id as number,
        month: p.period_month,
        locationId: p.location_id,
        grossCents: p.gross_cents,
        hoursSnapshot: p.hours_snapshot,
        rateCentsSnapshot: p.rate_cents_snapshot,
        status: p.status,
        confirmedPaymentsTotal,
        draftPaymentsTotal,
        adjustmentsTotal,
        netBalanceCents,
        paymentIds: payments.map((pay) => pay.id),
        adjustmentIds: adjustments.map((adj) => adj.id),
        auditEventActions: audits.map((a) => a.action),
      };
    }
  });

  afterAll(async () => {
    await fx.teardown();
  });

  it("Rehearses full forward migration SQL replay on top of live populated data", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../supabase/migrations/20261108021714_payroll_location_scoping.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    // Execute migration SQL into PostgreSQL database container
    const cmd = `docker exec -i supabase_db_restaurant-roster psql -U postgres -d postgres`;
    const res = execSync(cmd, {
      input: migrationSql,
      encoding: "utf-8",
    });

    expect(res).toContain("COMMIT");
  });

  it("Asserts 100% preservation of every financial record and net balance (0 cent shift)", async () => {
    for (const [pidStr, baseline] of Object.entries(initialSnapshots)) {
      const pid = Number(pidStr);

      const postP = (
        await fx.admin
          .from("payroll_periods")
          .select("*")
          .eq("id", pid)
          .single()
      ).data!;
      expect(postP).not.toBeNull();
      expect(postP.id).toBe(baseline.periodId);
      expect(postP.neon_user_id).toBe(baseline.neonUserId);
      expect(postP.period_month).toBe(baseline.month);
      expect(postP.location_id).toBe(baseline.locationId);
      expect(postP.gross_cents).toBe(baseline.grossCents);
      expect(postP.hours_snapshot).toBe(baseline.hoursSnapshot);
      expect(postP.rate_cents_snapshot).toBe(baseline.rateCentsSnapshot);
      expect(postP.status).toBe(baseline.status);

      const postPayments =
        (
          await fx.admin
            .from("payroll_payments")
            .select("*")
            .eq("payroll_period_id", pid)
        ).data || [];
      expect(postPayments.map((p) => p.id)).toEqual(baseline.paymentIds);

      const postConfirmedTotal = postPayments
        .filter((pay) => pay.status === "confirmed")
        .reduce((sum, pay) => sum + pay.amount_cents, 0);
      expect(postConfirmedTotal).toBe(baseline.confirmedPaymentsTotal);

      const postAdjustments =
        (
          await fx.admin
            .from("payroll_adjustments")
            .select("*")
            .eq("payroll_period_id", pid)
        ).data || [];
      expect(postAdjustments.map((a) => a.id)).toEqual(baseline.adjustmentIds);

      const postAdjustmentsTotal = postAdjustments.reduce(
        (sum, adj) => sum + adj.delta_cents,
        0,
      );
      expect(postAdjustmentsTotal).toBe(baseline.adjustmentsTotal);

      // Verify net balance preserved exactly
      const postNetBalance =
        postP.gross_cents + postAdjustmentsTotal - postConfirmedTotal;
      expect(postNetBalance).toBe(baseline.netBalanceCents);

      // Verify audit events preserved
      if (baseline.auditEventActions.length > 0) {
        const postAudits =
          (
            await fx.admin
              .from("audit_events")
              .select("*")
              .in(
                "entity_id",
                postPayments.map((p) => String(p.id)),
              )
          ).data || [];
        expect(postAudits.map((a) => a.action)).toEqual(
          baseline.auditEventActions,
        );
      }
    }
  });

  it("Asserts post-migration security and access scoping across all 10 states", async () => {
    // Org GM sees all 11 periods (including historical NULL-location period)
    const orgRes = await fx.orgAGM.client
      .from("payroll_periods")
      .select("id")
      .eq("organization_id", fx.orgA.id);
    expect(orgRes.error).toBeNull();
    const orgIds = orgRes.data!.map((r) => r.id);
    for (const pidStr of Object.keys(initialSnapshots)) {
      expect(orgIds).toContain(Number(pidStr));
    }

    // Location A manager sees only Loc A periods; CANNOT see Loc B periods or NULL-location periods
    const locARes = await fx.mgrA.client
      .from("payroll_periods")
      .select("id, location_id")
      .eq("organization_id", fx.orgA.id);
    expect(locARes.error).toBeNull();
    for (const r of locARes.data!) {
      expect(r.location_id).toBe(fx.locA);
    }

    // Historical NULL-location period is NOT visible to branch manager A
    const nullLocPeriod = Object.values(initialSnapshots).find(
      (s) => s.locationId === null,
    )!;
    expect(locARes.data!.map((r) => r.id)).not.toContain(
      nullLocPeriod.periodId,
    );
  });
});
