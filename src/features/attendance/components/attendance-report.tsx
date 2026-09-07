"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getAttendanceReportAction,
  getAttendanceUsersAction,
} from "@/features/attendance/actions/attendance-actions";
import type {
  NeonAttendanceRow,
  NeonUser,
} from "@/features/attendance/data/attendance-data";
import {
  aggregateHours,
  buildDisplayLabels,
  resolvePeriodRange,
  type AttendancePeriodSelection,
} from "@/features/attendance/domain/attendance-report";
import {
  demoNeonAttendance,
  demoNeonUsers,
} from "@/features/attendance/demo-data";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

type PeriodOption = "this-month" | "previous-month" | "custom";

function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/**
 * Feature 018. Every read here is client-triggered -- on mount, and on
 * every selection/period change -- deliberately never folded into this
 * app's shared initial page load (`loadPageData`) the way schedule/tips/
 * allocation are. See docs/features/018-neon-attendance-report.md's
 * Implementation map: that's what makes "a slow or unreachable Neon
 * never affects anything else in the app" actually true by construction,
 * not just handled if it happens to come up.
 */
export function AttendanceReport({
  restaurantSlug,
  demoMode,
  timeZone,
}: {
  restaurantSlug: string;
  demoMode: boolean;
  timeZone: string;
}) {
  const todayLocalDate = zonedWallTimeFromInstant(new Date(), timeZone).date;

  const [users, setUsers] = useState<NeonUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [periodOption, setPeriodOption] = useState<PeriodOption>("this-month");
  const [customStart, setCustomStart] = useState(todayLocalDate);
  const [customEnd, setCustomEnd] = useState(todayLocalDate);
  const [rows, setRows] = useState<NeonAttendanceRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsReloadKey, setRowsReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setUsersError(null);
      if (demoMode) {
        const active = demoNeonUsers.filter((candidate) => candidate.isActive);
        setUsers(active);
        setSelectedIds(new Set(active.map((candidate) => candidate.id)));
        return;
      }
      const result = await getAttendanceUsersAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setUsersError(result.error);
        return;
      }
      setUsers(result.data);
      setSelectedIds(new Set(result.data.map((candidate) => candidate.id)));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [demoMode, restaurantSlug, usersReloadKey]);

  const period: AttendancePeriodSelection =
    periodOption === "custom"
      ? { type: "custom", start: customStart, end: customEnd }
      : { type: periodOption };
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(
    period,
    todayLocalDate,
  );

  useEffect(() => {
    // No setState here for the empty-selection case -- the render below
    // already shows a distinct "select at least one person" message
    // instead of the rows section whenever selectedIds is empty, so
    // there's nothing to synchronize back into state for that case (and
    // calling setState synchronously in an effect body, rather than from
    // a callback reacting to an external event, is exactly what
    // react-hooks/set-state-in-effect exists to catch).
    if (!users || selectedIds.size === 0) return;
    let cancelled = false;
    async function load() {
      setRowsLoading(true);
      setRowsError(null);
      const userIds = Array.from(selectedIds);
      if (demoMode) {
        const filtered = demoNeonAttendance.filter(
          (row) =>
            userIds.includes(row.userId) &&
            row.date >= periodStart &&
            row.date <= periodEnd,
        );
        if (!cancelled) {
          setRows(filtered);
          setRowsLoading(false);
        }
        return;
      }
      const result = await getAttendanceReportAction({
        restaurantSlug,
        userIds,
        period,
        todayLocalDate,
      });
      if (cancelled) return;
      if (!result.ok) {
        setRowsError(result.error);
        setRowsLoading(false);
        return;
      }
      setRows(result.data.rows);
      setRowsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // period/todayLocalDate are derived from periodStart/periodEnd (and
    // the constant demoMode/restaurantSlug), which are already listed --
    // including the derived object itself would just re-run this on every
    // render, since it's a new object each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    users,
    selectedIds,
    periodStart,
    periodEnd,
    demoMode,
    restaurantSlug,
    rowsReloadKey,
  ]);

  if (usersError) {
    return (
      <div className="space-y-4">
        <Header />
        <UnavailablePanel
          message={usersError}
          onRetry={() => setUsersReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  if (!users) {
    return (
      <div className="space-y-4">
        <Header />
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading team…
        </p>
      </div>
    );
  }

  const displayLabels = buildDisplayLabels(users);
  const allSelected = users.length > 0 && selectedIds.size === users.length;

  function toggleAll() {
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(users!.map((candidate) => candidate.id)),
    );
  }

  function togglePerson(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedSelected = users
    .filter((candidate) => selectedIds.has(candidate.id))
    .sort((a, b) =>
      (displayLabels.get(a.id) ?? "").localeCompare(
        displayLabels.get(b.id) ?? "",
      ),
    );

  const grandTotal = rows ? aggregateHours(rows) : null;

  return (
    <div className="space-y-4">
      <Header />

      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-[1fr_auto]">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">People</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-[var(--primary)]"
              />
              All
            </label>
            <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {users.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(candidate.id)}
                    onChange={() => togglePerson(candidate.id)}
                    className="accent-[var(--primary)]"
                  />
                  {displayLabels.get(candidate.id)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="attendance-period">Period</Label>
            <Select
              id="attendance-period"
              value={periodOption}
              onChange={(event) =>
                setPeriodOption(event.target.value as PeriodOption)
              }
            >
              <option value="this-month">This month</option>
              <option value="previous-month">Previous month</option>
              <option value="custom">Custom range</option>
            </Select>
            {periodOption === "custom" ? (
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label htmlFor="attendance-start" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="attendance-start"
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="attendance-end" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="attendance-end"
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {selectedIds.size === 0 ? (
        <p className="text-muted-foreground text-sm">
          Select at least one person to see their attendance.
        </p>
      ) : rowsError ? (
        <UnavailablePanel
          message={rowsError}
          onRetry={() => setRowsReloadKey((key) => key + 1)}
        />
      ) : rowsLoading || !rows ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading attendance…
        </p>
      ) : (
        <div className="space-y-4">
          {sortedSelected.map((person) => (
            <PersonSection
              key={person.id}
              label={displayLabels.get(person.id) ?? person.fullName}
              rows={rows.filter((row) => row.userId === person.id)}
            />
          ))}

          {sortedSelected.length > 1 && grandTotal ? (
            <Card>
              <CardContent className="flex items-center justify-between pt-4">
                <span className="text-sm font-semibold">
                  Grand total ({sortedSelected.length}{" "}
                  {sortedSelected.length === 1 ? "person" : "people"})
                </span>
                <span className="font-mono text-lg font-bold">
                  {formatHours(grandTotal.totalHours)}
                </span>
              </CardContent>
              {grandTotal.excludedRowCount > 0 ? (
                <CardContent className="text-muted-foreground pt-0 text-xs">
                  {grandTotal.excludedRowCount}{" "}
                  {grandTotal.excludedRowCount === 1 ? "row has" : "rows have"}{" "}
                  no recorded hours and{" "}
                  {grandTotal.excludedRowCount === 1 ? "is" : "are"} excluded
                  from this total.
                </CardContent>
              ) : null}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Module 5</Badge>
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">
        Attendance Report
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
        Live clock-in/clock-out data from the attendance system, read on demand
        and never stored here. Display only — hours shown are exactly what was
        recorded, with no calculation applied.
      </p>
    </div>
  );
}

function UnavailablePanel({
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

function PersonSection({
  label,
  rows,
}: {
  label: string;
  rows: NeonAttendanceRow[];
}) {
  const total = aggregateHours(rows);
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{label}</h2>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No attendance recorded for this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Clock in</th>
                  <th className="py-1.5 pr-3 font-medium">Clock out</th>
                  <th className="py-1.5 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1.5 pr-3">{row.date}</td>
                    <td className="py-1.5 pr-3">{row.clockIn ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {row.clockOut ?? "—"}
                      {row.autoClockedOut ? (
                        <Badge tone="warning" className="ml-1.5">
                          Auto-closed
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-1.5">
                      {row.hoursWorked === null
                        ? "—"
                        : formatHours(row.hoursWorked)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-border flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-medium">Total</span>
          <span className="font-mono font-semibold">
            {formatHours(total.totalHours)}
          </span>
        </div>
        {total.excludedRowCount > 0 ? (
          <p className="text-muted-foreground text-xs">
            {total.excludedRowCount}{" "}
            {total.excludedRowCount === 1 ? "row has" : "rows have"} no recorded
            hours and {total.excludedRowCount === 1 ? "is" : "are"} excluded
            from this total.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
