"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { DayOperatingHours } from "@/features/locations/domain/location";
import {
  isOvernightOperatingHours,
  isValidLocalTimeString,
} from "@/features/locations/domain/location";

const WEEKDAYS = [
  { index: 0, name: "Sunday" },
  { index: 1, name: "Monday" },
  { index: 2, name: "Tuesday" },
  { index: 3, name: "Wednesday" },
  { index: 4, name: "Thursday" },
  { index: 5, name: "Friday" },
  { index: 6, name: "Saturday" },
] as const;

export interface LocationOperatingHoursEditorProps {
  readonly initialHours: readonly DayOperatingHours[];
  readonly onSave: (
    hours: DayOperatingHours[],
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onCancel?: () => void;
  readonly isReadOnly?: boolean;
}

export function LocationOperatingHoursEditor({
  initialHours,
  onSave,
  onCancel,
  isReadOnly = false,
}: LocationOperatingHoursEditorProps) {
  // Initialize normalized 7 days (fill missing days with closed default)
  const [schedule, setSchedule] = React.useState<DayOperatingHours[]>(() => {
    return WEEKDAYS.map((wd) => {
      const existing = initialHours.find((h) => h.dayOfWeek === wd.index);
      if (existing) {
        return {
          dayOfWeek: wd.index,
          openingLocal: existing.openingLocal,
          closingLocal: existing.closingLocal,
          closed: existing.closed,
          isOvernight:
            !existing.closed && existing.openingLocal && existing.closingLocal
              ? isOvernightOperatingHours(
                  existing.openingLocal,
                  existing.closingLocal,
                )
              : false,
        };
      }
      return {
        dayOfWeek: wd.index,
        openingLocal: "11:00",
        closingLocal: "23:00",
        closed: false,
        isOvernight: false,
      };
    });
  });

  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);

  function handleToggleClosed(dayOfWeek: number) {
    if (isReadOnly || isSaving) return;
    setIsDirty(true);
    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(false);

    setSchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        const willBeClosed = !day.closed;
        return {
          ...day,
          closed: willBeClosed,
          openingLocal: willBeClosed ? null : (day.openingLocal ?? "11:00"),
          closingLocal: willBeClosed ? null : (day.closingLocal ?? "23:00"),
          isOvernight: false,
        };
      }),
    );
  }

  function handleTimeChange(
    dayOfWeek: number,
    field: "openingLocal" | "closingLocal",
    value: string,
  ) {
    if (isReadOnly || isSaving) return;
    setIsDirty(true);
    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(false);

    setSchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        const updated = { ...day, [field]: value };
        const isOvernight =
          !updated.closed && updated.openingLocal && updated.closingLocal
            ? isOvernightOperatingHours(
                updated.openingLocal,
                updated.closingLocal,
              )
            : false;
        return { ...updated, isOvernight };
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly || isSaving) return;

    // Validate schedule
    for (const day of schedule) {
      if (!day.closed) {
        if (!day.openingLocal || !isValidLocalTimeString(day.openingLocal)) {
          setValidationError(
            `${WEEKDAYS[day.dayOfWeek].name}: Valid opening time (HH:mm) is required.`,
          );
          return;
        }
        if (!day.closingLocal || !isValidLocalTimeString(day.closingLocal)) {
          setValidationError(
            `${WEEKDAYS[day.dayOfWeek].name}: Valid closing time (HH:mm) is required.`,
          );
          return;
        }
        if (day.openingLocal === day.closingLocal) {
          setValidationError(
            `${WEEKDAYS[day.dayOfWeek].name}: Opening and closing times cannot be identical.`,
          );
          return;
        }
      }
    }

    setIsSaving(true);
    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await onSave(schedule);
      if (!res.ok) {
        setSaveError(
          res.error || "Failed to save operating hours. Please retry.",
        );
      } else {
        setSaveSuccess(true);
        setIsDirty(false);
      }
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save operating hours.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Weekly Operating Hours
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Set local wall-clock opening and closing times per weekday.
          </p>
        </div>
        {isDirty && (
          <span className="text-xs font-medium text-amber-500">
            Unsaved changes
          </span>
        )}
      </div>

      {validationError && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-3 text-xs font-medium"
        >
          {validationError}
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-3 text-xs font-medium"
        >
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        >
          Operating hours saved successfully.
        </div>
      )}

      <div className="divide-border border-border bg-card divide-y rounded-xl border">
        {WEEKDAYS.map((wd) => {
          const day = schedule.find((d) => d.dayOfWeek === wd.index)!;
          const openInputId = `hours-${wd.index}-open`;
          const closeInputId = `hours-${wd.index}-close`;

          return (
            <div
              key={wd.index}
              className="flex flex-col justify-between gap-3 p-3 text-sm sm:flex-row sm:items-center"
            >
              <div className="flex items-center justify-between sm:w-36">
                <span className="text-foreground font-medium">{wd.name}</span>
                <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs sm:hidden">
                  <input
                    type="checkbox"
                    checked={day.closed}
                    onChange={() => handleToggleClosed(wd.index)}
                    disabled={isReadOnly || isSaving}
                    className="border-border size-4 rounded"
                  />
                  Closed
                </label>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3">
                <label className="text-muted-foreground hidden min-w-[70px] cursor-pointer items-center gap-1.5 text-xs sm:flex">
                  <input
                    type="checkbox"
                    checked={day.closed}
                    onChange={() => handleToggleClosed(wd.index)}
                    disabled={isReadOnly || isSaving}
                    className="border-border size-4 rounded"
                  />
                  Closed
                </label>

                {day.closed ? (
                  <Badge tone="neutral" className="px-3 py-1 text-xs">
                    Closed all day
                  </Badge>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs sm:hidden">
                        Open:
                      </span>
                      <Input
                        id={openInputId}
                        type="time"
                        value={day.openingLocal ?? "11:00"}
                        onChange={(e) =>
                          handleTimeChange(
                            wd.index,
                            "openingLocal",
                            e.target.value,
                          )
                        }
                        disabled={isReadOnly || isSaving}
                        className="h-9 w-32 px-2 text-xs"
                        aria-label={`${wd.name} opening time`}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs">to</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs sm:hidden">
                        Close:
                      </span>
                      <Input
                        id={closeInputId}
                        type="time"
                        value={day.closingLocal ?? "23:00"}
                        onChange={(e) =>
                          handleTimeChange(
                            wd.index,
                            "closingLocal",
                            e.target.value,
                          )
                        }
                        disabled={isReadOnly || isSaving}
                        className="h-9 w-32 px-2 text-xs"
                        aria-label={`${wd.name} closing time`}
                      />
                    </div>
                    {day.isOvernight && (
                      <Badge tone="warning" className="text-[11px] font-medium">
                        Closes next day
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2.5 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={isSaving || !isDirty}>
            {isSaving ? "Saving..." : "Save Operating Hours"}
          </Button>
        </div>
      )}
    </form>
  );
}
