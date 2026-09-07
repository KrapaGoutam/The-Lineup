"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  generatePayrollPeriodAction,
  getPayrollRateOptionsAction,
  listPayrollPeriodsAction,
  lockPayrollPeriodAction,
  regeneratePayrollPeriodAction,
  removePayrollRateOverrideAction,
  setPayrollDefaultRateAction,
  setPayrollRateOverrideAction,
  type PayrollRateOptions,
} from "@/features/payroll/actions/payroll-actions";
import type { PayrollPeriod } from "@/features/payroll/data/payroll-data";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { dollarsToCents } from "@/features/tips/domain/calculate-tip-splits";

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

function monthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Feature 020 Phase 2. Privileged-only, real mode only -- the point of this
 * screen is exercising generation/regeneration/locking against real Neon
 * hours end-to-end, not a full payroll experience (no payments/balance/
 * dashboard yet -- those are Phase 3/4). Demo mode parity is deliberately
 * deferred; the parent only renders this component when !demoMode.
 */
export function PayrollWorkspace({
  restaurantSlug,
}: {
  restaurantSlug: string;
}) {
  const [rateOptions, setRateOptions] = useState<PayrollRateOptions | null>(
    null,
  );
  const [rateOptionsError, setRateOptionsError] = useState<string | null>(null);
  const [rateReloadKey, setRateReloadKey] = useState(0);

  const [periods, setPeriods] = useState<PayrollPeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [periodsReloadKey, setPeriodsReloadKey] = useState(0);

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
      setPeriodsError(null);
      const result = await listPayrollPeriodsAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setPeriodsError(result.error);
        return;
      }
      setPeriods(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, periodsReloadKey]);

  function reloadEverything() {
    setRateReloadKey((key) => key + 1);
    setPeriodsReloadKey((key) => key + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="accent">Module 6</Badge>
          <Badge tone="warning">Phase 2 of 5</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Payroll</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Generate a person&apos;s monthly payroll from their attendance hours.
          Payments, balances, and the dashboard arrive in later phases — this
          screen only proves generation, regeneration, and locking work
          end-to-end against real data.
        </p>
      </div>

      {rateOptionsError ? (
        <ErrorPanel
          message={rateOptionsError}
          onRetry={() => setRateReloadKey((key) => key + 1)}
        />
      ) : !rateOptions ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading…
        </p>
      ) : (
        <>
          <RateSettings
            restaurantSlug={restaurantSlug}
            options={rateOptions}
            onChanged={() => setRateReloadKey((key) => key + 1)}
          />
          <GenerateForm
            restaurantSlug={restaurantSlug}
            users={rateOptions.users}
            onGenerated={reloadEverything}
          />
        </>
      )}

      {periodsError ? (
        <ErrorPanel
          message={periodsError}
          onRetry={() => setPeriodsReloadKey((key) => key + 1)}
        />
      ) : !periods ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading periods…
        </p>
      ) : (
        <PeriodsTable
          restaurantSlug={restaurantSlug}
          periods={periods}
          users={rateOptions?.users ?? []}
          onChanged={reloadEverything}
        />
      )}
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

function RateSettings({
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

function PeriodsTable({
  restaurantSlug,
  periods,
  users,
  onChanged,
}: {
  restaurantSlug: string;
  periods: PayrollPeriod[];
  users: { id: number; fullName: string; role: string }[];
  onChanged: () => void;
}) {
  const displayLabels = buildDisplayLabels(users);

  if (periods.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No payroll periods generated yet.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Generated periods</h2>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                <th className="py-1.5 pr-3 font-medium">Person</th>
                <th className="py-1.5 pr-3 font-medium">Month</th>
                <th className="py-1.5 pr-3 font-medium">Hours</th>
                <th className="py-1.5 pr-3 font-medium">Rate</th>
                <th className="py-1.5 pr-3 font-medium">Gross</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {periods.map((period) => (
                <PeriodRow
                  key={period.id}
                  restaurantSlug={restaurantSlug}
                  period={period}
                  label={
                    displayLabels.get(period.neonUserId) ??
                    `Neon #${period.neonUserId}`
                  }
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PeriodRow({
  restaurantSlug,
  period,
  label,
  onChanged,
}: {
  restaurantSlug: string;
  period: PayrollPeriod;
  label: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"regenerate" | "lock" | null>(null);

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
      <td className="py-1.5 pr-3">{label}</td>
      <td className="py-1.5 pr-3">{monthLabel(period.periodMonth)}</td>
      <td className="py-1.5 pr-3">{period.hoursSnapshot.toFixed(1)}h</td>
      <td className="py-1.5 pr-3">{money(period.rateCentsSnapshot)}/hr</td>
      <td className="py-1.5 pr-3 font-mono">{money(period.grossCents)}</td>
      <td className="py-1.5 pr-3">
        <Badge tone={period.status === "locked" ? "neutral" : "accent"}>
          {period.status === "locked" ? "Locked" : "Draft"}
        </Badge>
      </td>
      <td className="py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
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
