"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import {
  lockPayrollPeriodAction,
  regeneratePayrollPeriodAction,
} from "@/features/payroll/actions/payroll-actions";
import { monthLabel } from "@/features/payroll/components/payroll-workspace";
import {
  derivePeriodStatus,
  groupPeriodsByPerson,
  type PayrollPeriodWithBalance,
  type PeriodDisplayStatus,
} from "@/features/payroll/domain/payroll-balance-metrics";
import { cn } from "@/lib/utils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

const PERSON_COLORS = [
  "#f2a65a",
  "#a7f3d0",
  "#7dd3fc",
  "#f472b6",
  "#c084fc",
  "#facc15",
  "#34d399",
  "#38bdf8",
];

export function getPersonColor(id: number): string {
  return PERSON_COLORS[Math.abs(id) % PERSON_COLORS.length];
}

export function getPersonInitials(name: string): string {
  const clean = name.replace(/\(.*\)/, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "EM";
}

function StatusBadge({ status }: { status: PeriodDisplayStatus }) {
  switch (status) {
    case "draft":
      return (
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-500">
          Draft
        </span>
      );
    case "part-paid":
      return (
        <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-blue-400">
          Part-paid
        </span>
      );
    case "paid":
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400">
          Paid ✓
        </span>
      );
    case "locked":
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-400">
          Locked
        </span>
      );
  }
}

/**
 * Option 1k Reference Left Column: Balances by person and month.
 * Renders an expanded sub-table per person with initials avatar,
 * role/rate meta, person balance, and open months breakdown with Ledger button.
 */
export function PayrollPeriodGroups({
  restaurantSlug,
  periods,
  users,
  onChanged,
  selectedPeriodId,
  onSelectPeriod,
  onPrintPerson,
}: {
  restaurantSlug: string;
  periods: PayrollPeriodWithBalance[];
  users: Array<{ id: number; fullName: string; role: string }>;
  onChanged: () => void;
  selectedPeriodId: number | null;
  onSelectPeriod: (periodId: number | null) => void;
  /** Feature 030 bug fix: opens the batch print dialog pre-selected to
   * this one person -- the row-level entry point, distinct from the
   * toolbar's own no-preselection one. */
  onPrintPerson?: (neonUserId: number) => void;
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
      <Card className="border-border bg-card">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">
            No payroll periods generated yet. Click &quot;Generate Payroll&quot;
            above to create one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card overflow-hidden shadow-sm">
      <CardHeader className="border-border flex flex-row flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">
            Balances by person and month
          </h2>
          <p className="text-muted-foreground text-xs">
            Month balances stay expanded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="payroll-period-month-filter" className="sr-only">
            Filter by month
          </label>
          <Select
            id="payroll-period-month-filter"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="w-36 text-xs sm:w-44 sm:text-sm"
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

      <div className="divide-border divide-y">
        {groups.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            No periods found for that month.
          </p>
        ) : (
          groups.map((group, index) => {
            const label =
              displayLabels.get(group.neonUserId) ??
              `Neon #${group.neonUserId}`;
            const userObj = users.find((u) => u.id === group.neonUserId);
            const roleName = userObj?.role
              ? userObj.role.charAt(0).toUpperCase() + userObj.role.slice(1)
              : "Staff";
            const latestRate =
              group.periods[group.periods.length - 1]?.rateCentsSnapshot ?? 0;
            const collapsed = collapsedPersonIds.has(group.neonUserId);
            const avatarBg = getPersonColor(group.neonUserId);
            const initials = getPersonInitials(label);

            return (
              <div key={group.neonUserId} className="group/person">
                {/* Person Header */}
                <div
                  className={cn(
                    "bg-secondary/30 hover:bg-secondary/50 flex items-center gap-3 p-4 transition-colors",
                    index > 0 && "border-border border-t",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(group.neonUserId)}
                    className="flex flex-1 items-center gap-3 text-left outline-none"
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}'s periods`}
                  >
                    <div
                      className="grid size-9 flex-none place-items-center rounded-full text-xs font-bold text-[#101012] shadow-sm"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {label}
                        </span>
                        {collapsed ? (
                          <ChevronRight className="text-muted-foreground size-3.5" />
                        ) : (
                          <ChevronDown className="text-muted-foreground size-3.5" />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {roleName} · {money(latestRate)}/hr ·{" "}
                        {group.openPeriodCount} open{" "}
                        {group.openPeriodCount === 1 ? "month" : "months"}
                      </p>
                    </div>
                  </button>

                  <div className="text-right">
                    <p className="text-primary font-mono text-sm font-bold sm:text-base">
                      {money(group.totalBalanceCents)}
                    </p>
                    <p className="text-muted-foreground text-[10.5px]">
                      person balance
                    </p>
                  </div>
                  {onPrintPerson ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onPrintPerson(group.neonUserId)}
                      aria-label={`Print ${label}'s payroll statement`}
                    >
                      <Printer className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>

                {/* Sub-Table of open months */}
                {!collapsed ? (
                  <div className="border-border bg-background/50 border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead>
                          <tr className="border-border text-muted-foreground bg-secondary/20 border-b text-[10px] font-bold tracking-[0.08em] uppercase">
                            <th className="py-2.5 pr-3 pl-6">Month</th>
                            <th className="py-2.5 pr-3">Hours</th>
                            <th className="py-2.5 pr-3">Gross</th>
                            <th className="py-2.5 pr-3">Paid</th>
                            <th className="py-2.5 pr-3">Month balance</th>
                            <th className="py-2.5 pr-4 text-right">Actions</th>
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
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
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
  const paidCents = Math.max(0, period.grossCents - period.balanceCents);

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
    <tr
      className={cn(
        "hover:bg-secondary/20 transition-colors",
        isSelected && "bg-primary/5",
      )}
    >
      <td className="py-3 pr-3 pl-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold">
            {monthLabel(period.periodMonth)}
          </p>
          <StatusBadge status={displayStatus} />
        </div>
      </td>
      <td className="text-foreground py-3 pr-3 font-mono text-xs">
        {period.hoursSnapshot.toFixed(1)}h
      </td>
      <td className="text-foreground py-3 pr-3 font-mono text-xs font-medium">
        {money(period.grossCents)}
      </td>
      <td className="text-foreground py-3 pr-3 font-mono text-xs font-medium">
        {money(paidCents)}
      </td>
      <td className="text-primary py-3 pr-3 font-mono text-xs font-bold">
        {money(period.balanceCents)}
      </td>
      <td className="py-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {period.status === "draft" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={regenerate}
                disabled={pending !== null}
              >
                {pending === "regenerate" ? "Regen…" : "Regenerate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={lock}
                disabled={pending !== null}
              >
                {pending === "lock" ? "Locking…" : "Lock"}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs font-semibold"
            onClick={onToggleSelect}
            aria-label={`${isSelected ? "Close" : "Open"} ledger for ${monthLabel(period.periodMonth)}`}
          >
            {isSelected ? "Close" : "Ledger"}
          </Button>
        </div>
        {error ? (
          <p className="text-destructive mt-1 text-[11px]" aria-live="polite">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
