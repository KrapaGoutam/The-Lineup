"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipsReportDocument } from "@/features/tips/components/tips-report-document";
import type { TipsApi } from "@/features/tips/domain/tips-api";
import {
  TIPS_PERIOD_PRESETS,
  resolveTipsPeriod,
  type TipsPeriodPreset,
} from "@/features/tips/domain/tips-period";
import type { TipsRange } from "@/features/tips/domain/tips-range-model";
import { formatDateTime } from "@/features/tips/domain/tips-format";
import { triggerPrintWithFilename } from "@/lib/print-utils";

/**
 * History: Today / Yesterday / This week / This month / Previous month / Custom range,
 * with per-employee totals and daily, weekly and monthly summaries, as a readable preview
 * that prints to Letter or saves as PDF. Reads only through `api.loadRange`, so what a
 * person may see is decided by the database, not here.
 */
export function TipsHistory({
  api,
  today,
  timeZone,
  branchName,
  isManager,
  nameOf,
  onOpenDay,
  refreshKey,
}: {
  api: TipsApi;
  /** The LOCATION's business date. */
  today: string;
  timeZone: string;
  branchName: string;
  isManager: boolean;
  nameOf: (profileId: string) => string;
  onOpenDay?: (serviceDate: string) => void;
  /** Changes when the saved data changed elsewhere, to reload. */
  refreshKey: number;
}) {
  const [preset, setPreset] = useState<TipsPeriodPreset>("this-week");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [range, setRange] = useState<TipsRange | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const resolved = useMemo(
    () =>
      resolveTipsPeriod(
        preset,
        today,
        preset === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [preset, today, customFrom, customTo],
  );

  const load = useCallback(async () => {
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    const mine = ++request.current;
    setLoading(true);
    setError("");
    const result = await api.loadRange({
      from: resolved.period.from,
      to: resolved.period.to,
      includeRevisions: false,
    });
    if (mine !== request.current) return; // a newer request superseded this one
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setRange(null);
      return;
    }
    setRange(result.data.range);
  }, [api, resolved]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading a range is the effect's purpose
    void load();
  }, [load, refreshKey]);

  const periodLabel = resolved.ok ? resolved.period.label : "";

  return (
    <div className="space-y-4">
      <div className="report-no-print space-y-3 print:hidden">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {TIPS_PERIOD_PRESETS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant={preset === id ? "default" : "outline"}
              aria-pressed={preset === id}
              onClick={() => setPreset(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="tips-range-from">Start date</Label>
              <Input
                id="tips-range-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tips-range-to">End date</Label>
              <Input
                id="tips-range-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!range || !resolved.ok}
            onClick={() =>
              triggerPrintWithFilename(`Tips Report ${periodLabel}`)
            }
          >
            <Printer aria-hidden="true" /> Print / Save PDF
          </Button>
          {isManager && range && range.days.length > 0 && onOpenDay ? (
            <div
              className="flex flex-wrap items-center gap-2"
              aria-label="Open a day"
            >
              <span className="text-muted-foreground text-xs">
                Open a day to edit:
              </span>
              {range.days.map((day) => (
                <Button
                  key={day.poolId}
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenDay(day.serviceDate)}
                >
                  {day.serviceDate}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        {error ? (
          <p
            className="text-destructive text-sm"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-muted-foreground text-sm" role="status">
            Loading…
          </p>
        ) : null}
      </div>

      {range && resolved.ok ? (
        <TipsReportDocument
          branchName={branchName}
          periodLabel={periodLabel}
          range={range}
          isManager={isManager}
          nameOf={nameOf}
          generatedAtLabel={formatDateTime(new Date().toISOString(), timeZone)}
        />
      ) : null}
    </div>
  );
}
