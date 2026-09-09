"use client";

import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import type { PayrollDashboard } from "@/features/payroll/actions/payroll-actions";
import { monthLabel } from "@/features/payroll/components/payroll-workspace";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          {label}
        </p>
        <p className="font-mono text-2xl font-bold">{value}</p>
        {hint ? (
          <p className="text-muted-foreground truncate text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Feature 026. The dashboard's 4 executive KPI cards (spec Section 2g) --
 * a pure render of `PayrollDashboard`'s already-computed fields, no
 * fetch or write of its own. "Owed this/last month" is deliberately a
 * different figure from `previousMonthGeneratedCents` (outstanding
 * balance, not gross generated) -- see `computeOwedForMonth`'s own doc
 * comment in `payroll-balance-metrics.ts`.
 *
 * The "Pay rates" button doesn't duplicate `RateSettings` (still
 * rendered inline on this same tab, unchanged) -- it's the literal
 * "routes seamlessly into Settings > Pay Rates" entry point the spec's
 * own UX Contract asks for at the top of the dashboard.
 */
export function PayrollKpiCards({
  dashboard,
  users,
  onGoToPayRates,
}: {
  dashboard: PayrollDashboard;
  users: Array<{ id: number; fullName: string; role: string }>;
  onGoToPayRates: () => void;
}) {
  const displayLabels = buildDisplayLabels(users);
  const oldest = dashboard.oldestOpenPeriod;
  const oldestValue = oldest ? monthLabel(oldest.periodMonth) : "—";
  const oldestHint = oldest
    ? `${displayLabels.get(oldest.neonUserId) ?? `Neon #${oldest.neonUserId}`} — ${money(oldest.balanceCents)}`
    : "All periods settled";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Overview</h2>
        <Button variant="secondary" size="sm" onClick={onGoToPayRates}>
          <Settings2 aria-hidden="true" /> Pay rates
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Overall balance owed"
          value={money(dashboard.totalBalanceOwedCents)}
        />
        <KpiCard
          label="Owed this month"
          value={money(dashboard.owedThisMonthCents)}
        />
        <KpiCard
          label="Owed last month"
          value={money(dashboard.owedLastMonthCents)}
        />
        <KpiCard
          label="Oldest open month"
          value={oldestValue}
          hint={oldestHint}
        />
      </div>
    </div>
  );
}
