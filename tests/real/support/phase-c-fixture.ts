import { CONFIGURABLE_MODULE_KEYS } from "../../../src/features/modules/domain/module-registry";
import { createFixture, todayInChicago, type Fixture } from "./harness";

/**
 * Group 2 Phase C fixture (V2.0.8 Tips + V2.0.9 Dashboard, hosted DEV).
 *
 * Everything is a disposable synthetic organization created by the shared harness; no existing
 * DEV row is read or changed. Truth values are derived from the RAW tables with the service
 * role (never from the code under test), so the dashboard is reconciled against independent
 * arithmetic:
 *
 *   Branch A (internal attendance): attendance, tips, bar inventory, tasks, table allocation ON.
 *   Branch B (external attendance): attendance, payroll, bar inventory, tasks ON; tips OFF.
 *
 * Staff (server1..3) belong to A only. Manager and owner manage A and B.
 */

type Check<T> = { data: T; error: { message: string } | null };
function ok<T>(result: Check<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export const PHASE_C_CHICAGO_MONTH = () => `${todayInChicago().slice(0, 7)}-01`;
const PREVIOUS_MONTH = () => {
  const [year, month] = todayInChicago().split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

export async function createPhaseCFixture() {
  const fx: Fixture = await createFixture();
  const admin = fx.admin;
  const date = todayInChicago();

  const orgRow = ok(
    await admin
      .from("organizations")
      .select("slug")
      .eq("id", fx.orgId)
      .single(),
    "slug",
  ) as { slug: string };
  const slug = orgRow.slug;

  async function teardown() {
    // Rows that block an organization delete (restrict FKs) or re-write history on a direct
    // delete go first; everything else clears by the organization cascade in fx.teardown.
    await admin
      .from("attendance_sessions")
      .delete()
      .eq("organization_id", fx.orgId);
    await admin
      .from("location_module_configs")
      .delete()
      .in("location_id", [fx.locA, fx.locB, fx.otherLoc]);
    await admin
      .from("tip_revisions")
      .delete()
      .in("organization_id", [fx.orgId, fx.otherOrgId]);
    await fx.teardown();
    const left = await admin
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .in("id", [fx.orgId, fx.otherOrgId]);
    if (left.error || left.count !== 0)
      throw new Error("Synthetic organization residue after teardown");
  }

  try {
    // ── Modules + attendance source ──────────────────────────────────────────────────────
    const enabled = {
      A: new Set([
        "attendance",
        "payroll",
        "tips",
        "bar_inventory",
        "tasks",
        "table_allocation",
      ]),
      B: new Set(["attendance", "payroll", "bar_inventory", "tasks"]),
    };
    ok(
      await admin.from("location_module_configs").insert(
        (["A", "B"] as const).flatMap((branch) =>
          CONFIGURABLE_MODULE_KEYS.map((module_key) => ({
            location_id: branch === "A" ? fx.locA : fx.locB,
            module_key,
            is_enabled: enabled[branch].has(module_key),
          })),
        ),
      ),
      "module configs",
    );
    ok(
      await admin
        .from("locations")
        .update({ attendance_mode: "internal_the_lineup" })
        .eq("id", fx.locA),
      "attendance mode A",
    );
    ok(
      await admin
        .from("locations")
        .update({ attendance_mode: "external" })
        .eq("id", fx.locB),
      "attendance mode B",
    );

    // ── Attendance (A): server1 active, server2 on a break, server3 completed; the owner is
    //    open at B (a different branch: must never count at A). ──────────────────────────
    const now = new Date();
    const hoursAgo = (h: number) =>
      new Date(now.getTime() - h * 3_600_000).toISOString();
    ok(
      await admin.from("attendance_sessions").insert([
        {
          organization_id: fx.orgId,
          location_id: fx.locA,
          profile_id: fx.server1.id,
          service_date: date,
          status: "active",
          clock_in_at: hoursAgo(2),
          created_by: fx.manager.id,
        },
        {
          organization_id: fx.orgId,
          location_id: fx.locA,
          profile_id: fx.server2.id,
          service_date: date,
          status: "on_break",
          clock_in_at: hoursAgo(3),
          created_by: fx.manager.id,
        },
        {
          organization_id: fx.orgId,
          location_id: fx.locA,
          profile_id: fx.server3.id,
          service_date: date,
          status: "completed",
          clock_in_at: hoursAgo(9),
          clock_out_at: hoursAgo(5),
          gross_elapsed_seconds: 4 * 3600,
          created_by: fx.manager.id,
        },
        {
          organization_id: fx.orgId,
          location_id: fx.locB,
          profile_id: fx.owner.id,
          service_date: date,
          status: "active",
          clock_in_at: hoursAgo(1),
          created_by: fx.manager.id,
        },
      ]),
      "attendance sessions",
    );

    // ── Payroll (B, external source). Truth: 2 drafts this month at B, outstanding 170000 across 3 periods. ───
    const month = PHASE_C_CHICAGO_MONTH();
    const prior = PREVIOUS_MONTH();
    const periodRow = (
      neon: number,
      period_month: string,
      gross: number,
      status: "draft" | "locked",
      location_id: string | null,
    ) => ({
      organization_id: fx.orgId,
      location_id,
      neon_user_id: neon,
      period_month,
      hours_snapshot: 10,
      rate_cents_snapshot: Math.round(gross / 10),
      gross_cents: gross,
      status,
      generated_by: fx.manager.id,
      ...(status === "locked"
        ? { locked_at: new Date().toISOString(), locked_by: fx.manager.id }
        : {}),
    });
    const periods = ok(
      await admin
        .from("payroll_periods")
        .insert([
          periodRow(9101, month, 100_000, "draft", fx.locB), // balance 100000 (a draft payment never reduces it)
          periodRow(9102, month, 50_000, "draft", fx.locB), // 50000
          periodRow(9103, prior, 20_000, "locked", fx.locB), // prior month: counts in the balance, not the drafts
          periodRow(9104, month, 77_777, "draft", null), // legacy, no branch: excluded
          periodRow(9105, month, 31_000, "draft", fx.locA), // A is internal: not B's
        ])
        .select("id, neon_user_id"),
      "payroll periods",
    ) as { id: number; neon_user_id: number }[];
    const periodId = (neon: number) =>
      periods.find((p) => p.neon_user_id === neon)!.id;
    // Confirmed payments are permanent by design (even an organization delete cannot remove
    // them), so a disposable fixture records only a DRAFT payment: it must never reduce a
    // balance. Confirmed-payment netting and an overpaid period never offsetting another are
    // proven by the unit suites (payroll-balances, dashboard-readers) and are NOT TESTED on DEV.
    ok(
      await admin.from("payroll_payments").insert({
        organization_id: fx.orgId,
        payroll_period_id: periodId(9101),
        amount_cents: 9_999,
        payment_date: date,
        status: "draft",
        created_by: fx.manager.id,
      }),
      "payroll payment",
    );

    // ── Bar inventory: A -> critical 1, low 1; B -> critical 1. Archived + other-branch
    //    rows must not leak. ───────────────────────────────────────────────────────────────
    const invBase = { p_organization_id: fx.orgId, p_location_id: fx.locA };
    const vendor = ok(
      await fx.manager.client.rpc("inventory_vendor_create", {
        ...invBase,
        p_name: "PhaseC vendor",
        p_notes: null,
      }),
      "vendor",
    ) as string;
    const category = ok(
      await fx.manager.client.rpc("inventory_category_create", {
        ...invBase,
        p_name: "PhaseC Beer",
      }),
      "category",
    ) as string;
    const product = async (name: string) =>
      ok(
        await fx.manager.client.rpc("inventory_product_create", {
          ...invBase,
          p_vendor_id: vendor,
          p_name: name,
          p_category_id: category,
          p_subcategory_id: null,
          p_size: "12 oz",
          p_unit_type: "bottle",
          p_unit_label: null,
          p_sku: null,
          p_notes: null,
        }),
        `product ${name}`,
      ) as string;
    const [pCritical, pLow, pOk, pArchived] = await Promise.all([
      product("PhaseC critical"),
      product("PhaseC low"),
      product("PhaseC fine"),
      product("PhaseC archived"),
    ]);
    const stock = (
      product_id: string,
      location_id: string,
      on_hand: number,
      backup: number,
    ) => ({
      product_id,
      location_id,
      organization_id: fx.orgId,
      on_hand,
      backup,
      cutoff: 5,
      warning: 10,
      par: 20,
    });
    ok(
      await admin.from("inventory_stock").upsert([
        stock(pCritical, fx.locA, 1, 1), // total 2 <= cutoff 5  -> critical
        stock(pLow, fx.locA, 4, 4), // total 8 <= warning 10 -> low
        stock(pOk, fx.locA, 30, 20), // fine
        stock(pArchived, fx.locA, 0, 0), // critical but archived -> excluded
        stock(pCritical, fx.locB, 30, 0),
        stock(pLow, fx.locB, 30, 0),
        stock(pOk, fx.locB, 0, 0), // critical at B only
        stock(pArchived, fx.locB, 0, 0),
      ]),
      "inventory stock",
    );
    ok(
      await admin
        .from("inventory_products")
        .update({ active: false, archived_at: new Date().toISOString() })
        .eq("id", pArchived),
      "archive product",
    );

    // ── Tips (A) are driven by the spec so each step is observable. ─────────────────────
    const hoursFrom = (h: number) =>
      new Date(
        new Date(`${date}T00:00:00Z`).getTime() + h * 3_600_000,
      ).toISOString();
    const tipsBase = {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
    };
    return {
      fx,
      admin,
      date,
      month,
      slug,
      inventory: { critical: 1, low: 1, bCritical: 1 },
      tipsBase,
      // 23:00Z..03:00Z the next day = 17:00..21:00 (CST) / 18:00..22:00 (CDT): the same local
      // service date in every season.
      // Three non-overlapping windows (23:00Z-01:00Z, 01:00Z-03:00Z, 03:00Z-04:30Z) = 17:00-22:30
      // CST / 18:00-23:30 CDT: the same local service date in every season.
      windows: [
        { start: hoursFrom(23), end: hoursFrom(25) },
        { start: hoursFrom(25), end: hoursFrom(27) },
        { start: hoursFrom(27), end: hoursFrom(28.5) },
      ],
      teardown,
    };
  } catch (error) {
    // Never let a teardown failure hide the original cause.
    await teardown().catch((cleanup) =>
      console.error("Phase C fixture cleanup failed", cleanup),
    );
    throw error;
  }
}

export type PhaseCFixture = Awaited<ReturnType<typeof createPhaseCFixture>>;
