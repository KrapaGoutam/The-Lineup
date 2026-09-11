"use client";

import { Banknote, Plus, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PayrollDashboard } from "@/features/payroll/actions/payroll-actions";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

/**
 * Option 1k Payroll Dashboard KPI Cards & Header Toolbar.
 * Displays 3 executive summary cards:
 * 1. Highlight: Overall balance owed (across all people and open months).
 * 2. This month owed with draft period count.
 * 3. Last month owed with previous month snapshot.
 */
export function PayrollKpiCards({
  dashboard,
  onGoToPayRates,
  onToggleGenerate,
  onOpenPrintDialog,
}: {
  dashboard: PayrollDashboard;
  users?: Array<{ id: number; fullName: string; role: string }>;
  onGoToPayRates: () => void;
  onToggleGenerate?: () => void;
  /** Feature 030 bug fix: opens the multi-select batch print dialog,
   * with no person pre-selected (the global entry point). */
  onOpenPrintDialog?: () => void;
}) {
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("en-US", { month: "long" });
  const lastMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const lastMonthName = lastMonthDate.toLocaleDateString("en-US", {
    month: "long",
  });

  const openPeopleCount = new Set(
    dashboard.periods
      .filter((p) => p.balanceCents > 0)
      .map((p) => p.neonUserId),
  ).size;
  const draftCount = dashboard.periods.filter(
    (p) => p.status === "draft",
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Payroll
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generated from recorded hours. Confirmed payments reduce balances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onGoToPayRates}>
            <Banknote className="mr-1.5 size-4" aria-hidden="true" />
            Pay rates
          </Button>
          {onOpenPrintDialog ? (
            <Button variant="outline" size="sm" onClick={onOpenPrintDialog}>
              <Printer className="mr-1.5 size-4" aria-hidden="true" />
              Print Statements
            </Button>
          ) : null}
          {onToggleGenerate ? (
            // Bug fix: this used to expand GenerateForm inline below the
            // page; it now opens GenerateForm as a modal dialog (see
            // that component), so the button is a plain opener, not a
            // toggle -- there's nothing to "hide" once it's a modal with
            // its own close button. `showGenerateForm` is still the same
            // state either way, just no longer reflected in this label.
            <Button size="sm" onClick={onToggleGenerate}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Generate Payroll
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.35fr_1fr_1fr]">
        {/* Card 1: Highlight Card */}
        <Card className="border-primary/30 bg-primary/10 relative overflow-hidden shadow-sm">
          <CardContent className="space-y-2 p-5">
            <p className="text-muted-foreground text-[10.5px] font-bold tracking-[0.1em] uppercase">
              Overall balance owed
            </p>
            <p className="text-primary font-mono text-3xl font-bold tracking-tight lg:text-4xl">
              {money(dashboard.totalBalanceOwedCents)}
            </p>
            <p className="text-muted-foreground text-xs">
              across {openPeopleCount}{" "}
              {openPeopleCount === 1 ? "person" : "people"} · all open months
            </p>
          </CardContent>
        </Card>

        {/* Card 2: This Month */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="space-y-2 p-5">
            <p className="text-muted-foreground text-[10.5px] font-bold tracking-[0.1em] uppercase">
              This month
            </p>
            <p className="font-mono text-2xl font-bold tracking-tight lg:text-3xl">
              {money(dashboard.owedThisMonthCents)}
            </p>
            <p className="text-muted-foreground text-xs">
              {currentMonthName} · {draftCount} draft{" "}
              {draftCount === 1 ? "period" : "periods"}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Last Month */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="space-y-2 p-5">
            <p className="text-muted-foreground text-[10.5px] font-bold tracking-[0.1em] uppercase">
              Last month
            </p>
            <p className="font-mono text-2xl font-bold tracking-tight lg:text-3xl">
              {money(dashboard.owedLastMonthCents)}
            </p>
            <p className="text-muted-foreground text-xs">
              {lastMonthName} payroll snapshot
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
