"use client";

import { useEffect, useState } from "react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getAttendanceAccessAction,
  getAttendanceDashboardTotalsAction,
  getAttendanceReportAction,
  getAttendanceUsersAction,
  type AttendanceAccessView,
  type AttendanceDashboardTotals,
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
  type HoursAggregate,
} from "@/features/attendance/domain/attendance-report";
import {
  demoNeonAttendance,
  demoNeonUsers,
} from "@/features/attendance/demo-data";
import { getWeekDates } from "@/features/schedules/domain/shift-planning";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

type PeriodOption = "this-month" | "previous-month" | "custom";

function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/**
 * Feature 019, demo mode only: demo mode has no real
 * `attendance_identity_links` data to draw from, so a demo manager keeps
 * seeing "all" (unchanged from Feature 018) and a demo server sees the
 * unlinked state -- an honest default (nobody has been linked yet is the
 * true starting state for any real restaurant adopting this feature too)
 * rather than fabricating a fake demo link.
 */
function demoAccessFor(user: SignedInUser): AttendanceAccessView {
  return user.role === "server" ? { scope: "unlinked" } : { scope: "all" };
}

/**
 * Feature 018/019. Every read here is client-triggered -- on mount, and
 * on every selection/period change -- deliberately never folded into
 * this app's shared initial page load (`loadPageData`) the way schedule/
 * tips/allocation are. That's what makes "a slow or unreachable Neon
 * never affects anything else in the app" actually true by construction.
 *
 * Feature 019: this tab is now visible to every signed-in role (moved
 * out of the manager-only gate in restaurant-operations-app.tsx) -- what
 * changed is that CONTENT is now scoped by `getAttendanceAccessAction`'s
 * server-resolved answer, never by `user.role` read client-side. The
 * server re-derives and enforces this independently on every action
 * call regardless of what this component renders; `access` here only
 * decides what to show, never what to allow.
 */
export function AttendanceReport({
  restaurantSlug,
  demoMode,
  timeZone,
  user,
}: {
  restaurantSlug: string;
  demoMode: boolean;
  timeZone: string;
  user: SignedInUser;
}) {
  const todayLocalDate = zonedWallTimeFromInstant(new Date(), timeZone).date;

  const [access, setAccess] = useState<AttendanceAccessView | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessReloadKey, setAccessReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAccessError(null);
      if (demoMode) {
        setAccess(demoAccessFor(user));
        return;
      }
      const result = await getAttendanceAccessAction({ restaurantSlug });
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
  }, [demoMode, restaurantSlug, user, accessReloadKey]);

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
  const [dashboard, setDashboard] = useState<AttendanceDashboardTotals | null>(
    null,
  );
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const scope = access?.scope ?? null;

  // Person list only exists for the "all" scope's picker -- a "self" or
  // "unlinked" viewer has nothing to pick (there is exactly one possible
  // selection, or none), so this effect is a no-op for them.
  useEffect(() => {
    if (scope !== "all") return;
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
  }, [scope, demoMode, restaurantSlug, usersReloadKey]);

  const period: AttendancePeriodSelection =
    periodOption === "custom"
      ? { type: "custom", start: customStart, end: customEnd }
      : { type: periodOption };
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(
    period,
    todayLocalDate,
  );

  // The ids to fetch rows for: "all" honors the picker's current
  // selection; "self" is always exactly the caller's own linked id,
  // regardless of anything client state could claim -- the server
  // re-derives and enforces this same substitution independently, this
  // is just what triggers the right fetch.
  const reportUserIds: number[] | null =
    scope === "all"
      ? Array.from(selectedIds)
      : scope === "self" && access?.scope === "self"
        ? [access.neonUserId]
        : scope === "unlinked"
          ? []
          : null;

  useEffect(() => {
    if (!reportUserIds || reportUserIds.length === 0) {
      setRows(scope === "unlinked" ? [] : null);
      return;
    }
    let cancelled = false;
    async function load() {
      setRowsLoading(true);
      setRowsError(null);
      if (demoMode) {
        const filtered = demoNeonAttendance.filter(
          (row) =>
            reportUserIds!.includes(row.userId) &&
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
        userIds: reportUserIds!,
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
    scope,
    reportUserIds?.join(","),
    periodStart,
    periodEnd,
    demoMode,
    restaurantSlug,
    rowsReloadKey,
  ]);

  // Day/week/month are independent of the person/period picker above --
  // fetched once scope is known, never refetched on filter interaction.
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    async function load() {
      setDashboardError(null);
      if (demoMode) {
        const ids =
          access!.scope === "self"
            ? [access.neonUserId]
            : access!.scope === "all"
              ? demoNeonUsers
                  .filter((candidate) => candidate.isActive)
                  .map((candidate) => candidate.id)
              : [];
        const zero: HoursAggregate = { totalHours: 0, excludedRowCount: 0 };
        if (ids.length === 0) {
          if (!cancelled) setDashboard({ day: zero, week: zero, month: zero });
          return;
        }
        const inRange = (row: (typeof demoNeonAttendance)[number], start: string, end: string) =>
          ids.includes(row.userId) && row.date >= start && row.date <= end;
        const weekDates = getWeekDates(todayLocalDate);
        const { start: monthStart, end: monthEnd } = resolvePeriodRange(
          { type: "this-month" },
          todayLocalDate,
        );
        if (!cancelled) {
          setDashboard({
            day: aggregateHours(
              demoNeonAttendance.filter((row) =>
                inRange(row, todayLocalDate, todayLocalDate),
              ),
            ),
            week: aggregateHours(
              demoNeonAttendance.filter((row) =>
                inRange(row, weekDates[0], weekDates[6]),
              ),
            ),
            month: aggregateHours(
              demoNeonAttendance.filter((row) =>
                inRange(row, monthStart, monthEnd),
              ),
            ),
          });
        }
        return;
      }
      const result = await getAttendanceDashboardTotalsAction({
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
  }, [access, demoMode, restaurantSlug, todayLocalDate]);

  if (accessError) {
    return (
      <div className="space-y-4">
        <Header />
        <UnavailablePanel
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
        <DashboardTiles
          totals={dashboard}
          error={dashboardError}
          scope="unlinked"
          selectedPeriodTotal={null}
        />
        <Card>
          <CardContent className="space-y-1.5 pt-4">
            <p className="text-sm font-semibold">
              Your account isn&apos;t linked to the attendance system yet.
            </p>
            <p className="text-muted-foreground text-sm">
              Ask a manager or owner to link your account from the Team tab.
              Once linked, your clock-in/out history and hours will show up
              here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (access.scope === "all" && (usersError || !users)) {
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
    return (
      <div className="space-y-4">
        <Header />
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading team…
        </p>
      </div>
    );
  }

  const grandTotal = rows ? aggregateHours(rows) : null;

  if (access.scope === "self") {
    const label = access.person
      ? (buildDisplayLabels([access.person]).get(access.person.id) ??
        access.person.fullName)
      : "Your attendance";
    return (
      <div className="space-y-4">
        <Header />
        <DashboardTiles
          totals={dashboard}
          error={dashboardError}
          scope="self"
          selectedPeriodTotal={grandTotal}
        />
        <PeriodPicker
          periodOption={periodOption}
          setPeriodOption={setPeriodOption}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
        {rowsError ? (
          <UnavailablePanel
            message={rowsError}
            onRetry={() => setRowsReloadKey((key) => key + 1)}
          />
        ) : rowsLoading || !rows ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Loading attendance…
          </p>
        ) : (
          <PersonSection label={label} rows={rows} timeZone={timeZone} />
        )}
      </div>
    );
  }

  // access.scope === "all" from here on -- users is guaranteed non-null.
  const activeUsers = users!;
  const displayLabels = buildDisplayLabels(activeUsers);
  const allSelected =
    activeUsers.length > 0 && selectedIds.size === activeUsers.length;

  function toggleAll() {
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(activeUsers.map((candidate) => candidate.id)),
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

  const sortedSelected = activeUsers
    .filter((candidate) => selectedIds.has(candidate.id))
    .sort((a, b) =>
      (displayLabels.get(a.id) ?? "").localeCompare(
        displayLabels.get(b.id) ?? "",
      ),
    );

  return (
    <div className="space-y-4">
      <Header />
      <DashboardTiles
        totals={dashboard}
        error={dashboardError}
        scope="all"
        selectedPeriodTotal={grandTotal}
      />

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
              {activeUsers.map((candidate) => (
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

          <PeriodPicker
            periodOption={periodOption}
            setPeriodOption={setPeriodOption}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />
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
              timeZone={timeZone}
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

function PeriodPicker({
  periodOption,
  setPeriodOption,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}: {
  periodOption: PeriodOption;
  setPeriodOption: (option: PeriodOption) => void;
  customStart: string;
  setCustomStart: (value: string) => void;
  customEnd: string;
  setCustomEnd: (value: string) => void;
}) {
  return (
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
  );
}

function DashboardTile({ label, hours }: { label: string; hours: number | null }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-muted-foreground text-xs font-medium uppercase">
          {label}
        </p>
        <p className="font-mono text-2xl font-bold">
          {hours === null ? "—" : formatHours(hours)}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Feature 019. Day/week/month are always "everyone, today/this week/this
 * month" for a privileged viewer and "just me" for a self-scoped one --
 * independent of the person/period picker below. The fourth tile needs
 * no separate query: it's the exact same grand total already computed
 * from whichever rows are currently loaded for the report, just also
 * surfaced here for visibility.
 */
function DashboardTiles({
  totals,
  error,
  scope,
  selectedPeriodTotal,
}: {
  totals: AttendanceDashboardTotals | null;
  error: string | null;
  scope: "all" | "self" | "unlinked";
  selectedPeriodTotal: HoursAggregate | null;
}) {
  const who = scope === "all" ? "Everyone" : "Your";
  if (error) {
    return (
      <p className="text-muted-foreground text-xs">
        Dashboard totals unavailable right now.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <DashboardTile
        label={`${who} — today`}
        hours={totals?.day.totalHours ?? null}
      />
      <DashboardTile
        label={`${who} — this week`}
        hours={totals?.week.totalHours ?? null}
      />
      <DashboardTile
        label={`${who} — this month`}
        hours={totals?.month.totalHours ?? null}
      />
      <DashboardTile
        label="Selected period"
        hours={selectedPeriodTotal?.totalHours ?? null}
      />
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

// clockIn/clockOut are full ISO instant strings -- converted to the
// restaurant's local wall-clock time here, at render time, the same way
// every other real-mode timestamp in this app is displayed
// (zonedWallTimeFromInstant), rather than showing a raw UTC time that
// wouldn't match what actually happened on the floor.
function formatClockTime(iso: string, timeZone: string): string {
  return zonedWallTimeFromInstant(new Date(iso), timeZone).time;
}

function PersonSection({
  label,
  rows,
  timeZone,
}: {
  label: string;
  rows: NeonAttendanceRow[];
  timeZone: string;
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
                    <td className="py-1.5 pr-3">
                      {row.clockIn
                        ? formatClockTime(row.clockIn, timeZone)
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {row.clockOut
                        ? formatClockTime(row.clockOut, timeZone)
                        : "—"}
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
