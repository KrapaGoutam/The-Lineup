"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Plain string arithmetic on an ISO "YYYY-MM-DD" date via Date.UTC --
// deliberately never touches the location's own time zone (that's already
// baked into `serviceDate`/`today` by the time they reach this component)
// and never uses `new Date(isoString)` directly, which parses a bare date
// as UTC midnight but would then drift under a naive +/-1 day local
// mutation in a non-UTC browser.
function addDays(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Feature 028. Lives entirely in the allocation board's own header --
 * "today" is passed in (the location's wall-clock today, from
 * AllocationContext), not computed here, so this component never has to
 * know about time zones itself. The next-day stepper and the date input's
 * own `max` both clamp at `today`; only "Back to today" is allowed to jump
 * past a in-between date, and only toward today, never past it.
 */
export function AllocationDateFilter({
  serviceDate,
  today,
  onChange,
  disabled = false,
}: {
  serviceDate: string;
  today: string;
  onChange: (nextServiceDate: string) => void;
  disabled?: boolean;
}) {
  const isToday = serviceDate === today;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous day"
        disabled={disabled}
        onClick={() => onChange(addDays(serviceDate, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Input
        type="date"
        aria-label="Service date"
        value={serviceDate}
        max={today}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
        className="w-40"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label="Next day"
        disabled={disabled || isToday}
        onClick={() => onChange(addDays(serviceDate, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      {!isToday ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(today)}
        >
          <RotateCcw aria-hidden="true" /> Back to today
        </Button>
      ) : null}
    </div>
  );
}
