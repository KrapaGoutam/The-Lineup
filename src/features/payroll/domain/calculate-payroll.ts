/**
 * Feature 020 Phase 2. Payroll generation is NOT distributing a shared pool
 * across people the way tip splitting is -- each person's gross pay is
 * computed independently from their own hours and their own rate, so
 * `allocateTipInterval`'s remainder-distribution algorithm
 * (calculate-tip-splits.ts) doesn't apply here. What matters with the same
 * rigor is: integer cents everywhere, and exactly one rounding operation,
 * ever, per person-month -- computed once at generation time and stored as
 * the immutable integer it produces, never re-derived by re-multiplying
 * stored floats. See docs/features/020-payroll.md's "Rounding" section.
 */
export function computeGrossCents(
  hoursSnapshot: number,
  rateCentsSnapshot: number,
): number {
  return Math.round(hoursSnapshot * rateCentsSnapshot);
}

/**
 * A per-person `payroll_rates` override always wins over the organization's
 * `payroll_settings.default_rate_cents`; if neither exists, there is no
 * effective rate at all (generation must refuse, not silently assume $0).
 * Pure and separately testable from the two lookups that feed it.
 */
export function resolveEffectiveRateCents(input: {
  overrideRateCents: number | null;
  defaultRateCents: number | null;
}): number | null {
  return input.overrideRateCents ?? input.defaultRateCents ?? null;
}

/**
 * The first day of the calendar month containing `localDate` --
 * `payroll_periods.period_month` is always normalized to this, regardless
 * of which day within the month a manager happened to click "Generate."
 */
export function normalizePeriodMonth(localDate: string): string {
  const [year, month] = localDate.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Feature 020 Phase 4. The `period_month` value for the calendar month
 * immediately before the one containing `localDate` -- what the
 * dashboard's "previous month generated" tile filters periods against.
 * `Date.UTC`'s own month-rollover handles January correctly (month index
 * -1 normalizes to December of the prior year), the same trick
 * `resolvePeriodRange`'s "previous-month" branch already uses in the
 * attendance domain.
 */
export function previousPeriodMonth(localDate: string): string {
  const [year, month] = localDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * The full [start, end] calendar-day range for a `period_month` value --
 * what actually gets passed to Neon's attendance query. `Date.UTC`'s own
 * month-rollover handles December correctly (month index 12 normalizes to
 * January of the next year), matching resolvePeriodRange's existing
 * approach in the attendance domain.
 */
export function monthDateRange(periodMonth: string): {
  start: string;
  end: string;
} {
  const [year, month] = periodMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const toDateString = (date: Date) => date.toISOString().slice(0, 10);
  return { start: toDateString(start), end: toDateString(end) };
}

/**
 * Feature 020 Phase 3. `balance = gross − sum(CONFIRMED payments) −
 * sum(adjustments)`. A draft payment is recorded but does not move balance
 * until it's confirmed (per your explicit call on the Phase 1 draft-counts
 * question, reconsidered here now that adjustments exist as the formal
 * correction path); callers must sum only confirmed-status rows before
 * calling this -- it does not know about payment status itself, on
 * purpose, so it can't be handed an unfiltered sum by mistake without a
 * type-level nudge (the parameter name says exactly what it must already
 * be). Adjustment deltas are signed and summed as-is (a correction can
 * move balance either direction). Every input and the result are integer
 * cents -- summing integers never introduces drift, so this needs no
 * rounding of its own; the only rounding in the whole payroll pipeline is
 * `computeGrossCents`'s single `Math.round`, upstream of this.
 *
 * Deliberately takes plain numbers, not a period id or a database
 * connection -- this function never queries anything itself, so what
 * "counts" toward the two sums (confirmed-only payments; every
 * adjustment, keyed to the period regardless of either row's own date
 * column) is decided once, in the query layer that calls it
 * (`getPayrollBalance` in payroll-data.ts), not duplicated here.
 */
export function computeBalanceCents(input: {
  grossCents: number;
  confirmedPaymentsCents: number;
  adjustmentsCents: number;
}): number {
  return (
    input.grossCents - input.confirmedPaymentsCents - input.adjustmentsCents
  );
}

export function isFullyPaid(balanceCents: number): boolean {
  return balanceCents <= 0;
}

export type PayrollLedgerLine = {
  date: string;
  description: string;
  /** Signed effect on the running balance this line produces: positive
   * increases what's owed, negative reduces it. */
  amountCents: number;
  /** The balance immediately after this line is applied. */
  runningBalanceCents: number;
};

/**
 * Feature 020 Phase 5. The one place a printable/exportable statement's
 * line items and running balance are built -- shared by both the print
 * view and the CSV export, so the two formats can never show different
 * numbers for the same period. Confirmed payments and adjustments only
 * (never drafts -- a statement is a finalized document, matching the
 * same confirmed-only rule the balance itself already follows), merged
 * into one chronological ledger:
 *
 * - "Payroll generated" is always the first line, for `grossCents` --
 *   the frozen snapshot itself, never recomputed here.
 * - Every confirmed payment is a line reducing the balance by its
 *   `amountCents`.
 * - Every adjustment is a line changing the balance by the OPPOSITE of
 *   its own signed `deltaCents` -- consistent with `computeBalanceCents`
 *   (`balance = gross - payments - adjustments`), so a negative
 *   adjustment (the spec's own "$400 should have been $40" example)
 *   correctly shows as a line that INCREASES the running balance.
 *
 * Everything here is integer cents; the running total is a plain
 * running sum of already-integer amounts, so it carries no rounding
 * risk of its own -- the only rounding in the whole payroll pipeline
 * remains `computeGrossCents`'s single `Math.round`, upstream of this.
 */
export function buildPayrollLedgerLines(input: {
  grossCents: number;
  periodMonth: string;
  confirmedPayments: Array<{
    paymentDate: string;
    amountCents: number;
    comment: string | null;
  }>;
  adjustments: Array<{ createdAt: string; deltaCents: number; reason: string }>;
}): PayrollLedgerLine[] {
  const generatedLine = {
    date: input.periodMonth,
    description: "Payroll generated",
    effectCents: input.grossCents,
  };
  const otherLines = [
    ...input.confirmedPayments.map((payment) => ({
      date: payment.paymentDate,
      description: payment.comment ? `Payment — ${payment.comment}` : "Payment",
      effectCents: -payment.amountCents,
    })),
    ...input.adjustments.map((adjustment) => ({
      date: adjustment.createdAt.slice(0, 10),
      description: `Adjustment — ${adjustment.reason}`,
      effectCents: -adjustment.deltaCents,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let runningBalanceCents = 0;
  return [generatedLine, ...otherLines].map((line) => {
    runningBalanceCents += line.effectCents;
    return {
      date: line.date,
      description: line.description,
      amountCents: line.effectCents,
      runningBalanceCents,
    };
  });
}
