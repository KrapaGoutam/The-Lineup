"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  confirmPaymentAction,
  deleteDraftPaymentAction,
  generatePayrollPeriodAction,
  getPayrollAccessAction,
  getPayrollDashboardAction,
  getPayrollLedgerAction,
  getPayrollRateOptionsAction,
  listPayrollPeriodsAction,
  recordAdjustmentAction,
  recordPaymentAction,
  removePayrollRateOverrideAction,
  setPayrollDefaultRateAction,
  setPayrollRateOverrideAction,
  type PayrollAccessView,
  type PayrollDashboard,
  type PayrollLedger,
  type PayrollRateOptions,
} from "@/features/payroll/actions/payroll-actions";
import type {
  PayrollPayment,
  PayrollPeriod,
} from "@/features/payroll/data/payroll-data";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { PayrollBalancePanel } from "@/features/payroll/components/payroll-balance-panel";
import { PayrollKpiCards } from "@/features/payroll/components/payroll-kpi-cards";
import { PayrollPeriodGroups } from "@/features/payroll/components/payroll-period-groups";
import { buildPayrollLedgerLines } from "@/features/payroll/domain/calculate-payroll";
import { dollarsToCents } from "@/features/tips/domain/calculate-tip-splits";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

function centsToInputValue(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function monthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Header() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Module 6</Badge>
        <Badge tone="warning">Phase 5 of 5</Badge>
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">Payroll</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
        Generated payroll, recorded payments, manual adjustments, a dashboard,
        and printable/downloadable statements — all backed by real Supabase
        tables.
      </p>
    </div>
  );
}

/**
 * Feature 020, Phases 2-5. Real mode only -- demo mode parity is still
 * deliberately deferred (see Phase 2's build notes; unchanged reasoning).
 * A privileged viewer (owner/manager/assistant manager) manages rates,
 * generation, payments, and adjustments for everyone, and can print/export
 * any period's statement; a regular member sees a read-only view of their
 * own periods and their own confirmed payments/adjustments only, and can
 * print/export only their own -- exactly the same three-way access model
 * (all/self/unlinked) Feature 019 established for Attendance, resolved
 * server-side by `getPayrollAccessAction`, never guessed from `user.role`
 * client-side. Export reuses the identical `getPayrollLedgerAction` fetch
 * already scoped for the interactive ledger view -- there is no separate,
 * differently-authorized export action to audit.
 */
export function PayrollWorkspace({
  restaurantSlug,
  timeZone,
  onGoToPayRates,
}: {
  restaurantSlug: string;
  timeZone: string;
  /** Feature 026. Navigates to Settings > Pay Rates -- the dashboard's
   * own "Pay rates" button, distinct from `RateSettings` staying
   * rendered inline on this same tab too (unchanged). */
  onGoToPayRates: () => void;
}) {
  const todayLocalDate = zonedWallTimeFromInstant(new Date(), timeZone).date;
  const [access, setAccess] = useState<PayrollAccessView | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessReloadKey, setAccessReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAccessError(null);
      const result = await getPayrollAccessAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setAccessError(result.error);
        return;
      }
      setAccess(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, accessReloadKey]);

  if (accessError) {
    return (
      <div className="space-y-4">
        <Header />
        <ErrorPanel
          message={accessError}
          onRetry={() => setAccessReloadKey((key) => key + 1)}
        />
      </div>
    );
  }
  if (!access) {
    return (
      <div className="space-y-4">
        <Header />
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading…
        </p>
      </div>
    );
  }
  if (access.scope === "unlinked") {
    return (
      <div className="space-y-4">
        <Header />
        <Card>
          <CardContent className="space-y-1.5 pt-4">
            <p className="text-sm font-semibold">
              Your account isn&apos;t linked to the attendance system yet.
            </p>
            <p className="text-muted-foreground text-sm">
              Payroll is generated from attendance hours, so it needs the same
              link. Ask a manager or owner to link your account from the Team
              tab.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (access.scope === "self") {
    const personLabel = access.person
      ? (buildDisplayLabels([access.person]).get(access.person.id) ??
        access.person.fullName)
      : "Your attendance";
    return (
      <div className="space-y-4">
        <SelfPayrollView
          restaurantSlug={restaurantSlug}
          todayLocalDate={todayLocalDate}
          personLabel={personLabel}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PrivilegedPayrollView
        restaurantSlug={restaurantSlug}
        todayLocalDate={todayLocalDate}
        onGoToPayRates={onGoToPayRates}
      />
    </div>
  );
}

function PrivilegedPayrollView({
  restaurantSlug,
  todayLocalDate,
  onGoToPayRates,
}: {
  restaurantSlug: string;
  todayLocalDate: string;
  onGoToPayRates: () => void;
}) {
  const [rateOptions, setRateOptions] = useState<PayrollRateOptions | null>(
    null,
  );
  const [rateOptionsError, setRateOptionsError] = useState<string | null>(null);
  const [rateReloadKey, setRateReloadKey] = useState(0);

  // Feature 026: one fetch for the KPI cards, the grouped periods view,
  // AND the balance panel -- all three render from this same
  // `dashboard.periods` (each already carrying its own `balanceCents`),
  // rather than each independently re-fetching/re-deriving the same
  // data (the old flat `PeriodsTable` used to run its own separate
  // `listPayrollPeriodsAction` fetch alongside this one).
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRateOptionsError(null);
      const result = await getPayrollRateOptionsAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setRateOptionsError(result.error);
        return;
      }
      setRateOptions(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, rateReloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDashboardError(null);
      const result = await getPayrollDashboardAction({
        restaurantSlug,
        todayLocalDate,
      });
      if (cancelled) return;
      if (!result.ok) {
        setDashboardError(result.error);
        return;
      }
      setDashboard(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, todayLocalDate, dashboardReloadKey]);

  function reloadEverything() {
    setRateReloadKey((key) => key + 1);
    setDashboardReloadKey((key) => key + 1);
  }

  return (
    <>
      {dashboardError ? (
        <ErrorPanel
          message={dashboardError}
          onRetry={() => setDashboardReloadKey((key) => key + 1)}
        />
      ) : !dashboard ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading dashboard…
        </p>
      ) : (
        <PayrollKpiCards
          dashboard={dashboard}
          users={rateOptions?.users ?? []}
          onGoToPayRates={onGoToPayRates}
          showGenerateForm={showGenerateForm}
          onToggleGenerate={() => setShowGenerateForm((prev) => !prev)}
        />
      )}

      {showGenerateForm ? (
        rateOptionsError ? (
          <ErrorPanel
            message={rateOptionsError}
            onRetry={() => setRateReloadKey((key) => key + 1)}
          />
        ) : !rateOptions ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Loading team…
          </p>
        ) : (
          <GenerateForm
            restaurantSlug={restaurantSlug}
            users={rateOptions.users}
            onGenerated={() => {
              setShowGenerateForm(false);
              reloadEverything();
            }}
          />
        )
      ) : null}

      {dashboard ? (
        <div className="grid items-start gap-4.5 xl:grid-cols-[1fr_360px]">
          <PayrollPeriodGroups
            restaurantSlug={restaurantSlug}
            periods={dashboard.periods}
            users={rateOptions?.users ?? []}
            onChanged={reloadEverything}
            selectedPeriodId={selectedPeriodId}
            onSelectPeriod={setSelectedPeriodId}
          />
          <PayrollBalancePanel
            periods={dashboard.periods}
            users={rateOptions?.users ?? []}
          />
        </div>
      ) : null}

      {selectedPeriodId !== null ? (
        <PeriodLedgerPanel
          restaurantSlug={restaurantSlug}
          periodId={selectedPeriodId}
          readOnly={false}
          onChanged={reloadEverything}
          personLabel={(() => {
            const selectedPeriod = dashboard?.periods.find(
              (period) => period.id === selectedPeriodId,
            );
            const label = selectedPeriod
              ? buildDisplayLabels(rateOptions?.users ?? []).get(
                  selectedPeriod.neonUserId,
                )
              : undefined;
            return label ?? "This person";
          })()}
        />
      ) : null}
    </>
  );
}

function SelfPayrollView({
  restaurantSlug,
  todayLocalDate,
  personLabel,
}: {
  restaurantSlug: string;
  todayLocalDate: string;
  personLabel: string;
}) {
  const [periods, setPeriods] = useState<PayrollPeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPeriodsError(null);
      const result = await listPayrollPeriodsAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setPeriodsError(result.error);
        return;
      }
      setPeriods(result.data);
      if (result.data.length > 0 && selectedPeriodId === null) {
        setSelectedPeriodId(result.data[0].id);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug, reloadKey]);

  if (periodsError) {
    return (
      <ErrorPanel
        message={periodsError}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }
  if (!periods) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Loading…
      </p>
    );
  }
  if (periods.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            My Payroll
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View your monthly attendance hours, gross compensation, and payment
            history.
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          No payroll has been generated for you yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          My Payroll
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          View your monthly attendance hours, gross compensation, and payment
          history.
        </p>
      </div>
      <PayrollDashboardTiles
        restaurantSlug={restaurantSlug}
        todayLocalDate={todayLocalDate}
        scope="self"
        users={[]}
        reloadKey={reloadKey}
      />
      <Card>
        <CardContent className="pt-4">
          <Label htmlFor="self-period-select">Month</Label>
          <Select
            id="self-period-select"
            value={selectedPeriodId ?? ""}
            onChange={(event) =>
              setSelectedPeriodId(Number(event.target.value))
            }
            className="mt-1 w-56"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {monthLabel(period.periodMonth)}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>
      {selectedPeriodId !== null ? (
        <PeriodLedgerPanel
          restaurantSlug={restaurantSlug}
          periodId={selectedPeriodId}
          readOnly
          onChanged={() => setReloadKey((key) => key + 1)}
          personLabel={personLabel}
        />
      ) : null}
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="text-destructive text-sm" aria-live="polite">
          {message}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Feature 020 Phase 4. Read-only -- fetches `getPayrollDashboardAction`
 * and renders it, nothing more; no form, no mutation anywhere in this
 * component. `scope="all"` shows the org-wide two tiles plus a
 * per-person table; `scope="self"` shows the same fetch's data (the
 * server already scoped `perPerson` down to one entry via RLS, the exact
 * same pattern the ledger panel already uses) collapsed to that one
 * person's own numbers -- never a second, differently-scoped fetch.
 */
function PayrollDashboardTiles({
  restaurantSlug,
  todayLocalDate,
  scope,
  users,
  reloadKey,
}: {
  restaurantSlug: string;
  todayLocalDate: string;
  scope: "all" | "self";
  users: { id: number; fullName: string; role: string }[];
  reloadKey: number;
}) {
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localReloadKey, setLocalReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const result = await getPayrollDashboardAction({
        restaurantSlug,
        todayLocalDate,
      });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDashboard(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, todayLocalDate, reloadKey, localReloadKey]);

  if (error) {
    return (
      <ErrorPanel
        message={error}
        onRetry={() => setLocalReloadKey((key) => key + 1)}
      />
    );
  }
  if (!dashboard) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Loading dashboard…
      </p>
    );
  }

  if (scope === "self") {
    const own = dashboard.perPerson[0] ?? null;
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <BalanceTile
          label="Your balance"
          value={money(own?.balanceCents ?? 0)}
          emphasize
        />
        <BalanceTile
          label="Generated last month"
          value={money(dashboard.previousMonthGeneratedCents)}
        />
        <BalanceTile
          label="Total generated (all-time)"
          value={money(own?.totalGeneratedCents ?? 0)}
        />
      </div>
    );
  }

  const displayLabels = buildDisplayLabels(users);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <BalanceTile
          label="Total balance still owed"
          value={money(dashboard.totalBalanceOwedCents)}
          emphasize
        />
        <BalanceTile
          label="Generated last month"
          value={money(dashboard.previousMonthGeneratedCents)}
        />
      </div>
      {dashboard.perPerson.length > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Balance per person</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                    <th className="py-1.5 pr-3 font-medium">Person</th>
                    <th className="py-1.5 pr-3 font-medium">
                      Total payroll (all-time)
                    </th>
                    <th className="py-1.5 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {dashboard.perPerson.map((person) => (
                    <tr key={person.neonUserId}>
                      <td className="py-1.5 pr-3">
                        {displayLabels.get(person.neonUserId) ??
                          `Neon #${person.neonUserId}`}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">
                        {money(person.totalGeneratedCents)}
                      </td>
                      <td className="py-1.5 font-mono">
                        {money(person.balanceCents)}
                        {person.balanceCents <= 0 ? (
                          <Badge tone="accent" className="ml-1.5">
                            Paid ✓
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// Feature 023: exported so Settings' Pay Rates section can reuse this
// exact rate-configuration UI (org default + per-person overrides)
// instead of building a second one -- Settings never touches anything
// else in this file (no ledger/balance/payment code).
export function RateSettings({
  restaurantSlug,
  options,
  onChanged,
}: {
  restaurantSlug: string;
  options: PayrollRateOptions;
  onChanged: () => void;
}) {
  const [defaultInput, setDefaultInput] = useState(
    centsToInputValue(options.defaultRateCents),
  );
  const [defaultError, setDefaultError] = useState("");
  const [defaultPending, setDefaultPending] = useState(false);

  async function saveDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDefaultError("");
    let rateCents: number;
    try {
      rateCents = dollarsToCents(defaultInput);
    } catch (error) {
      setDefaultError(
        error instanceof Error ? error.message : "Enter a valid rate.",
      );
      return;
    }
    setDefaultPending(true);
    try {
      const result = await setPayrollDefaultRateAction({
        restaurantSlug,
        rateCents,
      });
      if (!result.ok) {
        setDefaultError(result.error);
        return;
      }
      onChanged();
    } finally {
      setDefaultPending(false);
    }
  }

  const displayLabels = buildDisplayLabels(options.users);
  const overrideByUser = new Map(
    options.overrides.map((override) => [
      override.neonUserId,
      override.rateCents,
    ]),
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Pay rates</h2>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <form onSubmit={saveDefault} className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="default-rate">Organization default ($/hr)</Label>
            <Input
              id="default-rate"
              inputMode="decimal"
              value={defaultInput}
              onChange={(event) => setDefaultInput(event.target.value)}
              placeholder="10.00"
              className="w-32"
            />
          </div>
          <Button type="submit" disabled={defaultPending} size="sm">
            {defaultPending ? "Saving…" : "Save default"}
          </Button>
        </form>
        {defaultError ? (
          <p className="text-destructive text-sm" aria-live="polite">
            {defaultError}
          </p>
        ) : null}

        <div className="divide-border divide-y">
          {options.users.map((user) => (
            <RateOverrideRow
              key={user.id}
              restaurantSlug={restaurantSlug}
              label={displayLabels.get(user.id) ?? user.fullName}
              neonUserId={user.id}
              currentRateCents={overrideByUser.get(user.id) ?? null}
              onChanged={onChanged}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RateOverrideRow({
  restaurantSlug,
  label,
  neonUserId,
  currentRateCents,
  onChanged,
}: {
  restaurantSlug: string;
  label: string;
  neonUserId: number;
  currentRateCents: number | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(centsToInputValue(currentRateCents));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setError("");
    let rateCents: number;
    try {
      rateCents = dollarsToCents(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid rate.");
      return;
    }
    setPending(true);
    try {
      const result = await setPayrollRateOverrideAction({
        restaurantSlug,
        neonUserId,
        rateCents,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError("");
    setPending(true);
    try {
      const result = await removePayrollRateOverrideAction({
        restaurantSlug,
        neonUserId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue("");
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Input
        aria-label={`${label}'s hourly rate override`}
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="uses default"
        className="w-28"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={save}
        disabled={pending}
      >
        Save
      </Button>
      {currentRateCents !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={remove}
          disabled={pending}
        >
          Remove
        </Button>
      ) : null}
      {error ? (
        <span className="text-destructive w-full text-xs">{error}</span>
      ) : null}
    </div>
  );
}

function GenerateForm({
  restaurantSlug,
  users,
  onGenerated,
}: {
  restaurantSlug: string;
  users: { id: number; fullName: string; role: string }[];
  onGenerated: () => void;
}) {
  const displayLabels = buildDisplayLabels(users);
  const [neonUserId, setNeonUserId] = useState<number | "">(users[0]?.id ?? "");
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (neonUserId === "" || !month) {
      setError("Choose a person and a month.");
      return;
    }
    setPending(true);
    try {
      const result = await generatePayrollPeriodAction({
        restaurantSlug,
        neonUserId,
        periodMonth: `${month}-01`,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGenerated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Generate payroll</h2>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="generate-person">Person</Label>
            <Select
              id="generate-person"
              value={neonUserId}
              onChange={(event) => setNeonUserId(Number(event.target.value))}
              className="w-56"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayLabels.get(user.id)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="generate-month">Month</Label>
            <Input
              id="generate-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-40"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Generating…" : "Generate"}
          </Button>
        </form>
        {error ? (
          <p className="text-destructive mt-2 text-sm" aria-live="polite">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatPaymentDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Feature 020 Phase 5. Quotes a CSV field only when it needs it (contains
// a comma, quote, or newline), doubling any internal quotes -- the
// standard RFC 4180 escaping rule, hand-rolled here rather than pulling
// in a CSV library for one function's worth of logic.
function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// No new dependency for the download itself either -- a Blob and a
// throwaway anchor click, the same technique this codebase already
// avoids adding a library for anywhere else it needs a client-side file
// save.
function downloadCsv(filename: string, csvContent: string) {
  // A leading BOM so Excel opens the UTF-8 file with special characters
  // (an em dash in "Payment — comment", say) displaying correctly instead
  // of mojibake -- CSV has no built-in encoding declaration, and Excel
  // specifically defaults to the system codepage without one.
  const blob = new Blob(["﻿" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Feature 020 Phase 3. The ledger for one period -- balance, every
 * payment, every adjustment -- and, for a privileged (non-readOnly)
 * viewer, the forms/actions that write to it. `readOnly` is the only
 * thing that differs between the privileged and self-service render:
 * the data itself already arrives correctly scoped by
 * `getPayrollLedgerAction` (privileged sees both payment statuses and
 * everyone's adjustments; self sees only their own confirmed payments
 * and their own adjustments, via RLS, not a client-side filter here).
 */
function PeriodLedgerPanel({
  restaurantSlug,
  periodId,
  readOnly,
  onChanged,
  personLabel,
}: {
  restaurantSlug: string;
  periodId: number;
  readOnly: boolean;
  onChanged: () => void;
  personLabel: string;
}) {
  const [ledger, setLedger] = useState<PayrollLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const result = await getPayrollLedgerAction({ restaurantSlug, periodId });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLedger(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, periodId, reloadKey]);

  function refresh() {
    setReloadKey((key) => key + 1);
    onChanged();
  }

  if (error) {
    return (
      <ErrorPanel
        message={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }
  if (!ledger) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Loading ledger…
      </p>
    );
  }

  const { period, payments, adjustments, balance, organizationName } = ledger;

  // Confirmed only, matching the balance figure itself -- a printed or
  // exported statement is a finalized document, never showing money that
  // could still change. The exact same line list feeds both the print
  // view and the CSV, so the two formats can never disagree.
  const confirmedPayments = payments.filter(
    (payment) => payment.status === "confirmed",
  );
  const ledgerLines = buildPayrollLedgerLines({
    grossCents: period.grossCents,
    periodMonth: period.periodMonth,
    confirmedPayments: confirmedPayments.map((payment) => ({
      paymentDate: payment.paymentDate,
      amountCents: payment.amountCents,
      comment: payment.comment,
    })),
    adjustments: adjustments.map((adjustment) => ({
      createdAt: adjustment.createdAt,
      deltaCents: adjustment.deltaCents,
      reason: adjustment.reason,
    })),
  });
  const printAreaId = `payroll-print-statement-${period.id}`;

  function downloadStatementCsv() {
    const rows: (string | number)[][] = [
      [organizationName],
      ["Payroll Statement"],
      [personLabel],
      [monthLabel(period.periodMonth)],
      [],
      ["Date", "Description", "Amount", "Running balance"],
      ...ledgerLines.map((line) => [
        line.date,
        line.description,
        (line.amountCents / 100).toFixed(2),
        (line.runningBalanceCents / 100).toFixed(2),
      ]),
      [],
      ["Final balance", "", "", (balance.balanceCents / 100).toFixed(2)],
      ...(balance.fullyPaid ? [["Status", "Paid"]] : []),
    ];
    const csv = rows.map((row) => row.map(csvField).join(",")).join("\r\n");
    const safeName = personLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(`payroll-${safeName}-${period.periodMonth}.csv`, csv);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          {monthLabel(period.periodMonth)} ledger
        </h2>
        <div className="flex gap-1.5 print:hidden">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            Print statement
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={downloadStatementCsv}
          >
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 print:hidden">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceTile label="Generated" value={money(balance.grossCents)} />
          <BalanceTile
            label="Confirmed paid"
            value={money(balance.confirmedPaymentsCents)}
          />
          <BalanceTile
            label="Adjustments"
            value={money(balance.adjustmentsCents)}
          />
          <BalanceTile
            label="Balance"
            value={money(balance.balanceCents)}
            emphasize
          />
        </div>
        {balance.draftPaymentsCents > 0 ? (
          <p className="text-muted-foreground text-xs">
            {money(balance.draftPaymentsCents)} recorded but not yet confirmed
            -- not reflected in the balance above until confirmed.
          </p>
        ) : null}
        {balance.fullyPaid ? <Badge tone="accent">Paid ✓</Badge> : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Payments</h3>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payments recorded{readOnly ? " yet" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Amount</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 font-medium">Comment</th>
                    {readOnly ? null : (
                      <th className="py-1.5 font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {payments.map((payment) => (
                    <PaymentRow
                      key={payment.id}
                      restaurantSlug={restaurantSlug}
                      payment={payment}
                      readOnly={readOnly}
                      onChanged={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Adjustments</h3>
          {adjustments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No adjustments recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Amount</th>
                    <th className="py-1.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {adjustments.map((adjustment) => (
                    <tr key={adjustment.id}>
                      <td className="py-1.5 pr-3">
                        {formatPaymentDate(adjustment.createdAt.slice(0, 10))}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">
                        {adjustment.deltaCents > 0 ? "+" : ""}
                        {money(adjustment.deltaCents)}
                      </td>
                      <td className="py-1.5">{adjustment.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {readOnly ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <RecordPaymentForm
              restaurantSlug={restaurantSlug}
              periodId={period.id}
              onRecorded={refresh}
            />
            <RecordAdjustmentForm
              restaurantSlug={restaurantSlug}
              periodId={period.id}
              onRecorded={refresh}
            />
          </div>
        )}
      </CardContent>

      {/* Printed/exported statement -- hidden on screen, shown only when
          printing. The isolation rule below hides everything else on the
          page (including the app's own header/nav, which this component
          has no other way to reach) so "Print statement" produces just
          this document, not a screenshot of the whole tab. Built from the
          exact same `ledgerLines` the CSV download uses, so the two
          formats can never show different numbers for the same period. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #${printAreaId}, #${printAreaId} * { visibility: visible; }
          #${printAreaId} { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
        }
      `}</style>
      <div id={printAreaId} className="hidden print:block">
        <h1 className="text-2xl font-bold">{organizationName}</h1>
        <h2 className="mt-1 text-lg font-semibold">Payroll Statement</h2>
        <p className="mt-1 text-sm">
          {personLabel} — {monthLabel(period.periodMonth)}
        </p>
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-4 font-medium">Date</th>
              <th className="py-1 pr-4 font-medium">Description</th>
              <th className="py-1 pr-4 text-right font-medium">Amount</th>
              <th className="py-1 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledgerLines.map((line, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-1 pr-4">{line.date}</td>
                <td className="py-1 pr-4">{line.description}</td>
                <td className="py-1 pr-4 text-right font-mono">
                  {line.amountCents < 0 ? "−" : ""}
                  {money(Math.abs(line.amountCents))}
                </td>
                <td className="py-1 text-right font-mono">
                  {money(line.runningBalanceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-right text-base font-semibold">
          Final balance: {money(balance.balanceCents)}
          {balance.fullyPaid ? " — Paid" : ""}
        </p>
        <p className="text-muted-foreground mt-10 text-xs">
          Printed {new Date().toLocaleDateString()} · ServiceFlow payroll
          statement · confirmed payments and adjustments only
        </p>
      </div>
    </Card>
  );
}

function BalanceTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-muted-foreground text-xs font-medium uppercase">
          {label}
        </p>
        <p
          className={
            emphasize
              ? "font-mono text-2xl font-bold"
              : "font-mono text-lg font-semibold"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PaymentRow({
  restaurantSlug,
  payment,
  readOnly,
  onChanged,
}: {
  restaurantSlug: string;
  payment: PayrollPayment;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"confirm" | "delete" | null>(null);

  async function confirm() {
    setError("");
    setPending("confirm");
    try {
      const result = await confirmPaymentAction({
        restaurantSlug,
        paymentId: payment.id,
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

  async function remove() {
    setError("");
    setPending("delete");
    try {
      const result = await deleteDraftPaymentAction({
        restaurantSlug,
        paymentId: payment.id,
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
      <td className="py-1.5 pr-3">{formatPaymentDate(payment.paymentDate)}</td>
      <td className="py-1.5 pr-3 font-mono">{money(payment.amountCents)}</td>
      <td className="py-1.5 pr-3">
        <Badge tone={payment.status === "confirmed" ? "accent" : "warning"}>
          {payment.status === "confirmed" ? "Confirmed" : "Draft"}
        </Badge>
      </td>
      <td className="py-1.5 pr-3">{payment.comment ?? "—"}</td>
      {readOnly ? null : (
        <td className="py-1.5">
          {payment.status === "draft" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={confirm}
                disabled={pending !== null}
              >
                {pending === "confirm" ? "Confirming…" : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={remove}
                disabled={pending !== null}
              >
                {pending === "delete" ? "Deleting…" : "Delete"}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="text-destructive mt-1 text-xs" aria-live="polite">
              {error}
            </p>
          ) : null}
        </td>
      )}
    </tr>
  );
}

function RecordPaymentForm({
  restaurantSlug,
  periodId,
  onRecorded,
}: {
  restaurantSlug: string;
  periodId: number;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!date) {
      setError("Choose the date the payment was made.");
      return;
    }
    let amountCents: number;
    try {
      amountCents = dollarsToCents(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid amount.");
      return;
    }
    if (amountCents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    try {
      const result = await recordPaymentAction({
        restaurantSlug,
        periodId,
        amountCents,
        paymentDate: date,
        comment: comment.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setDate("");
      setComment("");
      onRecorded();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Record a payment</h3>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={submit} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <Label htmlFor="payment-amount">Amount ($)</Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="400.00"
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-date">Date paid</Label>
              <Input
                id="payment-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-40"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-comment">Comment (optional)</Label>
            <Input
              id="payment-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="e.g. cash advance"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
          {error ? (
            <p className="text-destructive text-sm" aria-live="polite">
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function RecordAdjustmentForm({
  restaurantSlug,
  periodId,
  onRecorded,
}: {
  restaurantSlug: string;
  periodId: number;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"reduce" | "increase">("reduce");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (reason.trim().length < 3) {
      setError("Enter a reason (at least 3 characters).");
      return;
    }
    let magnitudeCents: number;
    try {
      magnitudeCents = dollarsToCents(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid amount.");
      return;
    }
    if (magnitudeCents === 0) {
      setError("An adjustment must be a nonzero amount.");
      return;
    }
    // "Reduce what's owed" (a correction that lowers balance further, same
    // direction as a payment) is a POSITIVE delta in the formula
    // (balance = gross - payments - adjustments); "increase what's owed"
    // (e.g. undoing an overpayment credit) is negative. This mirrors the
    // spec's worked example directly: a confirmed $400 that should have
    // been $40 needs balance to go UP by $360 relative to what the $400
    // payment alone implies -- i.e. a NEGATIVE $360 adjustment, since the
    // payment already reduced balance by $400 and this adjustment must
    // claw back $360 of that reduction.
    const deltaCents =
      direction === "reduce" ? magnitudeCents : -magnitudeCents;
    setPending(true);
    try {
      const result = await recordAdjustmentAction({
        restaurantSlug,
        periodId,
        deltaCents,
        reason: reason.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setReason("");
      onRecorded();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Record an adjustment</h3>
        <p className="text-muted-foreground text-xs">
          Corrects a wrong confirmed payment or generated total without editing
          history -- adds a new, visible, reasoned entry instead.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={submit} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <Label htmlFor="adjustment-amount">Amount ($)</Label>
              <Input
                id="adjustment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="360.00"
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adjustment-direction">Effect</Label>
              <Select
                id="adjustment-direction"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as "reduce" | "increase")
                }
                className="w-56"
              >
                <option value="reduce">Reduce balance further</option>
                <option value="increase">Increase balance owed</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Input
              id="adjustment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. confirmed $400 payment should have been $40"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Recording…" : "Record adjustment"}
          </Button>
          {error ? (
            <p className="text-destructive text-sm" aria-live="polite">
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
