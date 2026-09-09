"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { monthLabel } from "@/features/payroll/components/payroll-workspace";
import {
  computeOverallBalanceOwedCents,
  groupPeriodsByPerson,
  type PayrollPeriodWithBalance,
} from "@/features/payroll/domain/payroll-balance-metrics";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

// A small, deterministic color per person -- there's no existing color
// source for a Neon user the way `TeamMember.color` exists for the
// Supabase-side roster, so one is derived here from the id itself
// (stable across renders/reloads, never random).
function dotColor(neonUserId: number): string {
  const hue = (neonUserId * 47) % 360;
  return `hsl(${hue} 65% 55%)`;
}

/**
 * Feature 026. "Balance per person" panel (spec Section 2g) -- defaults
 * to every open balance across all months; a filter narrows to one
 * specific month. Reuses the exact same `periods` the KPI cards and
 * grouped view already have (no separate fetch), re-grouping the
 * filtered set client-side via `groupPeriodsByPerson`.
 */
export function PayrollBalancePanel({
  periods,
  users,
}: {
  periods: PayrollPeriodWithBalance[];
  users: Array<{ id: number; fullName: string; role: string }>;
}) {
  const displayLabels = buildDisplayLabels(users);
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const availableMonths = [...new Set(periods.map((p) => p.periodMonth))].sort(
    (a, b) => b.localeCompare(a),
  );
  const filtered =
    monthFilter === "all"
      ? periods
      : periods.filter((p) => p.periodMonth === monthFilter);
  const groups = groupPeriodsByPerson(filtered);
  const overallTotal = computeOverallBalanceOwedCents(filtered);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Balance per person</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="payroll-balance-month-filter" className="sr-only">
            Filter by month
          </label>
          <Select
            id="payroll-balance-month-filter"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="w-40"
          >
            <option value="all">All open months</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No payroll periods for that month.
          </p>
        ) : (
          groups.map((group) => {
            const label =
              displayLabels.get(group.neonUserId) ??
              `Neon #${group.neonUserId}`;
            const openMonths = group.periods
              .filter((p) => p.balanceCents > 0)
              .map((p) => monthLabel(p.periodMonth));
            const clear = group.totalBalanceCents <= 0;
            return (
              <div
                key={group.neonUserId}
                className="border-border bg-background/60 flex items-center gap-3 rounded-xl border px-3 py-2.5"
              >
                <span
                  className="size-3 flex-none rounded-full"
                  style={{ backgroundColor: dotColor(group.neonUserId) }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {clear ? "Fully settled" : `Open: ${openMonths.join(", ")}`}
                  </p>
                </div>
                <p className="font-mono font-semibold whitespace-nowrap">
                  {money(group.totalBalanceCents)}
                </p>
                {clear ? <Badge tone="success">Clear</Badge> : null}
              </div>
            );
          })
        )}
        <div className="border-primary/20 bg-primary/10 mt-3 flex items-center justify-between rounded-xl border px-3 py-4">
          <p className="font-semibold">Overall balance owed</p>
          <p className="text-primary font-mono text-lg font-bold">
            {money(overallTotal)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
