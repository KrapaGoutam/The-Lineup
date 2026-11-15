import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPayrollFixture,
  must,
  type PayrollFixture,
} from "./support/payroll-fixture";

// Disposable loopback stack only (the shared fixture refuses hosted URLs).
// The ledger is intentionally permanent: reset the local DB after this suite.
const run = promisify(execFile);
const dockerArgs = [
  "exec",
  "supabase_db_restaurant-roster",
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-qAt",
  "-c",
];
function sql(query: string) {
  return execFileSync("docker", [...dockerArgs, query], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

describe("native Payroll: actual JWTs and overlapping confirmation", () => {
  let fx: PayrollFixture;
  const sessions = [randomUUID(), randomUUID(), randomUUID()];
  const months = ["2026-08-01", "2026-07-01", "2026-06-01"];
  const periods: number[] = [];

  beforeAll(async () => {
    fx = await createPayrollFixture();
    sql("update public.attendance_financial_activation set enabled=false");
    must(
      await fx.admin.from("payroll_settings").upsert({
        organization_id: fx.orgA.id,
        default_rate_cents: 2000,
        updated_by: fx.orgAGM.id,
      }),
    );
    must(
      await fx.admin.from("attendance_sessions").insert(
        months.map((month, index) => ({
          id: sessions[index],
          organization_id: fx.orgA.id,
          location_id: fx.locA,
          profile_id: fx.unlinkedStaff.id,
          service_date: `${month.slice(0, 7)}-10`,
          status: "completed" as const,
          clock_in_at: `${month.slice(0, 7)}-10T14:00:00Z`,
          clock_out_at: `${month.slice(0, 7)}-10T22:00:00Z`,
          gross_elapsed_seconds: 28800,
          total_break_seconds: 0,
          created_by: fx.unlinkedStaff.id,
        })),
      ),
    );
  });

  afterAll(async () => {
    sql("update public.attendance_financial_activation set enabled=false");
    // Shared payroll teardown deletes periods; these intentionally have permanent
    // consumption FKs. The consolidated verification resets this local stack.
  });

  it("refuses generation with activation OFF for a real organization manager", async () => {
    const result = await fx.orgAGM.client.rpc(
      "payroll_generate_native_period",
      {
        p_organization_id: fx.orgA.id,
        p_profile_id: fx.unlinkedStaff.id,
        p_period_month: months[0],
      },
    );
    expect(result.error?.message).toContain("NOT_ACTIVATED");
    expect(
      must(
        await fx.admin
          .from("payroll_attendance_consumptions")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      ),
    ).toHaveLength(0);
  });

  it("refuses forged native snapshots and direct ledger writes under authenticated JWTs", async () => {
    const fabricated = await fx.orgAGM.client.from("payroll_periods").insert({
      organization_id: fx.orgA.id,
      attendance_source: "internal_the_lineup",
      profile_id: fx.unlinkedStaff.id,
      period_month: months[0],
      hours_snapshot: 99,
      rate_cents_snapshot: 2000,
      gross_cents: 198000,
      generated_by: fx.orgAGM.id,
    });
    expect(fabricated.error?.code).toBe("42501");
    const ledger = await fx.orgAGM.client
      .from("payroll_attendance_consumptions")
      .delete()
      .eq("organization_id", fx.orgA.id);
    expect(ledger.error?.code).toBe("42501");
  });

  it("refuses anonymous, employee, assigned manager and foreign-organization generation", async () => {
    sql(
      "update public.attendance_financial_activation set enabled=true, evidence='local closeout regression only'",
    );
    for (const client of [
      fx.anonClient,
      fx.unlinkedStaff.client,
      fx.mgrA.client,
      fx.attackerB.client,
    ]) {
      const result = await client.rpc("payroll_generate_native_period", {
        p_organization_id: fx.orgA.id,
        p_profile_id: fx.unlinkedStaff.id,
        p_period_month: months[0],
      });
      expect(result.error?.code).toBe("42501");
    }
  });

  it("atomically generates native-only identity periods and retries without extra consumption", async () => {
    for (const month of months) {
      const result = must(
        await fx.orgAGM.client.rpc("payroll_generate_native_period", {
          p_organization_id: fx.orgA.id,
          p_profile_id: fx.unlinkedStaff.id,
          p_period_month: month,
        }),
      ) as {
        periodId: number;
        outcome: string;
        hours: number;
        grossCents: number;
      };
      expect(result).toMatchObject({
        outcome: "created",
        hours: 8,
        grossCents: 16000,
      });
      periods.push(result.periodId);
    }
    const retry = must(
      await fx.orgAGM.client.rpc("payroll_generate_native_period", {
        p_organization_id: fx.orgA.id,
        p_profile_id: fx.unlinkedStaff.id,
        p_period_month: months[0],
      }),
    );
    expect(retry).toMatchObject({ outcome: "unchanged", periodId: periods[0] });
    expect(
      must(
        await fx.admin
          .from("payroll_attendance_consumptions")
          .select("id")
          .eq("organization_id", fx.orgA.id),
      ),
    ).toHaveLength(3);
  });

  it("hides draft native periods from staff, foreign tenants and assigned location managers", async () => {
    for (const client of [
      fx.unlinkedStaff.client,
      fx.staffA.client,
      fx.attackerB.client,
      fx.mgrA.client,
    ]) {
      expect(
        must(
          await client.from("payroll_periods").select("id").in("id", periods),
        ),
      ).toHaveLength(0);
    }
    expect(
      must(
        await fx.overall.client
          .from("payroll_periods")
          .select("id")
          .in("id", periods),
      ),
    ).toHaveLength(3);
  });

  it("refuses confirmation while a correction holds the employee lock", async () => {
    const marker = `native-lock-${randomUUID()}`;
    const session = must(await fx.mgrA.client.auth.getSession()).session!;
    const claims = Buffer.from(session.access_token.split(".")[1], "base64url")
      .toString("utf8")
      .replaceAll("'", "''");
    const correction = run(
      "docker",
      [
        ...dockerArgs,
        `
      begin;
      set local application_name = '${marker}';
      set local role authenticated;
      set local request.jwt.claims = '${claims}';
      select public.attendance_correct_session('${sessions[0]}',1,'left one hour early',null,'2026-08-10T21:00:00Z');
      select pg_sleep(3);
      commit;
    `,
      ],
      { windowsHide: true },
    );
    // Wait for the correction to hold the employee lock, rather than depending on startup timing.
    try {
      await expect
        .poll(() =>
          sql(
            `select count(*) from pg_stat_activity where application_name='${marker}' and wait_event='PgSleep'`,
          ),
        )
        .toBe("1");
      const locked = await fx.orgAGM.client
        .from("payroll_periods")
        .update({
          status: "locked",
          locked_at: new Date().toISOString(),
          locked_by: fx.orgAGM.id,
        })
        .eq("id", periods[0]);
      expect(locked.error?.message).toContain("PERIOD_NOT_FINAL");
    } finally {
      await correction;
    }
  });

  it("lets staff read only their own locked native period and preserves that snapshot after correction", async () => {
    must(
      await fx.orgAGM.client
        .from("payroll_periods")
        .update({
          status: "locked",
          locked_at: new Date().toISOString(),
          locked_by: fx.orgAGM.id,
        })
        .eq("id", periods[1]),
    );
    expect(
      must(
        await fx.unlinkedStaff.client
          .from("payroll_periods")
          .select("id")
          .eq("id", periods[1]),
      ),
    ).toEqual([{ id: periods[1] }]);
    expect(
      must(
        await fx.staffA.client
          .from("payroll_periods")
          .select("id")
          .in("id", periods),
      ),
    ).toHaveLength(0);
    must(
      await fx.mgrA.client.rpc("attendance_correct_session", {
        p_session_id: sessions[1],
        p_expected_version: 1,
        p_reason: "correct the final hour",
        p_clock_out_at: "2026-07-10T21:00:00Z",
      }),
    );
    const generated = await fx.orgAGM.client.rpc(
      "payroll_generate_native_period",
      {
        p_organization_id: fx.orgA.id,
        p_profile_id: fx.unlinkedStaff.id,
        p_period_month: months[1],
      },
    );
    expect(generated.error?.message).toContain("PERIOD_FROZEN");
    expect(
      must(
        await fx.admin
          .from("payroll_periods")
          .select("hours_snapshot, gross_cents")
          .eq("id", periods[1])
          .single(),
      ),
    ).toEqual({ hours_snapshot: 8, gross_cents: 16000 });
  });

  it("cannot reopen a confirmed native period to regenerate corrected pay through the legacy unlock path", async () => {
    const reopened = await fx.orgAGM.client
      .from("payroll_periods")
      .update({
        status: "draft",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", periods[1]);
    expect(reopened.error?.message).toContain("PERIOD_FROZEN");
  });

  it("raises one pending correction review without creating money and denies unauthorized review RPCs", async () => {
    for (const client of [
      fx.unlinkedStaff.client,
      fx.mgrA.client,
      fx.attackerB.client,
    ]) {
      const raised = await client.rpc("payroll_raise_consumption_reviews", {
        p_organization_id: fx.orgA.id,
      });
      expect(raised.error?.code).toBe("42501");
    }
    expect(
      must(
        await fx.orgAGM.client.rpc("payroll_raise_consumption_reviews", {
          p_organization_id: fx.orgA.id,
        }),
      ),
    ).toBe(1);
    expect(
      must(
        await fx.orgAGM.client.rpc("payroll_raise_consumption_reviews", {
          p_organization_id: fx.orgA.id,
        }),
      ),
    ).toBe(0);
    for (const table of ["payroll_payments", "payroll_adjustments"] as const) {
      expect(
        must(
          await fx.admin
            .from(table)
            .select("id")
            .eq("organization_id", fx.orgA.id),
        ),
      ).toHaveLength(0);
    }
  });

  it("rejects cross-key duplicate pay in both identity directions with real manager JWTs", async () => {
    const people = [fx.staffA, fx.staffB];
    for (const [index, person] of people.entries()) {
      must(
        await fx.admin.from("attendance_sessions").insert({
          organization_id: fx.orgA.id,
          location_id: fx.locA,
          profile_id: person.id,
          service_date: "2026-05-10",
          status: "completed",
          clock_in_at: "2026-05-10T14:00:00Z",
          clock_out_at: "2026-05-10T22:00:00Z",
          gross_elapsed_seconds: 28800,
          total_break_seconds: 0,
          created_by: person.id,
        }),
      );
      const legacy = {
        organization_id: fx.orgA.id,
        neon_user_id: index === 0 ? fx.neonIds.staffA : fx.neonIds.staffB,
        period_month: "2026-05-01",
        hours_snapshot: 8,
        rate_cents_snapshot: 2000,
        gross_cents: 16000,
        generated_by: fx.orgAGM.id,
      };
      const native = {
        p_organization_id: fx.orgA.id,
        p_profile_id: person.id,
        p_period_month: "2026-05-01",
      };
      if (index === 0) {
        // Historical Neon period predates activation; it must block native pay.
        sql("update public.attendance_financial_activation set enabled=false");
        must(await fx.orgAGM.client.from("payroll_periods").insert(legacy));
        sql(
          "update public.attendance_financial_activation set enabled=true, evidence='local closeout regression only'",
        );
        expect(
          (await fx.orgAGM.client.rpc("payroll_generate_native_period", native))
            .error?.message,
        ).toContain("DUAL_IDENTITY_DUPLICATE");
      } else {
        must(
          await fx.orgAGM.client.rpc("payroll_generate_native_period", native),
        );
        expect(
          (await fx.orgAGM.client.from("payroll_periods").insert(legacy)).error
            ?.message,
        ).toContain("DUAL_IDENTITY_DUPLICATE");
      }
      expect(
        (
          await fx.orgAGM.client
            .from("attendance_identity_links")
            .delete()
            .eq("organization_id", fx.orgA.id)
            .eq("profile_id", person.id)
        ).error?.message,
      ).toContain("IDENTITY_LINK_IN_USE");
    }
  });

  it("preserves the existing Neon unlock workflow", async () => {
    const id = must(
      await fx.orgAGM.client
        .from("payroll_periods")
        .insert({
          organization_id: fx.orgA.id,
          neon_user_id: fx.neonIds.multiStaff,
          period_month: "2026-04-01",
          hours_snapshot: 8,
          rate_cents_snapshot: 2000,
          gross_cents: 16000,
          generated_by: fx.orgAGM.id,
          status: "locked",
          locked_by: fx.orgAGM.id,
          locked_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    ).id;
    must(
      await fx.orgAGM.client
        .from("payroll_periods")
        .update({
          status: "draft",
          locked_at: null,
          locked_by: null,
        })
        .eq("id", id),
    );
    expect(
      must(
        await fx.orgAGM.client
          .from("payroll_periods")
          .select("status")
          .eq("id", id)
          .single(),
      ).status,
    ).toBe("draft");
  });

  it("refuses foreign source-readiness access and judges the boundary in the location timezone", async () => {
    const request = {
      p_location_id: fx.locA,
      p_target_mode: "external" as const,
    };
    expect(
      (
        await fx.attackerB.client.rpc(
          "payroll_source_transition_readiness",
          request,
        )
      ).error?.code,
    ).toBe("42501");
    const ready = must(
      await fx.orgAGM.client.rpc(
        "payroll_source_transition_readiness",
        request,
      ),
    ) as { time_zone: string; location_local_date: string; blockers: string[] };
    expect(ready.time_zone).toBe("America/Chicago");
    const localDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: ready.time_zone,
      day: "2-digit",
    }).format(new Date());
    expect(ready.blockers.includes("not_period_boundary")).toBe(
      localDay !== "01",
    );
  });
});
