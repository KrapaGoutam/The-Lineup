import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPayrollBalancesForPeriods,
  summarizePeriodLedger,
} from "./payroll-data";
import { derivePayrollAuthority } from "./payroll-actor";

type Row = Record<string, unknown>;

/** A tiny PostgREST stand-in: `.from(t).select().in(col, ids).limit(n)` over fixed rows. */
function client(tables: { payments: Row[]; adjustments: Row[] }, fail = false) {
  const calls: Array<{ table: string; ids: number[]; limit: number }> = [];
  return {
    calls,
    from(table: string) {
      const rows =
        table === "payroll_payments" ? tables.payments : tables.adjustments;
      return {
        select: () => ({
          in: (_col: string, ids: number[]) => ({
            limit: async (limit: number) => {
              calls.push({ table, ids, limit });
              if (fail) return { data: null, error: { code: "XX000" } };
              return {
                data: rows
                  .filter((row) =>
                    ids.includes(row.payroll_period_id as number),
                  )
                  .slice(0, limit),
                error: null,
              };
            },
          }),
        }),
      };
    },
  };
}

const supabase = (c: ReturnType<typeof client>) =>
  c as unknown as Parameters<typeof getPayrollBalancesForPeriods>[0];

describe("summarizePeriodLedger", () => {
  it("only confirmed payments reduce the balance; drafts never do; adjustments apply", () => {
    const result = summarizePeriodLedger({
      grossCents: 100_000,
      payments: [
        { status: "confirmed", amountCents: 30_000 },
        { status: "draft", amountCents: 50_000 },
      ],
      adjustments: [{ deltaCents: 5_000 }, { deltaCents: -1_000 }],
    });
    expect(result).toEqual({
      grossCents: 100_000,
      confirmedPaymentsCents: 30_000,
      draftPaymentsCents: 50_000,
      adjustmentsCents: 4_000,
      // gross - confirmed - adjustments (the canonical rule)
      balanceCents: 66_000,
      fullyPaid: false,
    });
  });

  it("an overpaid period has a negative balance and is fully paid", () => {
    const result = summarizePeriodLedger({
      grossCents: 10_000,
      payments: [{ status: "confirmed", amountCents: 12_000 }],
      adjustments: [],
    });
    expect(result.balanceCents).toBe(-2_000);
    expect(result.fullyPaid).toBe(true);
  });
});

describe("getPayrollBalancesForPeriods", () => {
  it("attributes ledger rows to the right period and matches the single-period rule", async () => {
    const c = client({
      payments: [
        { payroll_period_id: 1, amount_cents: 4_000, status: "confirmed" },
        { payroll_period_id: 1, amount_cents: 9_000, status: "draft" },
        { payroll_period_id: 2, amount_cents: 20_000, status: "confirmed" },
      ],
      adjustments: [{ payroll_period_id: 2, delta_cents: 500 }],
    });
    const result = await getPayrollBalancesForPeriods(supabase(c), {
      periods: [
        { id: 1, grossCents: 10_000 },
        { id: 2, grossCents: 20_000 },
        { id: 3, grossCents: 7_000 }, // no ledger rows at all
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.get(1)?.balanceCents).toBe(6_000);
    expect(result.data.get(2)?.balanceCents).toBe(-500);
    expect(result.data.get(3)?.balanceCents).toBe(7_000);
  });

  it("uses a bounded number of reads: two per chunk of 50 periods, not two per period", async () => {
    const c = client({ payments: [], adjustments: [] });
    const periods = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      grossCents: 1_000,
    }));
    const result = await getPayrollBalancesForPeriods(supabase(c), { periods });
    expect(result.ok).toBe(true);
    expect(c.calls).toHaveLength(6); // 3 chunks x (payments + adjustments)
    expect(Math.max(...c.calls.map((call) => call.ids.length))).toBe(50);
  });

  it("an empty period list reads nothing", async () => {
    const c = client({ payments: [], adjustments: [] });
    const result = await getPayrollBalancesForPeriods(supabase(c), {
      periods: [],
    });
    expect(result).toEqual({ ok: true, data: new Map() });
    expect(c.calls).toHaveLength(0);
  });

  it("fails closed on a read error instead of returning a smaller balance", async () => {
    const c = client({ payments: [], adjustments: [] }, true);
    const result = await getPayrollBalancesForPeriods(supabase(c), {
      periods: [{ id: 1, grossCents: 100 }],
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed when a read comes back at the row cap (it may have been truncated)", async () => {
    const payments = Array.from({ length: 1000 }, (_, i) => ({
      payroll_period_id: 1,
      amount_cents: 1,
      status: "confirmed",
      i,
    }));
    const c = client({ payments, adjustments: [] });
    const result = await getPayrollBalancesForPeriods(supabase(c), {
      periods: [{ id: 1, grossCents: 5_000 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("derivePayrollAuthority (shared by the Payroll actor and the Dashboard)", () => {
  it("is exactly the rule the Payroll actor has always used", () => {
    expect(
      derivePayrollAuthority({ capabilities: [], effectiveLevel: "staff" }),
    ).toEqual({
      isOrgManager: false,
      isLocationManager: false,
      canManage: false,
    });
    expect(
      derivePayrollAuthority({
        capabilities: ["location:manage"],
        effectiveLevel: "manager",
      }),
    ).toEqual({
      isOrgManager: false,
      isLocationManager: true,
      canManage: true,
    });
    expect(
      derivePayrollAuthority({
        capabilities: ["org:admin"],
        effectiveLevel: "owner",
      }),
    ).toEqual({ isOrgManager: true, isLocationManager: true, canManage: true });
    // Operate-only staff cannot manage payroll.
    expect(
      derivePayrollAuthority({
        capabilities: ["location:operate", "location:access"],
        effectiveLevel: "staff",
      }).canManage,
    ).toBe(false);
  });
});
