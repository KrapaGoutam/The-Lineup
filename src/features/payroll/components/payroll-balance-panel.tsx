"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { getPersonColor } from "@/features/payroll/components/payroll-period-groups";
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

/**
 * Option 1k Reference Right Column: Balance per person.
 * Displays a clean summary card of open balances per person across open months,
 * with a bottom highlight bar for Overall Balance and a contextual note.
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
    <aside className="space-y-4">
      <Card className="border-border bg-card overflow-hidden shadow-sm">
        <CardHeader className="border-border flex flex-row flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">Balance per person</h2>
            <p className="text-muted-foreground text-xs">All open months</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="payroll-balance-month-filter" className="sr-only">
              Filter by month
            </label>
            <Select
              id="payroll-balance-month-filter"
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="w-36 text-xs sm:w-40 sm:text-sm"
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

        <CardContent className="divide-border divide-y p-0">
          {groups.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              No payroll periods found.
            </p>
          ) : (
            groups.map((group) => {
              const label =
                displayLabels.get(group.neonUserId) ??
                `Neon #${group.neonUserId}`;
              const openMonthNames = group.periods
                .filter((p) => p.balanceCents > 0)
                .map((p) => monthLabel(p.periodMonth).split(" ")[0]);
              const clear = group.totalBalanceCents <= 0;
              const dot = getPersonColor(group.neonUserId);

              return (
                <div
                  key={group.neonUserId}
                  className="hover:bg-secondary/20 p-4 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-2 flex-none rounded-full shadow-xs"
                      style={{ backgroundColor: dot }}
                      aria-hidden="true"
                    />
                    <b className="truncate text-sm font-semibold">{label}</b>
                    <strong className="text-primary ml-auto font-mono text-sm font-bold">
                      {money(group.totalBalanceCents)}
                    </strong>
                  </div>
                  <div className="mt-1 flex items-center justify-between pl-4.5">
                    <small className="text-muted-foreground text-xs">
                      {clear
                        ? "Fully settled"
                        : openMonthNames.length > 0
                          ? openMonthNames.join(" + ")
                          : "Settled"}
                    </small>
                    {clear ? (
                      <Badge tone="success" className="text-[10px]">
                        Clear
                      </Badge>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          <div className="border-primary/20 bg-primary/10 flex items-center justify-between border-t p-4 sm:p-5">
            <b className="text-sm font-semibold">Overall balance</b>
            <strong className="text-primary font-mono text-lg font-bold">
              {money(overallTotal)}
            </strong>
          </div>
        </CardContent>
      </Card>

      <div className="border-primary/20 bg-primary/5 text-muted-foreground rounded-xl border p-3.5 text-xs leading-relaxed">
        <b className="text-foreground">Month visibility:</b> Person and month
        balances stay visible at a glance across all open periods without
        drilling into an individual ledger.
      </div>
    </aside>
  );
}
