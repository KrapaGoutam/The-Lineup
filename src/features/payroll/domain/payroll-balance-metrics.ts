/**
 * Feature 026. Pure aggregation over already-fetched periods (each
 * carrying its own `balanceCents`, computed once by
 * `getPayrollBalance` in payroll-data.ts and never re-derived here) --
 * the dashboard's 4 KPI cards, the grouped-by-person periods view, and
 * a period's displayed status all trace back to exactly two sources:
 * `period.grossCents` (the frozen snapshot) or a `getPayrollBalance`
 * result. Nothing in this file queries anything itself.
 */

export type PayrollPeriodWithBalance = {
  id: number;
  neonUserId: number;
  periodMonth: string;
  hoursSnapshot: number;
  rateCentsSnapshot: number;
  grossCents: number;
  status: "draft" | "locked";
  balanceCents: number;
};

/**
 * Sum, across every period, of that period's balance clamped to zero
 * before summing -- an overpaid period for one person never offsets
 * what's still owed elsewhere. Matches
 * `getPayrollDashboardAction`'s pre-existing `totalBalanceOwedCents`
 * computation exactly (this spec's "Overall balance owed" card) --
 * extracted here as a named, tested function rather than left inline.
 */
export function computeOverallBalanceOwedCents(
  periods: Array<{ balanceCents: number }>,
): number {
  return periods.reduce(
    (sum, period) => sum + Math.max(0, period.balanceCents),
    0,
  );
}

/**
 * "Owed this/last month" -- NOT the same figure as "generated this/last
 * month" (the pre-existing `previousMonthGeneratedCents` tile, which
 * sums `grossCents` regardless of what's since been paid). This sums
 * the clamped OUTSTANDING balance for periods whose `periodMonth`
 * matches exactly, so a fully-paid period from that month contributes
 * zero, not its original gross amount.
 */
export function computeOwedForMonth(
  periods: Array<{ periodMonth: string; balanceCents: number }>,
  periodMonth: string,
): number {
  return periods
    .filter((period) => period.periodMonth === periodMonth)
    .reduce((sum, period) => sum + Math.max(0, period.balanceCents), 0);
}

export type OldestOpenPeriod = {
  periodMonth: string;
  neonUserId: number;
  balanceCents: number;
};

/**
 * The chronologically earliest period (by `periodMonth`) with a
 * positive outstanding balance -- `null` when every period is fully
 * settled (or there are none). On a tie (more than one person's period
 * shares the earliest open month), the first one encountered in input
 * order wins -- deterministic given a deterministic input order
 * (`listPayrollPeriods`' own `period_month desc` -- reversed by the
 * caller before this runs, or sorted here explicitly; this function
 * does its own chronological scan regardless of input order, so
 * callers never need to pre-sort).
 */
export function findOldestOpenPeriod(
  periods: Array<{
    periodMonth: string;
    neonUserId: number;
    balanceCents: number;
  }>,
): OldestOpenPeriod | null {
  let oldest: OldestOpenPeriod | null = null;
  for (const period of periods) {
    if (period.balanceCents <= 0) continue;
    if (!oldest || period.periodMonth < oldest.periodMonth) {
      oldest = {
        periodMonth: period.periodMonth,
        neonUserId: period.neonUserId,
        balanceCents: period.balanceCents,
      };
    }
  }
  return oldest;
}

export type PeriodDisplayStatus = "draft" | "locked" | "part-paid" | "paid";

/**
 * "Paid" is never a stored `status` value (the column is DB-checked to
 * exactly `'draft'`/`'locked'`) -- it's a computed display state
 * layered on top of `'locked'` once the balance reaches zero (or
 * below, an overpayment). A partially paid period (`balanceCents < grossCents`)
 * is displayed as "Part-paid". A still-draft period is never displayed as
 * "Paid" or "Part-paid" even if its balance happens to already be zero --
 * it hasn't been locked in yet, so nothing about it is final.
 */
export function derivePeriodStatus(period: {
  status: "draft" | "locked";
  grossCents?: number;
  balanceCents: number;
}): PeriodDisplayStatus {
  if (period.status === "draft") return "draft";
  if (period.balanceCents <= 0) return "paid";
  if (
    period.grossCents !== undefined &&
    period.balanceCents > 0 &&
    period.balanceCents < period.grossCents
  ) {
    return "part-paid";
  }
  return "locked";
}

export type PersonPeriodGroup = {
  neonUserId: number;
  periods: PayrollPeriodWithBalance[];
  /** Sum of every period's balance for this person, NOT clamped per
   * period -- an overpaid period can offset an owed one for the SAME
   * person, the same "can this one person be net-overpaid" distinction
   * `PayrollDashboardPerson.balanceCents` already draws in
   * payroll-actions.ts. */
  totalBalanceCents: number;
  /** Count of this person's periods with a positive outstanding
   * balance -- what the person-summary row's "N open months" figure
   * is. */
  openPeriodCount: number;
};

/**
 * Groups periods by `neonUserId`, each group's own periods sorted
 * chronologically ascending (oldest first, matching how a person's own
 * ledger reads top-to-bottom) -- groups themselves ordered by
 * `neonUserId` ascending for a stable, deterministic render order
 * (the caller resolves ids to display names/labels; this function
 * knows nothing about names).
 */
export function groupPeriodsByPerson(
  periods: PayrollPeriodWithBalance[],
): PersonPeriodGroup[] {
  const byPerson = new Map<number, PayrollPeriodWithBalance[]>();
  for (const period of periods) {
    const existing = byPerson.get(period.neonUserId) ?? [];
    existing.push(period);
    byPerson.set(period.neonUserId, existing);
  }
  return [...byPerson.entries()]
    .sort(([a], [b]) => a - b)
    .map(([neonUserId, personPeriods]) => {
      const sorted = [...personPeriods].sort((a, b) =>
        a.periodMonth.localeCompare(b.periodMonth),
      );
      return {
        neonUserId,
        periods: sorted,
        totalBalanceCents: sorted.reduce((sum, p) => sum + p.balanceCents, 0),
        openPeriodCount: sorted.filter((p) => p.balanceCents > 0).length,
      };
    });
}
