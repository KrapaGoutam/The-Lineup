import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPayrollFixture,
  must,
  type PayrollFixture,
} from "./support/payroll-fixture";

describe("Real-JWT and Direct PostgREST Payroll Authorization Suite", () => {
  let fx: PayrollFixture;

  beforeAll(async () => {
    fx = await createPayrollFixture();
  });

  afterAll(async () => {
    if (fx) {
      await fx.teardown();
    }
  });

  // ===========================================================================
  // 1. SELECT & READ SCOPING
  // ===========================================================================
  describe("SELECT payroll periods scoping", () => {
    let periodLocAId: number;
    let periodLocBId: number;
    let periodOrgWideId: number;

    beforeAll(async () => {
      // Seed 3 periods: one at Loc A, one at Loc B, one org-wide (location_id = null)
      const pA = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locA,
            neon_user_id: fx.neonIds.staffA,
            period_month: "2026-07-01",
            hours_snapshot: 40,
            rate_cents_snapshot: 1500,
            gross_cents: 60000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodLocAId = pA.id;

      const pB = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locB,
            neon_user_id: fx.neonIds.staffB,
            period_month: "2026-07-01",
            hours_snapshot: 35,
            rate_cents_snapshot: 1600,
            gross_cents: 56000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodLocBId = pB.id;

      const pOrg = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: null,
            neon_user_id: fx.neonIds.multiStaff,
            period_month: "2026-07-01",
            hours_snapshot: 50,
            rate_cents_snapshot: 1700,
            gross_cents: 85000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodOrgWideId = pOrg.id;
    });

    it("Org GM can read all periods in Org A including location-attributed and org-wide", async () => {
      const res = must(
        await fx.orgAGM.client
          .from("payroll_periods")
          .select("id, location_id, neon_user_id")
          .eq("organization_id", fx.orgA.id),
      );
      const ids = res.map((r) => r.id);
      expect(ids).toContain(periodLocAId);
      expect(ids).toContain(periodLocBId);
      expect(ids).toContain(periodOrgWideId);
    });

    it("Overall Manager can read periods in Org A without tenant membership", async () => {
      const res = must(
        await fx.overall.client
          .from("payroll_periods")
          .select("id, location_id")
          .eq("organization_id", fx.orgA.id),
      );
      const ids = res.map((r) => r.id);
      expect(ids).toContain(periodLocAId);
      expect(ids).toContain(periodLocBId);
      expect(ids).toContain(periodOrgWideId);
    });

    it("Location A Manager can read Loc A periods, but CANNOT read Loc B or org-wide periods", async () => {
      const res = must(
        await fx.mgrA.client
          .from("payroll_periods")
          .select("id, location_id")
          .eq("organization_id", fx.orgA.id),
      );
      const ids = res.map((r) => r.id);
      expect(ids).toContain(periodLocAId);
      expect(ids).not.toContain(periodLocBId);
      expect(ids).not.toContain(periodOrgWideId);
    });

    it("Location B Manager can read Loc B periods, but CANNOT read Loc A or org-wide periods", async () => {
      const res = must(
        await fx.mgrB.client
          .from("payroll_periods")
          .select("id, location_id")
          .eq("organization_id", fx.orgA.id),
      );
      const ids = res.map((r) => r.id);
      expect(ids).toContain(periodLocBId);
      expect(ids).not.toContain(periodLocAId);
      expect(ids).not.toContain(periodOrgWideId);
    });

    it("Staff A cannot read draft periods (sees 0 rows)", async () => {
      const res = must(
        await fx.staffA.client
          .from("payroll_periods")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      );
      expect(res).toHaveLength(0);
    });

    it("Staff A can read own locked period, but cannot read coworkers' locked periods", async () => {
      // Lock period A and period B
      must(
        await fx.admin
          .from("payroll_periods")
          .update({ status: "locked", locked_at: new Date().toISOString() })
          .in("id", [periodLocAId, periodLocBId]),
      );

      const resStaffA = must(
        await fx.staffA.client
          .from("payroll_periods")
          .select("id, neon_user_id")
          .eq("organization_id", fx.orgA.id),
      );
      expect(resStaffA).toHaveLength(1);
      expect(resStaffA[0].id).toBe(periodLocAId);

      // Unlinked staff sees 0 rows
      const resUnlinked = must(
        await fx.unlinkedStaff.client
          .from("payroll_periods")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      );
      expect(resUnlinked).toHaveLength(0);
    });

    it("Attacker from Org B sees 0 rows in Org A", async () => {
      const res = must(
        await fx.attackerB.client
          .from("payroll_periods")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      );
      expect(res).toHaveLength(0);
    });

    it("Anonymous client cannot read periods (denied 42501)", async () => {
      const res = await fx.anonClient
        .from("payroll_periods")
        .select("id")
        .eq("organization_id", fx.orgA.id);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });
  });

  // ===========================================================================
  // 2. INSERT PERIODS & ACTOR FORGERY
  // ===========================================================================
  describe("INSERT payroll periods", () => {
    it("Org GM can insert period with location_id = null", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .insert({
          organization_id: fx.orgA.id,
          location_id: null,
          neon_user_id: 88801,
          period_month: "2026-08-01",
          hours_snapshot: 20,
          rate_cents_snapshot: 1500,
          gross_cents: 30000,
          generated_by: fx.orgAGM.id,
        })
        .select()
        .single();
      expect(res.error).toBeNull();
      expect(res.data?.location_id).toBeNull();
    });

    it("Location A Manager CANNOT fabricate a period for Loc A by direct insert (no verified attendance provenance)", async () => {
      const res = await fx.mgrA.client
        .from("payroll_periods")
        .insert({
          organization_id: fx.orgA.id,
          location_id: fx.locA,
          neon_user_id: 88802,
          period_month: "2026-08-01",
          hours_snapshot: 9999,
          rate_cents_snapshot: 99999,
          gross_cents: 999999999,
          generated_by: fx.mgrA.id,
        })
        .select();
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      const stored = must(
        await fx.admin
          .from("payroll_periods")
          .select("id")
          .eq("organization_id", fx.orgA.id)
          .eq("neon_user_id", 88802),
      );
      expect(stored).toHaveLength(0);
    });

    it("Location A Assistant Manager CANNOT fabricate a period either", async () => {
      const res = await fx.asstA.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: fx.locA,
        neon_user_id: 88808,
        period_month: "2026-08-01",
        hours_snapshot: 1,
        rate_cents_snapshot: 1,
        gross_cents: 1,
        generated_by: fx.asstA.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Location A Manager CANNOT insert period with location_id = null", async () => {
      const res = await fx.mgrA.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: null,
        neon_user_id: 88803,
        period_month: "2026-08-01",
        hours_snapshot: 20,
        rate_cents_snapshot: 1500,
        gross_cents: 30000,
        generated_by: fx.mgrA.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Location A Manager CANNOT insert period for Loc B", async () => {
      const res = await fx.mgrA.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: fx.locB,
        neon_user_id: 88804,
        period_month: "2026-08-01",
        hours_snapshot: 20,
        rate_cents_snapshot: 1500,
        gross_cents: 30000,
        generated_by: fx.mgrA.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Staff CANNOT insert periods", async () => {
      const res = await fx.staffA.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: fx.locA,
        neon_user_id: 88805,
        period_month: "2026-08-01",
        hours_snapshot: 20,
        rate_cents_snapshot: 1500,
        gross_cents: 30000,
        generated_by: fx.staffA.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Forging generated_by is rejected by payroll_periods_actor_guard", async () => {
      const res = await fx.mgrA.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: fx.locA,
        neon_user_id: 88806,
        period_month: "2026-08-01",
        hours_snapshot: 20,
        rate_cents_snapshot: 1500,
        gross_cents: 30000,
        generated_by: fx.orgAGM.id, // Forged actor!
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("signed-in user");
    });
  });

  // ===========================================================================
  // 3. PERIOD IMMUTABILITY & CONSTRAINTS
  // ===========================================================================
  describe("Period identity immutability and constraints", () => {
    let testPeriodId: number;

    beforeAll(async () => {
      const p = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locA,
            neon_user_id: 88807,
            period_month: "2026-08-01",
            hours_snapshot: 10,
            rate_cents_snapshot: 1500,
            gross_cents: 15000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      testPeriodId = p.id;
    });

    it("Direct UPDATE cannot change organization_id on payroll_periods", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .update({ organization_id: fx.orgB.id })
        .eq("id", testPeriodId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("organization");
    });

    it("Direct UPDATE cannot change neon_user_id on payroll_periods", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .update({ neon_user_id: 99999 })
        .eq("id", testPeriodId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("employee");
    });

    it("Direct UPDATE cannot change period_month on payroll_periods", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .update({ period_month: "2026-09-01" })
        .eq("id", testPeriodId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("period month");
    });

    it("Direct UPDATE cannot change generated_by on payroll_periods", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .update({ generated_by: fx.overall.id })
        .eq("id", testPeriodId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("generator");
    });

    it("Cannot insert duplicate period for same (organization_id, neon_user_id, period_month)", async () => {
      const res = await fx.orgAGM.client.from("payroll_periods").insert({
        organization_id: fx.orgA.id,
        location_id: fx.locB,
        neon_user_id: 88807,
        period_month: "2026-08-01",
        hours_snapshot: 15,
        rate_cents_snapshot: 1500,
        gross_cents: 22500,
        generated_by: fx.orgAGM.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("23505"); // Unique violation
    });
  });

  // ===========================================================================
  // 4. COMPENSATION SETTINGS & RATES
  // ===========================================================================
  describe("Rates and compensation settings authorization", () => {
    it("Org GM can set and update default payroll settings", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_settings")
        .upsert({
          organization_id: fx.orgA.id,
          default_rate_cents: 1600,
          updated_by: fx.orgAGM.id,
        })
        .select()
        .single();
      expect(res.error).toBeNull();
      expect(res.data?.default_rate_cents).toBe(1600);
    });

    it("Location A Manager CANNOT modify payroll_settings (denied by RLS)", async () => {
      const res = await fx.mgrA.client
        .from("payroll_settings")
        .update({ default_rate_cents: 2000 })
        .eq("organization_id", fx.orgA.id)
        .select();
      expect(res.data).toHaveLength(0);

      // Verify setting remains untouched
      const check = must(
        await fx.admin
          .from("payroll_settings")
          .select("default_rate_cents")
          .eq("organization_id", fx.orgA.id)
          .single(),
      );
      expect(check.default_rate_cents).toBe(1600);
    });

    it("Location A Manager CANNOT insert or delete payroll_rates (denied by RLS)", async () => {
      const insertRes = await fx.mgrA.client.from("payroll_rates").insert({
        organization_id: fx.orgA.id,
        neon_user_id: fx.neonIds.staffA,
        rate_cents: 2500,
        updated_by: fx.mgrA.id,
      });
      expect(insertRes.error).not.toBeNull();
      expect(insertRes.error?.code).toBe("42501");

      const deleteRes = await fx.mgrA.client
        .from("payroll_rates")
        .delete()
        .eq("organization_id", fx.orgA.id)
        .select();
      expect(deleteRes.data).toHaveLength(0);
    });

    it("Org GM can configure rate overrides", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_rates")
        .upsert({
          organization_id: fx.orgA.id,
          neon_user_id: fx.neonIds.staffA,
          rate_cents: 2200,
          updated_by: fx.orgAGM.id,
        })
        .select()
        .single();
      expect(res.error).toBeNull();
      expect(res.data?.rate_cents).toBe(2200);
    });

    it("Staff CANNOT read payroll_settings or payroll_rates", async () => {
      const resSettings = must(
        await fx.staffA.client
          .from("payroll_settings")
          .select("default_rate_cents")
          .eq("organization_id", fx.orgA.id),
      );
      expect(resSettings).toHaveLength(0);

      const resRates = must(
        await fx.staffA.client
          .from("payroll_rates")
          .select("rate_cents")
          .eq("organization_id", fx.orgA.id),
      );
      expect(resRates).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 5. PAYMENTS & ADJUSTMENTS FINANCIAL INTEGRITY
  // ===========================================================================
  describe("Payments, adjustments, and parent/child financial ownership", () => {
    let periodAId: number;
    let periodBId: number;
    let draftPaymentId: number;
    let confirmedPaymentId: number;

    beforeAll(async () => {
      const pA = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locA,
            neon_user_id: 88820,
            period_month: "2026-09-01",
            hours_snapshot: 40,
            rate_cents_snapshot: 1500,
            gross_cents: 60000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodAId = pA.id;

      const pB = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locB,
            neon_user_id: 88821,
            period_month: "2026-09-01",
            hours_snapshot: 40,
            rate_cents_snapshot: 1500,
            gross_cents: 60000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodBId = pB.id;
    });

    it("Location A Manager can insert draft payment on Loc A period", async () => {
      const res = await fx.mgrA.client
        .from("payroll_payments")
        .insert({
          organization_id: fx.orgA.id,
          payroll_period_id: periodAId,
          amount_cents: 20000,
          payment_date: "2026-09-15",
          comment: "Initial draft disbursement",
          status: "draft",
          created_by: fx.mgrA.id,
        })
        .select()
        .single();
      expect(res.error).toBeNull();
      draftPaymentId = res.data!.id;
    });

    it("Location A Manager CANNOT insert payment on Loc B period (RLS denied)", async () => {
      const res = await fx.mgrA.client.from("payroll_payments").insert({
        organization_id: fx.orgA.id,
        payroll_period_id: periodBId,
        amount_cents: 10000,
        payment_date: "2026-09-15",
        status: "draft",
        created_by: fx.mgrA.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Forged payment organization_id is rejected by composite FK", async () => {
      const res = await fx.admin.from("payroll_payments").insert({
        organization_id: fx.orgB.id, // Mismatched organization!
        payroll_period_id: periodAId,
        amount_cents: 10000,
        payment_date: "2026-09-15",
        status: "draft",
        created_by: fx.orgAGM.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("23503"); // Foreign key violation
    });

    it("Forged adjustment organization_id is rejected by composite FK", async () => {
      const res = await fx.admin.from("payroll_adjustments").insert({
        organization_id: fx.orgB.id, // Mismatched organization!
        payroll_period_id: periodAId,
        delta_cents: 1000,
        reason: "Cross-tenant attack attempt",
        created_by: fx.orgAGM.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("23503"); // Foreign key violation
    });

    it("Direct UPDATE cannot reassign draft payment to different payroll_period_id", async () => {
      const res = await fx.mgrA.client
        .from("payroll_payments")
        .update({ payroll_period_id: periodBId })
        .eq("id", draftPaymentId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("payroll period");
    });

    it("Direct UPDATE cannot reassign draft payment to different organization_id", async () => {
      const res = await fx.mgrA.client
        .from("payroll_payments")
        .update({ organization_id: fx.orgB.id })
        .eq("id", draftPaymentId);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      expect(res.error?.message).toContain("organization");
    });

    it("Confirmed payment is immutable against direct table UPDATE", async () => {
      // Confirm the payment
      must(
        await fx.mgrA.client
          .from("payroll_payments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            confirmed_by: fx.mgrA.id,
          })
          .eq("id", draftPaymentId),
      );
      confirmedPaymentId = draftPaymentId;

      // Attempt direct edit on amount
      const editRes = await fx.mgrA.client
        .from("payroll_payments")
        .update({ amount_cents: 99999 })
        .eq("id", confirmedPaymentId);
      expect(editRes.error).not.toBeNull();
      expect(editRes.error?.message).toContain(
        "Cannot edit a confirmed payment",
      );
    });

    it("Confirmed payment CANNOT be deleted (RLS draft-only and trigger backstop)", async () => {
      // Manager delete is filtered out by RLS status = 'draft' (0 rows affected)
      const delRes = await fx.mgrA.client
        .from("payroll_payments")
        .delete()
        .eq("id", confirmedPaymentId)
        .select();
      expect(delRes.data).toHaveLength(0);

      // Direct delete by admin (bypassing RLS) is blocked by forbid_confirmed_payment_delete trigger
      const adminDelRes = await fx.admin
        .from("payroll_payments")
        .delete()
        .eq("id", confirmedPaymentId);
      expect(adminDelRes.error).not.toBeNull();
      expect(adminDelRes.error?.message).toContain(
        "Cannot delete a confirmed payment",
      );
    });

    it("unconfirm_payroll_payment RPC reverts confirmed payment with mandatory reason and audit event", async () => {
      // Missing / short reason throws exception
      const failRpc = await fx.mgrA.client.rpc("unconfirm_payroll_payment", {
        p_payment_id: confirmedPaymentId,
        p_reason: "no",
      });
      expect(failRpc.error).not.toBeNull();
      expect(failRpc.error?.message).toContain("at least 3 characters");

      // Valid reason by authorized manager succeeds
      const okRpc = await fx.mgrA.client.rpc("unconfirm_payroll_payment", {
        p_payment_id: confirmedPaymentId,
        p_reason: "Check number was entered incorrectly",
      });
      expect(okRpc.error).toBeNull();

      // Verify payment status reverted to draft
      const checkPayment = must(
        await fx.admin
          .from("payroll_payments")
          .select("status, confirmed_at, confirmed_by")
          .eq("id", confirmedPaymentId)
          .single(),
      );
      expect(checkPayment.status).toBe("draft");
      expect(checkPayment.confirmed_at).toBeNull();
      expect(checkPayment.confirmed_by).toBeNull();

      // Verify audit event
      const audit = must(
        await fx.admin
          .from("audit_events")
          .select("action, reason, actor_profile_id")
          .eq("entity_id", String(confirmedPaymentId))
          .single(),
      );
      expect(audit.action).toBe("payroll_payment_unconfirmed");
      expect(audit.reason).toBe("Check number was entered incorrectly");
      expect(audit.actor_profile_id).toBe(fx.mgrA.id);
    });

    it("unconfirm_payroll_payment RPC rejects cross-location manager", async () => {
      // Re-confirm payment under Loc A
      must(
        await fx.admin
          .from("payroll_payments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            confirmed_by: fx.orgAGM.id,
          })
          .eq("id", confirmedPaymentId),
      );

      // Mgr B tries to unconfirm Loc A payment
      const res = await fx.mgrB.client.rpc("unconfirm_payroll_payment", {
        p_payment_id: confirmedPaymentId,
        p_reason: "Unauthorized attempt",
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.message).toContain("do not have permission");

      // Cleanup: revert to draft via orgAGM
      await fx.orgAGM.client.rpc("unconfirm_payroll_payment", {
        p_payment_id: confirmedPaymentId,
        p_reason: "Reset to draft after test",
      });
    });
  });

  // ===========================================================================
  // 6. REVOCATION & RPC VERIFICATION
  // ===========================================================================
  describe("Revoked membership and public RPC authorization", () => {
    it("payroll_location_authorized RPC returns accurate permissions", async () => {
      const overallLocA = must(
        await fx.overall.client.rpc("payroll_location_authorized", {
          p_organization_id: fx.orgA.id,
          p_location_id: fx.locA,
        }),
      );
      expect(overallLocA).toBe(true);

      const mgrALocA = must(
        await fx.mgrA.client.rpc("payroll_location_authorized", {
          p_organization_id: fx.orgA.id,
          p_location_id: fx.locA,
        }),
      );
      expect(mgrALocA).toBe(true);

      const mgrALocB = must(
        await fx.mgrA.client.rpc("payroll_location_authorized", {
          p_organization_id: fx.orgA.id,
          p_location_id: fx.locB,
        }),
      );
      expect(mgrALocB).toBe(false);

      const attackerLocA = must(
        await fx.attackerB.client.rpc("payroll_location_authorized", {
          p_organization_id: fx.orgA.id,
          p_location_id: fx.locA,
        }),
      );
      expect(attackerLocA).toBe(false);
    });

    it("Revocation is effective immediately for valid JWT", async () => {
      // Seed locked period for revoked staff
      must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locA,
            neon_user_id: fx.neonIds.revokedStaff,
            period_month: "2026-06-01",
            hours_snapshot: 30,
            rate_cents_snapshot: 1500,
            gross_cents: 45000,
            generated_by: fx.orgAGM.id,
            status: "locked",
          })
          .select("id")
          .single(),
      );

      // revokedStaff has active = false on memberships
      const res = must(
        await fx.revokedStaff.client
          .from("payroll_periods")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      );
      // Because membership is inactive, RLS select_self joins memberships with m.active = true, returning 0 rows
      expect(res).toHaveLength(0);
    });

    it("Composite location FK ON DELETE RESTRICT prevents deleting location with payroll periods", async () => {
      // Try to delete Loc A which has periods referencing it
      const res = await fx.admin.from("locations").delete().eq("id", fx.locA);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("23503"); // Foreign key restriction
    });
  });

  // ===========================================================================
  // 7. INDEPENDENT REVIEW HARDENING (direct PostgREST bypass attempts)
  // ===========================================================================
  describe("Independent-review hardening", () => {
    let periodId: number;

    beforeAll(async () => {
      const p = must(
        await fx.admin
          .from("payroll_periods")
          .insert({
            organization_id: fx.orgA.id,
            location_id: fx.locA,
            neon_user_id: 88830,
            period_month: "2026-10-01",
            hours_snapshot: 10,
            rate_cents_snapshot: 1000,
            gross_cents: 10000,
            generated_by: fx.orgAGM.id,
            status: "draft",
          })
          .select("id")
          .single(),
      );
      periodId = p.id;
    });

    it("Location Manager CANNOT rewrite hours/rate/gross of an unpaid, unlocked period", async () => {
      const res = await fx.mgrA.client
        .from("payroll_periods")
        .update({ hours_snapshot: 500, gross_cents: 500000 })
        .eq("id", periodId)
        .select();
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
      const row = must(
        await fx.admin
          .from("payroll_periods")
          .select("gross_cents")
          .eq("id", periodId)
          .single(),
      );
      expect(row.gross_cents).toBe(10000);
    });

    it("Location Manager CANNOT move a period to another branch or detach it", async () => {
      const toB = await fx.mgrA.client
        .from("payroll_periods")
        .update({ location_id: fx.locB })
        .eq("id", periodId)
        .select();
      expect(toB.error).not.toBeNull();
      const detach = await fx.mgrA.client
        .from("payroll_periods")
        .update({ location_id: null })
        .eq("id", periodId)
        .select();
      expect(detach.error).not.toBeNull();
      expect(detach.error?.code).toBe("42501");
    });

    it("Forged confirmed_by on direct payment insert is rejected", async () => {
      const res = await fx.mgrA.client.from("payroll_payments").insert({
        organization_id: fx.orgA.id,
        payroll_period_id: periodId,
        amount_cents: 100,
        payment_date: "2026-10-15",
        created_by: fx.mgrA.id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: fx.orgAGM.id,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Locked period snapshot is frozen even for organization authority", async () => {
      const lock = await fx.orgAGM.client
        .from("payroll_periods")
        .update({
          status: "locked",
          locked_at: new Date().toISOString(),
          locked_by: fx.orgAGM.id,
        })
        .eq("id", periodId)
        .select();
      expect(lock.error).toBeNull();
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .update({ gross_cents: 1 })
        .eq("id", periodId)
        .select();
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBe("42501");
    });

    it("Org GM can still create an org-wide (unattributed) period directly", async () => {
      const res = await fx.orgAGM.client
        .from("payroll_periods")
        .insert({
          organization_id: fx.orgA.id,
          location_id: null,
          neon_user_id: 88831,
          period_month: "2026-10-01",
          hours_snapshot: 5,
          rate_cents_snapshot: 1000,
          gross_cents: 5000,
          generated_by: fx.orgAGM.id,
        })
        .select()
        .single();
      expect(res.error).toBeNull();
      expect(res.data?.location_id).toBeNull();
    });

    it("A banned manager's still-valid JWT loses payroll write authority immediately", async () => {
      const ban = await fx.admin.auth.admin.updateUserById(fx.orgAGM.id, {
        ban_duration: "1h",
      });
      expect(ban.error).toBeNull();
      try {
        const res = await fx.orgAGM.client.from("payroll_periods").insert({
          organization_id: fx.orgA.id,
          location_id: null,
          neon_user_id: 88832,
          period_month: "2026-10-01",
          hours_snapshot: 5,
          rate_cents_snapshot: 1000,
          gross_cents: 5000,
          generated_by: fx.orgAGM.id,
        });
        expect(res.error).not.toBeNull();
        expect(res.error?.code).toBe("42501");
      } finally {
        const unban = await fx.admin.auth.admin.updateUserById(fx.orgAGM.id, {
          ban_duration: "none",
        });
        expect(unban.error).toBeNull();
      }
    });
  });
});
