"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RateSettings } from "@/features/payroll/components/payroll-workspace";
import {
  getPayrollRateOptionsAction,
  type PayrollRateOptions,
} from "@/features/payroll/actions/payroll-actions";

/**
 * Feature 023. The only file under src/features/settings/ that touches
 * anything in src/features/payroll/ -- and it only reaches for the rate-
 * configuration action and UI (org default + per-person overrides),
 * never payroll's ledger/balance/payment code. `getPayrollRateOptionsAction`
 * already enforces manager-only, real-session, organization-scoped access
 * server-side (`requirePayrollManager`); the caller (`SettingsPage`) is
 * still responsible for not rendering this in demo mode, since there's no
 * Neon-backed demo data source for payroll to call into.
 */
export function PayRatesSection({
  restaurantSlug,
}: {
  restaurantSlug: string;
}) {
  const [options, setOptions] = useState<PayrollRateOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const result = await getPayrollRateOptionsAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOptions(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, reloadKey]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <p className="text-destructive text-sm" aria-live="polite">
            {error}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!options) {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Pay rates</h2>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Loading…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <RateSettings
      restaurantSlug={restaurantSlug}
      options={options}
      onChanged={() => setReloadKey((key) => key + 1)}
    />
  );
}
