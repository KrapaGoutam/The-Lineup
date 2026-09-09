"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MONTH_NAMES } from "@/features/attendance/domain/attendance-metrics";

// The acceptance criterion's own floor ("2024-present") -- not derived
// from anything else, since there's no earlier real data this app could
// ever show regardless of what today happens to be.
const MIN_YEAR = 2024;

/**
 * Feature 025. Matches design-system-reference.html section 2e's
 * "< September > 2026" bar: a month `<select>` and a year `<select>`
 * (so any month is one interaction away, not twelve clicks of "next"),
 * plus prev/next steppers for the common case of paging one month at a
 * time. Both the steppers and the dropdowns clamp at the same two
 * boundaries -- MIN_YEAR/January and `maxYear`/`maxMonth` (the
 * restaurant's own real "today", passed in by the caller, never computed
 * here) -- so there is exactly one place a future month or a
 * before-2024 month could ever be selected, and it's disabled in both
 * controls identically, mirroring Feature 028's date navigator's own
 * "clamp everywhere the value could change, not just in one control" rule.
 */
export function AttendanceMonthNav({
  year,
  month,
  maxYear,
  maxMonth,
  onChange,
}: {
  year: number;
  /** 1-12, January = 1. */
  month: number;
  maxYear: number;
  /** 1-12 -- only meaningful when `year === maxYear`. */
  maxMonth: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  const atFloor = year <= MIN_YEAR && month <= 1;
  const atCeiling = year >= maxYear && month >= maxMonth;

  function step(delta: 1 | -1) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    onChange({ year: nextYear, month: nextMonth });
  }

  const years: number[] = [];
  for (let y = MIN_YEAR; y <= maxYear; y += 1) years.push(y);
  const monthCeilingForYear = year === maxYear ? maxMonth : 12;

  return (
    <div className="border-border bg-secondary flex items-center gap-1 rounded-2xl border p-1.5">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        disabled={atFloor}
        onClick={() => step(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Select
        aria-label="Month"
        value={String(month)}
        onChange={(event) => {
          const nextMonth = Number(event.target.value);
          onChange({
            year,
            month: Math.min(nextMonth, monthCeilingForYear),
          });
        }}
        className="text-foreground [&>option]:bg-popover [&>option]:text-popover-foreground w-auto min-w-[9.5rem] border-0 bg-transparent font-semibold"
      >
        {MONTH_NAMES.map((name, index) => {
          const value = index + 1;
          const disabled = year === maxYear && value > maxMonth;
          return (
            <option key={value} value={value} disabled={disabled}>
              {name}
            </option>
          );
        })}
      </Select>
      <Select
        aria-label="Year"
        value={String(year)}
        onChange={(event) => {
          const nextYear = Number(event.target.value);
          const monthCeiling = nextYear === maxYear ? maxMonth : 12;
          onChange({ year: nextYear, month: Math.min(month, monthCeiling) });
        }}
        className="text-foreground [&>option]:bg-popover [&>option]:text-popover-foreground w-auto min-w-[6rem] border-0 bg-transparent font-mono font-semibold"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        disabled={atCeiling}
        onClick={() => step(1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
