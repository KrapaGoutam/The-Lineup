"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAttendanceFinancialReadinessAction,
  type FinancialReadinessView,
} from "@/features/attendance/actions/financial-readiness-actions";
import {
  INELIGIBILITY_LABELS,
  describeActivation,
  type IneligibilityReason,
} from "@/features/attendance/domain/financial-source";

function prettyDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * V2-006.006 — manager-only PREVIEW of which native shifts could be used for payroll.
 *
 * It shows no hours and no money on purpose: nothing here is, or feeds, a payroll figure.
 * A shift that is not ready is listed with the reason, never hidden and never counted as
 * zero. A failed or forbidden read says so; it is never shown as "nothing to review".
 */
export function PayrollReadinessPanel({
  restaurantSlug,
  locationId,
  start,
  end,
  reloadKey,
  names,
}: {
  restaurantSlug: string;
  /** The location the report on screen belongs to; the server refuses a mismatch (R1). */
  locationId: string;
  start: string;
  end: string;
  /** Bump to re-check (e.g. after a correction). */
  reloadKey: number;
  /** profileId → display name, from the report already on screen. */
  names: ReadonlyMap<string, string>;
}) {
  const [view, setView] = useState<FinancialReadinessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getAttendanceFinancialReadinessAction({
        restaurantSlug,
        startDate: start,
        endDate: end,
        expectedLocationId: locationId,
      });
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setView(null);
        setError(result.error);
        return;
      }
      setError(null);
      setView(result.data);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, locationId, start, end, reloadKey]);

  return (
    <Card>
      <CardContent
        data-testid="payroll-readiness"
        className="flex flex-col gap-3 pt-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Payroll readiness</h3>
          <Badge tone="warning">Preview only</Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Shows which shifts could be used for payroll once the owner approves
          the rules. It changes nothing, and nobody is paid from it.
        </p>

        {loading && !view && !error ? (
          <p role="status" className="text-muted-foreground text-sm">
            Checking shifts…
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {view ? (
          <>
            <p role="status" className="text-sm">
              {describeActivation(view.activation)}
            </p>
            {view.kind === "NATIVE" ? (
              <NativeBody view={view} names={names} />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NativeBody({
  view,
  names,
}: {
  view: Extract<FinancialReadinessView, { kind: "NATIVE" }>;
  names: ReadonlyMap<string, string>;
}) {
  const { readiness } = view;
  const reasons = Object.entries(readiness.excludedByReason) as [
    IneligibilityReason,
    number,
  ][];
  const needAttention = readiness.employees.filter((e) => e.excludedCount > 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" data-testid="readiness-counts">
        <span className="font-semibold">{readiness.eligibleCount}</span> of{" "}
        <span className="font-semibold">{readiness.recordCount}</span> shift
        {readiness.recordCount === 1 ? "" : "s"} ready
        {readiness.excludedCount > 0 ? (
          <>
            {" · "}
            <span className="text-warn font-semibold">
              {readiness.excludedCount} need
              {readiness.excludedCount === 1 ? "s" : ""} attention
            </span>
          </>
        ) : null}
      </p>

      {readiness.truncated ? (
        <p
          role="status"
          className="border-warn/30 bg-warn/10 text-warn rounded-xl border p-3 text-sm"
        >
          There are too many shifts to check at once, so this is incomplete.
          Narrow the dates.
        </p>
      ) : null}

      {readiness.totalsComplete && readiness.recordCount > 0 ? (
        <p className="text-muted-foreground text-sm">
          Every shift in these dates is ready.
        </p>
      ) : null}

      {readiness.recordCount === 0 && !readiness.truncated ? (
        <p className="text-muted-foreground text-sm">
          No shifts recorded in these dates.
        </p>
      ) : null}

      {reasons.length > 0 ? (
        <ul
          aria-label="Why shifts need attention"
          className="flex flex-col gap-1 text-sm"
        >
          {reasons.map(([reason, count]) => (
            <li key={reason} className="flex justify-between gap-3">
              <span>{INELIGIBILITY_LABELS[reason]}</span>
              <span className="text-muted-foreground tabular-nums">
                {count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {needAttention.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            A person with any shift that needs attention has no final total yet.
          </p>
          {needAttention.map((e) => (
            <div
              key={e.employeeId ?? e.externalUserId ?? "unknown"}
              className="rounded-xl border p-3"
            >
              <p className="text-sm font-semibold">
                {(e.employeeId ? names.get(e.employeeId) : null) ?? "Employee"}
              </p>
              <ul className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
                {e.excluded.map((x) => (
                  <li key={x.sourceRecordId}>
                    {prettyDate(x.serviceDate)} —{" "}
                    {x.reasons.map((r) => INELIGIBILITY_LABELS[r]).join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
