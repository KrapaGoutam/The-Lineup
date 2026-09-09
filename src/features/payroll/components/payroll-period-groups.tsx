"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  lockPayrollPeriodAction,
  regeneratePayrollPeriodAction,
} from "@/features/payroll/actions/payroll-actions";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { monthLabel } from "@/features/payroll/components/payroll-workspace";
import {
  derivePeriodStatus,
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

const statusBadgeTone: Record<
  ReturnType<typeof derivePeriodStatus>,
  "neutral" | "accent" | "success"
> = {
  draft: "accent",
  locked: "neutral",
  paid: "success",
};

const statusLabel: Record<ReturnType<typeof derivePeriodStatus>, string> = {
  draft: "Draft",
  locked: "Locked",
  paid: "Paid",
};

/**
 * Feature 026. Periods grouped by person (spec Section 2g "Grouped
 * Periods Ledger"), each sub-row's status now a computed
 * `derivePeriodStatus` (adding "Paid" on top of the raw `draft`/
 * `locked` column) rather than the two-state badge the old flat
 * `PeriodsTable` showed. Reuses the exact same
 * `regeneratePayrollPeriodAction`/`lockPayrollPeriodAction` Server
 * Actions that component did -- no new write path.
 */
export function PayrollPeriodGroups({
  restaurantSlug,
  periods,
  users,
  onChanged,
  selectedPeriodId,
  onSelectPeriod,
}: {
  restaurantSlug: string;
  periods: PayrollPeriodWithBalance[];
  users: Array<{ id: number; fullName: string; role: string }>;
  onChanged: () => void;
  selectedPeriodId: number | null;
  onSelectPeriod: (periodId: number | null) => void;
}) {
  const displayLabels = buildDisplayLabels(users);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [collapsedPersonIds, setCollapsedPersonIds] = useState<Set<number>>(
    new Set(),
  );

  const availableMonths = [...new Set(periods.map((p) => p.periodMonth))].sort(
    (a, b) => b.localeCompare(a),
  );
  const filtered =
    monthFilter === "all"
      ? periods
      : periods.filter((p) => p.periodMonth === monthFilter);
  const groups = groupPeriodsByPerson(filtered);

  function toggleCollapsed(neonUserId: number) {
    setCollapsedPersonIds((current) => {
      const next = new Set(current);
      if (next.has(neonUserId)) next.delete(neonUserId);
      else next.add(neonUserId);
      return next;
    });
  }

  if (periods.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No payroll periods generated yet.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Generated periods</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="payroll-period-month-filter" className="sr-only">
            Filter by month
          </label>
          <Select
            id="payroll-period-month-filter"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="w-40"
          >
            <option value="all">All months</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent className="divide-border divide-y pt-0">
        {groups.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No periods for that month.
          </p>
        ) : (
          groups.map((group) => {
            const label =
              displayLabels.get(group.neonUserId) ??
              `Neon #${group.neonUserId}`;
            const latestRate =
              group.periods[group.periods.length - 1]?.rateCentsSnapshot ?? 0;
            const collapsed = collapsedPersonIds.has(group.neonUserId);
            return (
              <div key={group.neonUserId} className="py-3 first:pt-0">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.neonUserId)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={!collapsed}
                  aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}'s periods`}
                >
                  <span className="flex items-center gap-2">
                    {collapsed ? (
                      <ChevronRight
                        className="text-muted-foreground size-4"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="text-muted-foreground size-4"
                        aria-hidden="true"
                      />
                    )}
                    <span className="font-semibold">{label}</span>
                    <span className="text-muted-foreground text-xs">
                      {money(latestRate)}/hr · {group.openPeriodCount} open
                      month{group.openPeriodCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {money(group.totalBalanceCents)}
                  </span>
                </button>
                {!collapsed ? (
                  <div className="mt-2 overflow-x-auto pl-6">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                          <th className="py-1.5 pr-3 font-medium">Month</th>
                          <th className="py-1.5 pr-3 font-medium">Hours</th>
                          <th className="py-1.5 pr-3 font-medium">Rate</th>
                          <th className="py-1.5 pr-3 font-medium">Gross</th>
                          <th className="py-1.5 pr-3 font-medium">Balance</th>
                          <th className="py-1.5 pr-3 font-medium">Status</th>
                          <th className="py-1.5 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {group.periods.map((period) => (
                          <PeriodGroupRow
                            key={period.id}
                            restaurantSlug={restaurantSlug}
                            period={period}
                            onChanged={onChanged}
                            isSelected={selectedPeriodId === period.id}
                            onToggleSelect={() =>
                              onSelectPeriod(
                                selectedPeriodId === period.id
                                  ? null
                                  : period.id,
                              )
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PeriodGroupRow({
  restaurantSlug,
  period,
  onChanged,
  isSelected,
  onToggleSelect,
}: {
  restaurantSlug: string;
  period: PayrollPeriodWithBalance;
  onChanged: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"regenerate" | "lock" | null>(null);
  const displayStatus = derivePeriodStatus(period);

  async function regenerate() {
    setError("");
    setPending("regenerate");
    try {
      const result = await regeneratePayrollPeriodAction({
        restaurantSlug,
        periodId: period.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    } finally {
      setPending(null);
    }
  }

  async function lock() {
    setError("");
    setPending("lock");
    try {
      const result = await lockPayrollPeriodAction({
        restaurantSlug,
        periodId: period.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    } finally {
      setPending(null);
    }
  }

  return (
    <tr>
      <td className="py-1.5 pr-3">{monthLabel(period.periodMonth)}</td>
      <td className="py-1.5 pr-3">{period.hoursSnapshot.toFixed(1)}h</td>
      <td className="py-1.5 pr-3">{money(period.rateCentsSnapshot)}/hr</td>
      <td className="py-1.5 pr-3 font-mono">{money(period.grossCents)}</td>
      <td className="py-1.5 pr-3 font-mono">{money(period.balanceCents)}</td>
      <td className="py-1.5 pr-3">
        <Badge tone={statusBadgeTone[displayStatus]}>
          {statusLabel[displayStatus]}
          {displayStatus === "paid" ? " ✓" : ""}
        </Badge>
      </td>
      <td className="py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={isSelected ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleSelect}
            aria-label={`${isSelected ? "Hide" : "View"} payments for ${monthLabel(period.periodMonth)}`}
          >
            {isSelected ? "Hide payments" : "View payments"}
          </Button>
          {period.status !== "locked" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={regenerate}
                disabled={pending !== null}
              >
                {pending === "regenerate" ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={lock}
                disabled={pending !== null}
              >
                {pending === "lock" ? "Locking…" : "Lock"}
              </Button>
            </>
          ) : null}
        </div>
        {error ? (
          <p className="text-destructive mt-1 text-xs" aria-live="polite">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
