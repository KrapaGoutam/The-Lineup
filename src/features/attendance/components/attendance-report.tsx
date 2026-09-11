"use client";

import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  getAttendanceAccessAction,
  getAttendanceDashboardTotalsAction,
  getAttendanceReportAction,
  getAttendanceUsersAction,
  type AttendanceAccessView,
  type AttendanceDashboardTotals,
} from "@/features/attendance/actions/attendance-actions";
import { AttendanceMonthNav } from "@/features/attendance/components/attendance-month-nav";
import { AttendancePrintDialog } from "@/features/attendance/components/attendance-print-dialog";
import { CombinedStatementDialog } from "@/features/payroll/components/combined-statement-dialog";
import { ReportLetterhead } from "@/components/print/report-letterhead";
import type {
  NeonAttendanceRow,
  NeonUser,
} from "@/features/attendance/data/attendance-data";
import {
  MONTH_NAMES,
  calendarWeekday,
  computeAttendanceSummary,
  dayOfMonth,
  daysInMonth,
} from "@/features/attendance/domain/attendance-metrics";
import {
  aggregateHours,
  buildDisplayLabels,
  resolvePeriodRange,
  summarizeAllStaff,
  type AttendancePeriodSelection,
  type HoursAggregate,
} from "@/features/attendance/domain/attendance-report";
import {
  demoNeonAttendance,
  demoNeonUsers,
} from "@/features/attendance/demo-data";
import { getWeekDates } from "@/features/schedules/domain/shift-planning";
import {
  attendanceRosterFilename,
  attendanceSingleFilename,
  triggerPrintWithFilename,
} from "@/lib/print-utils";
import { zonedWallTimeFromInstant } from "@/lib/timezone";
import { cn } from "@/lib/utils";

function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/**
 * Feature 019, demo mode only: demo mode has no real
 * `attendance_identity_links` table to draw from. A demo manager keeps
 * seeing "all" (unchanged from Feature 018); a demo server is scoped by
 * the in-memory link a manager deliberately set from Team, or sees the
 * honest unlinked default until that happens.
 */
function demoAccessFor(
  user: SignedInUser,
  demoNeonUserId: number | null,
): AttendanceAccessView {
  if (user.role !== "server") return { scope: "all" };
  if (demoNeonUserId === null) return { scope: "unlinked" };
  return {
    scope: "self",
    neonUserId: demoNeonUserId,
    person:
      demoNeonUsers.find((candidate) => candidate.id === demoNeonUserId) ??
      null,
  };
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
  demoNeonUserId = null,
}: {
  restaurantSlug: string;
  demoMode: boolean;
  timeZone: string;
  user: SignedInUser;
  demoNeonUserId?: number | null;
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
        setAccess(demoAccessFor(user, demoNeonUserId));
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
  }, [demoMode, restaurantSlug, user, demoNeonUserId, accessReloadKey]);

  const [users, setUsers] = useState<NeonUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  // Feature 025: which one person the "all"-scope switcher is currently
  // showing -- replaces the old always-on checkbox multi-select (see
  // tasks/current-task.md's Reconciliation 2). Defaulted once the user
  // list loads, below.
  // Feature 029 Phase 0: the switcher's selection can now also be the
  // literal string "all" -- every active employee's records combined,
  // rather than exactly one. Never the default; a manager opts into it.
  const [activePersonId, setActivePersonId] = useState<number | "all" | null>(
    null,
  );
  // Feature 025: the restaurant's own current real month/year
  // (todayLocalDate-derived, the same "today" every other real-mode
  // feature already uses) -- the navigator's own upper bound, and where
  // browsing starts by default. Captured once at mount, same reasoning
  // as Feature 028's date navigator: this stays "today" for the whole
  // session even if the browser happens to be open across a midnight
  // rollover, rather than the navigator's own ceiling silently moving
  // out from under someone mid-session.
  const [{ maxYear, maxMonth }] = useState(() => {
    const [year, month] = todayLocalDate.split("-").map(Number);
    return { maxYear: year, maxMonth: month };
  });
  const [selectedYear, setSelectedYear] = useState(maxYear);
  const [selectedMonth, setSelectedMonth] = useState(maxMonth);
  const [rows, setRows] = useState<NeonAttendanceRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsReloadKey, setRowsReloadKey] = useState(0);
  const [dashboard, setDashboard] = useState<AttendanceDashboardTotals | null>(
    null,
  );
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Feature 025: multi-select print support. `printJob` is set the
  // moment there's something ready to print -- either directly (`self`
  // scope, reusing whatever's already loaded, no extra fetch) or after
  // the dialog's own fetch resolves (`all` scope, which may target
  // people other than whoever is currently being browsed). The effect
  // below fires only after that state has actually committed to the DOM
  // (React runs effects after the render they were scheduled in), which
  // is what makes `window.print()` reliably see the freshly rendered
  // printable content instead of racing ahead of it.
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printJob, setPrintJob] = useState<{
    sections: Array<{ label: string; rows: NeonAttendanceRow[] }>;
    // Feature 030 bug fix: carried on the job itself (captured at the
    // moment it's built) rather than read from `selectedYear`/
    // `selectedMonth` when the effect fires -- avoids a stale filename
    // if the browsed month somehow changes between the two.
    year: number;
    month: number;
  } | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  // Feature 031: "all" is only ever reachable from the "all"-scope
  // switcher's own "All employees" filter (never for a self-scoped
  // server, who only ever has one possible statement -- their own).
  const [statementTarget, setStatementTarget] = useState<
    | { scope: "single"; neonUserId: number; year: number; month: number }
    | { scope: "all"; neonUserIds: number[]; year: number; month: number }
    | null
  >(null);

  useEffect(() => {
    if (!printJob) return;
    // A single section is one person's own report (the "self"-scope
    // Print button, or "all"-scope's "Print current employee"); more
    // than one is a roster print (the dialog's "selected"/"all" choice,
    // or the "All employees" filter's direct Print).
    const filename =
      printJob.sections.length === 1
        ? attendanceSingleFilename(
            printJob.sections[0].label,
            printJob.year,
            printJob.month,
          )
        : attendanceRosterFilename(printJob.year, printJob.month);
    triggerPrintWithFilename(filename);
  }, [printJob]);

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
        return;
      }
      const result = await getAttendanceUsersAction({ restaurantSlug });
      if (cancelled) return;
      if (!result.ok) {
        setUsersError(result.error);
        return;
      }
      setUsers(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [scope, demoMode, restaurantSlug, usersReloadKey]);

  // Sorted once here, at render time, so both the default-selection
  // adjustment below and the "all"-scope render further down share
  // exactly the same order and labels -- never two independently
  // recomputed sorts that could disagree.
  const activeUserDisplayLabels = users ? buildDisplayLabels(users) : null;
  const sortedActiveUsers = users
    ? [...users].sort((a, b) =>
        (activeUserDisplayLabels?.get(a.id) ?? "").localeCompare(
          activeUserDisplayLabels?.get(b.id) ?? "",
        ),
      )
    : [];
  // Defaults (or corrects, if a previously-active id ever stopped
  // existing in a fresh list) the switcher to the first person
  // alphabetically by display label -- adjusted during render, this
  // file's own established pattern (see the initialContext/syncedContext
  // handling elsewhere in this app), rather than a separate effect, so
  // there's never a render where the list is ready but nobody is shown.
  if (
    scope === "all" &&
    sortedActiveUsers.length > 0 &&
    activePersonId !== "all" &&
    !sortedActiveUsers.some((candidate) => candidate.id === activePersonId)
  ) {
    setActivePersonId(sortedActiveUsers[0].id);
  }

  const period: AttendancePeriodSelection = {
    type: "month",
    year: selectedYear,
    month: selectedMonth,
  };
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(
    period,
    todayLocalDate,
  );

  // Feature 025, "all" scope only: fetches whichever people the print
  // dialog resolved to (which may be more than just the currently
  // browsed person) for the *currently browsed* month, then hands the
  // result to the print-trigger effect above. Reuses
  // getAttendanceReportAction rather than a new action -- it already
  // accepts multiple userIds for exactly this scope.
  async function printPeople(targetIds: number[]) {
    setPrintDialogOpen(false);
    setPrintError(null);
    const labelFor = (id: number) =>
      activeUserDisplayLabels?.get(id) ?? `#${id}`;
    if (demoMode) {
      const filtered = demoNeonAttendance.filter(
        (row) =>
          targetIds.includes(row.userId) &&
          row.date >= periodStart &&
          row.date <= periodEnd,
      );
      setPrintJob({
        sections: targetIds.map((id) => ({
          label: labelFor(id),
          rows: filtered.filter((row) => row.userId === id),
        })),
        year: selectedYear,
        month: selectedMonth,
      });
      return;
    }
    const result = await getAttendanceReportAction({
      restaurantSlug,
      userIds: targetIds,
      period,
      todayLocalDate,
    });
    if (!result.ok) {
      setPrintError(result.error);
      return;
    }
    setPrintJob({
      sections: targetIds.map((id) => ({
        label: labelFor(id),
        rows: result.data.rows.filter((row) => row.userId === id),
      })),
      year: selectedYear,
      month: selectedMonth,
    });
  }

  // The ids to fetch rows for: "all" scope is either every active
  // employee (the switcher's own "all" filter) or exactly the one active
  // switcher selection; "self" is always exactly the caller's own linked
  // id, regardless of anything client state could claim -- the server
  // re-derives and enforces this same substitution independently, this
  // is just what triggers the right fetch.
  const reportUserIds: number[] | null =
    scope === "all"
      ? activePersonId === "all"
        ? sortedActiveUsers.map((candidate) => candidate.id)
        : activePersonId !== null
          ? [activePersonId]
          : []
      : scope === "self" && access?.scope === "self"
        ? [access.neonUserId]
        : scope === "unlinked"
          ? []
          : null;
  const reportUserIdsKey = reportUserIds?.join(",") ?? null;

  useEffect(() => {
    if (!reportUserIds || reportUserIds.length === 0) return;
    const requestedUserIds = reportUserIds;
    let cancelled = false;
    async function load() {
      setRowsLoading(true);
      setRowsError(null);
      if (demoMode) {
        const filtered = demoNeonAttendance.filter(
          (row) =>
            requestedUserIds.includes(row.userId) &&
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
        userIds: requestedUserIds,
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
    reportUserIdsKey,
    periodStart,
    periodEnd,
    demoMode,
    restaurantSlug,
    rowsReloadKey,
  ]);

  // Day/week/month are independent of the person/period picker above --
  // fetched once scope is known, never refetched on filter interaction.
  useEffect(() => {
    const dashboardAccess = access;
    if (!dashboardAccess) return;
    let cancelled = false;
    async function load(currentAccess: AttendanceAccessView) {
      setDashboardError(null);
      if (demoMode) {
        const ids =
          currentAccess.scope === "self"
            ? [currentAccess.neonUserId]
            : currentAccess.scope === "all"
              ? demoNeonUsers
                  .filter((candidate) => candidate.isActive)
                  .map((candidate) => candidate.id)
              : [];
        const zero: HoursAggregate = { totalHours: 0, excludedRowCount: 0 };
        if (ids.length === 0) {
          if (!cancelled) setDashboard({ day: zero, week: zero, month: zero });
          return;
        }
        const inRange = (
          row: (typeof demoNeonAttendance)[number],
          start: string,
          end: string,
        ) => ids.includes(row.userId) && row.date >= start && row.date <= end;
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
    load(dashboardAccess);
    return () => {
      cancelled = true;
    };
  }, [access, demoMode, restaurantSlug, todayLocalDate]);

  if (accessError) {
    return (
      <div className="space-y-4 print:hidden">
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
      <div className="space-y-4 print:hidden">
        <Header />
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading…
        </p>
      </div>
    );
  }

  if (access.scope === "unlinked") {
    return (
      <div className="space-y-4 print:hidden">
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
        <div className="space-y-4 print:hidden">
          <Header />
          <UnavailablePanel
            message={usersError}
            onRetry={() => setUsersReloadKey((key) => key + 1)}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4 print:hidden">
        <Header />
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Loading team…
        </p>
      </div>
    );
  }

  const visibleRows = reportUserIds?.length ? rows : null;
  const grandTotal = visibleRows ? aggregateHours(visibleRows) : null;

  if (access.scope === "self") {
    const label = access.person
      ? (buildDisplayLabels([access.person]).get(access.person.id) ??
        access.person.fullName)
      : "Your attendance";
    return (
      <div className="space-y-4">
        {/* Feature 033: everything screen-only for this scope lives in
            one `print:hidden` wrapper, kept as a *sibling* of the
            statement dialog and `PrintableReport` below rather than an
            ancestor of them -- an ancestor with `print:hidden` would
            hide those print-only descendants too, since `display: none`
            on a parent always wins over a child's own `print:block`. */}
        <div className="space-y-4 print:hidden">
          <Header />
          <DashboardTiles
            totals={dashboard}
            error={dashboardError}
            scope="self"
            selectedPeriodTotal={grandTotal}
          />
          <div className="flex flex-wrap items-center gap-3">
            <AttendanceMonthNav
              year={selectedYear}
              month={selectedMonth}
              maxYear={maxYear}
              maxMonth={maxMonth}
              onChange={({ year, month }) => {
                setSelectedYear(year);
                setSelectedMonth(month);
              }}
            />
            {rows ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPrintJob({
                      sections: [{ label, rows }],
                      year: selectedYear,
                      month: selectedMonth,
                    })
                  }
                >
                  <Printer aria-hidden="true" /> Print
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setStatementTarget({
                      scope: "single",
                      neonUserId: access.neonUserId,
                      year: selectedYear,
                      month: selectedMonth,
                    })
                  }
                >
                  <FileText aria-hidden="true" /> Monthly Statement
                </Button>
              </div>
            ) : null}
          </div>
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
            <PersonSection
              label={label}
              rows={rows}
              timeZone={timeZone}
              year={selectedYear}
              month={selectedMonth}
            />
          )}
        </div>
        {statementTarget ? (
          <CombinedStatementDialog
            restaurantSlug={restaurantSlug}
            target={statementTarget}
            year={statementTarget.year}
            month={statementTarget.month}
            timeZone={timeZone}
            onClose={() => setStatementTarget(null)}
          />
        ) : null}
        {printJob ? (
          <PrintableReport
            sections={printJob.sections}
            timeZone={timeZone}
            year={selectedYear}
            month={selectedMonth}
          />
        ) : null}
      </div>
    );
  }

  // access.scope === "all" from here on -- sortedActiveUsers (computed
  // above, alongside the default-selection adjustment) is the single
  // source of truth for both the switcher's options and their order.
  // `activePersonId === "all"` never matches any numeric `candidate.id`,
  // so `activePerson` is naturally null in that case too.
  const activePerson =
    sortedActiveUsers.find((candidate) => candidate.id === activePersonId) ??
    null;
  const showingAll = activePersonId === "all";

  // Feature 029 Phase 0: prints every active employee's already-loaded
  // `rows` (fetched together, since `reportUserIds` already resolved to
  // everyone once "All" is selected) as one combined multi-section
  // document -- the exact same `PrintableReport` the dialog's own "Print
  // all employees" choice already produces, just reached directly
  // instead of through a dialog (mirroring how `self` scope's Print
  // button also skips the dialog: there is only one possible choice once
  // "All" is already the selection).
  function printAll() {
    if (!rows) return;
    setPrintError(null);
    setPrintJob({
      sections: sortedActiveUsers.map((candidate) => ({
        label: activeUserDisplayLabels?.get(candidate.id) ?? candidate.fullName,
        rows: rows.filter((row) => row.userId === candidate.id),
      })),
      year: selectedYear,
      month: selectedMonth,
    });
  }

  return (
    <div className="space-y-4">
      {/* Feature 033: same `print:hidden` sibling-wrapper pattern as the
          "self" scope above -- see that comment for why this can't be
          on the outer div itself. */}
      <div className="space-y-4 print:hidden">
        <Header />
        <DashboardTiles
          totals={dashboard}
          error={dashboardError}
          scope="all"
          selectedPeriodTotal={grandTotal}
        />

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4">
            <div className="border-border bg-secondary rounded-2xl border p-1.5">
              <label htmlFor="attendance-active-person" className="sr-only">
                Employee
              </label>
              <Select
                id="attendance-active-person"
                value={activePersonId ?? ""}
                onChange={(event) =>
                  setActivePersonId(
                    event.target.value === "all"
                      ? "all"
                      : Number(event.target.value),
                  )
                }
                disabled={sortedActiveUsers.length === 0}
                className="text-foreground [&>option]:bg-popover [&>option]:text-popover-foreground w-auto min-w-[11rem] border-0 bg-transparent font-semibold"
              >
                {sortedActiveUsers.length === 0 ? (
                  <option value="">No active employees</option>
                ) : (
                  <>
                    <option value="all">All employees</option>
                    {sortedActiveUsers.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {activeUserDisplayLabels?.get(candidate.id) ??
                          candidate.fullName}
                      </option>
                    ))}
                  </>
                )}
              </Select>
            </div>

            <AttendanceMonthNav
              year={selectedYear}
              month={selectedMonth}
              maxYear={maxYear}
              maxMonth={maxMonth}
              onChange={({ year, month }) => {
                setSelectedYear(year);
                setSelectedMonth(month);
              }}
            />

            <Button
              variant="secondary"
              onClick={() =>
                showingAll ? printAll() : setPrintDialogOpen(true)
              }
              disabled={showingAll ? !rows : !activePerson}
            >
              <Printer aria-hidden="true" /> Print
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                setStatementTarget(
                  showingAll
                    ? {
                        scope: "all",
                        neonUserIds: sortedActiveUsers.map(
                          (candidate) => candidate.id,
                        ),
                        year: selectedYear,
                        month: selectedMonth,
                      }
                    : {
                        scope: "single",
                        // `activePerson` is guaranteed non-null here --
                        // this branch only runs when the button itself
                        // isn't disabled.
                        neonUserId: activePerson!.id,
                        year: selectedYear,
                        month: selectedMonth,
                      },
                )
              }
              disabled={
                showingAll ? sortedActiveUsers.length === 0 : !activePerson
              }
            >
              <FileText aria-hidden="true" />{" "}
              {showingAll ? "Monthly Statements (All)" : "Monthly Statement"}
            </Button>
          </CardContent>
        </Card>

        {printError ? (
          <div className="border-destructive/30 bg-destructive/10 flex items-center justify-between rounded-xl border px-4 py-2 text-sm">
            <span className="text-destructive">{printError}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={() => setPrintError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {printDialogOpen && activePerson ? (
          <AttendancePrintDialog
            currentPersonId={activePerson.id}
            people={sortedActiveUsers.map((candidate) => ({
              id: candidate.id,
              label:
                activeUserDisplayLabels?.get(candidate.id) ??
                candidate.fullName,
            }))}
            onClose={() => setPrintDialogOpen(false)}
            onConfirm={printPeople}
          />
        ) : null}

        {showingAll ? (
          rowsError ? (
            <UnavailablePanel
              message={rowsError}
              onRetry={() => setRowsReloadKey((key) => key + 1)}
            />
          ) : rowsLoading || !rows ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              Loading attendance…
            </p>
          ) : (
            <AllStaffSection
              rows={rows}
              people={sortedActiveUsers}
              displayLabels={activeUserDisplayLabels}
              timeZone={timeZone}
              year={selectedYear}
              month={selectedMonth}
            />
          )
        ) : !activePerson ? (
          <p className="text-muted-foreground text-sm">
            No active employees to show.
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
          <PersonSection
            label={
              activeUserDisplayLabels?.get(activePerson.id) ??
              activePerson.fullName
            }
            rows={rows}
            timeZone={timeZone}
            year={selectedYear}
            month={selectedMonth}
          />
        )}
      </div>
      {statementTarget ? (
        <CombinedStatementDialog
          restaurantSlug={restaurantSlug}
          target={statementTarget}
          year={statementTarget.year}
          month={statementTarget.month}
          timeZone={timeZone}
          onClose={() => setStatementTarget(null)}
        />
      ) : null}
      {printJob ? (
        <PrintableReport
          sections={printJob.sections}
          timeZone={timeZone}
          year={selectedYear}
          month={selectedMonth}
        />
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Module 5</Badge>
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">Attendance</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
        Read straight from the clock-in system. Hours are shown exactly as
        recorded — nothing here is calculated.
      </p>
    </div>
  );
}

function DashboardTile({
  label,
  hours,
}: {
  label: string;
  hours: number | null;
}) {
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

// Feature 025 & 030. Hidden on screen, shown only when printing -- corporate
// letterhead print template with 1-employee-per-page pagination and
// official verification signatures.
const PRINT_AREA_ID = "attendance-print-area";

function PrintableReport({
  sections,
  timeZone,
  year,
  month,
}: {
  sections: Array<{ label: string; rows: NeonAttendanceRow[] }>;
  timeZone: string;
  year: number;
  month: number;
}) {
  const monthLabel = MONTH_NAMES[month - 1];
  return (
    <div id={PRINT_AREA_ID} className="hidden print:block">
      {sections.map((section) => {
        const summary = computeAttendanceSummary(section.rows);
        return (
          <div
            key={section.label}
            className="print-page-break box-border flex flex-col p-6"
          >
            <ReportLetterhead
              reportTitle="Monthly Attendance Timesheet"
              employeeName={section.label}
              periodName={`${monthLabel} ${year}`}
            />

            {/* Attendance Summary KPIs */}
            <div className="my-2 grid grid-cols-3 gap-4 rounded-lg border border-gray-300 bg-gray-50/50 p-3">
              <div>
                <span className="block text-[11px] font-semibold text-gray-500 uppercase">
                  Days Worked
                </span>
                <span className="font-mono text-base font-bold text-black">
                  {summary.daysWorked}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-gray-500 uppercase">
                  Total Hours
                </span>
                <span className="font-mono text-base font-bold text-black">
                  {formatHours(summary.totalHours)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-gray-500 uppercase">
                  Average / Day
                </span>
                <span className="font-mono text-base font-bold text-black">
                  {formatHours(summary.avgPerDay)}
                </span>
              </div>
            </div>

            {/* Timesheet Shift Records */}
            <div className="flex-1">
              <table className="print-timesheet-table w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-black bg-gray-100">
                    <th className="px-2 py-2 font-bold text-black">Date</th>
                    <th className="px-2 py-2 font-bold text-black">Day</th>
                    <th className="px-2 py-2 font-bold text-black">Clock In</th>
                    <th className="px-2 py-2 font-bold text-black">
                      Clock Out
                    </th>
                    <th className="px-2 py-2 text-right font-bold text-black">
                      Hours
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-4 text-center text-gray-500 italic"
                      >
                        No attendance records logged for this period.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row) => {
                      const isOpenShift = !row.clockOut && !row.autoClockedOut;
                      const status = row.autoClockedOut
                        ? " (Auto-closed)"
                        : isOpenShift
                          ? " (Open shift)"
                          : "";
                      return (
                        <tr key={row.id} className="border-b border-gray-200">
                          <td className="px-2 py-1.5 font-mono">{row.date}</td>
                          <td className="px-2 py-1.5 text-gray-600">
                            {calendarWeekday(row.date)}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.clockIn
                              ? formatClockTime(row.clockIn, timeZone)
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {(row.clockOut
                              ? formatClockTime(row.clockOut, timeZone)
                              : "—") + status}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold">
                            {row.hoursWorked === null
                              ? "—"
                              : formatHours(row.hoursWorked)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-bold">
                    <td
                      colSpan={4}
                      className="px-2 py-2 text-right text-xs tracking-wider uppercase"
                    >
                      Total {monthLabel} Hours:
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-sm">
                      {formatHours(summary.totalHours)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Verification & Sign-off Block. Feature 033: `mt-8 pt-6`
                (a full extra inch of dead space before a table that can
                already run long) was the last thing pushing a standard
                pay period onto a 2nd page -- `break-inside-avoid` keeps
                the block itself from splitting across a page boundary
                once the rest of the page is tight enough for it to fit
                the bottom of page 1. */}
            <div className="mt-2 break-inside-avoid border-t border-gray-300 pt-3">
              <div className="grid grid-cols-2 gap-12 text-xs">
                <div>
                  <div className="mb-1.5 border-b border-black pb-1" />
                  <p className="font-semibold text-black">
                    Employee Signature &amp; Date
                  </p>
                  <p className="text-[11px] text-gray-500">
                    I certify that the above hours worked are accurate and
                    complete.
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 border-b border-black pb-1" />
                  <p className="font-semibold text-black">
                    Manager / Supervisor Signature &amp; Date
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Verified and approved for restaurant payroll processing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
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

function StatTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-1.5 rounded-2xl border px-5 py-4">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-3xl leading-none font-semibold tracking-tight tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-muted-foreground text-xs leading-snug">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Feature 029 Phase 0. The "All employees" combined view: two org-wide
 * stat cards (reusing `StatTile`'s own look) followed by one
 * `PersonSection` per active employee -- unchanged and unmodified,
 * exactly the same component the single-person view already renders,
 * just once per person instead of once total. Employees with zero rows
 * this period are still listed (their own `PersonSection` already
 * renders the established "No attendance recorded for this period."
 * state) -- an honestly complete roster, not a filtered one.
 */
function AllStaffSection({
  rows,
  people,
  displayLabels,
  timeZone,
  year,
  month,
}: {
  rows: NeonAttendanceRow[];
  people: NeonUser[];
  displayLabels: Map<number, string> | null;
  timeZone: string;
  year: number;
  month: number;
}) {
  const summary = summarizeAllStaff(rows);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Total shifts"
          value={String(summary.totalShifts)}
          hint="across all staff"
        />
        <StatTile
          label="Total hours"
          value={formatHours(summary.totalHours)}
          accent
          hint="across all staff"
        />
      </div>
      {people.map((person) => (
        <PersonSection
          key={person.id}
          label={displayLabels?.get(person.id) ?? person.fullName}
          rows={rows.filter((row) => row.userId === person.id)}
          timeZone={timeZone}
          year={year}
          month={month}
        />
      ))}
    </div>
  );
}

function PersonSection({
  label,
  rows,
  timeZone,
  year,
  month,
}: {
  label: string;
  rows: NeonAttendanceRow[];
  timeZone: string;
  /** The currently browsed month/year, for the "of N days in <Month>" hint. */
  year: number;
  month: number;
}) {
  const summary = computeAttendanceSummary(rows);
  const monthLabel = MONTH_NAMES[month - 1];
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{label}</h2>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {rows.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Days worked"
              value={String(summary.daysWorked)}
              hint={`of ${daysInMonth(year, month)} days in ${monthLabel}`}
            />
            <StatTile
              label="Total hours"
              value={formatHours(summary.totalHours)}
              accent
              hint={
                summary.excludedRowCount > 0
                  ? `${summary.excludedRowCount} row${summary.excludedRowCount === 1 ? "" : "s"} excluded — no hours recorded`
                  : undefined
              }
            />
            <StatTile
              label="Avg per day"
              value={formatHours(summary.avgPerDay)}
              hint="across days actually worked"
            />
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No attendance recorded for this period.
          </p>
        ) : (
          <>
            {/* Desktop/tablet: full table. Below sm, the condensed card
                ledger (section 2f of the design reference) replaces it --
                same rows, touch-sized and scannable at a glance instead of
                scrolling a table sideways. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-xs uppercase">
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Day</th>
                    <th className="py-1.5 pr-3 font-medium">Clock in</th>
                    <th className="py-1.5 pr-3 font-medium">Clock out</th>
                    <th className="py-1.5 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((row) => {
                    // A genuinely still-open shift -- never clocked out,
                    // and not the (already-handled) auto-closed case -- is
                    // its own distinct, more urgent state: the row's Hours
                    // cell has nothing to show at all, not just an
                    // auto-closed guess at when they left.
                    const isOpenShift = !row.clockOut && !row.autoClockedOut;
                    return (
                      <tr key={row.id}>
                        <td className="py-1.5 pr-3">{row.date}</td>
                        <td className="text-muted-foreground py-1.5 pr-3">
                          {calendarWeekday(row.date)}
                        </td>
                        <td className="py-1.5 pr-3">
                          {row.clockIn
                            ? formatClockTime(row.clockIn, timeZone)
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className="flex items-center gap-1.5">
                            {row.clockOut
                              ? formatClockTime(row.clockOut, timeZone)
                              : "—"}
                            {row.autoClockedOut ? (
                              <Badge tone="warning">Auto-closed</Badge>
                            ) : null}
                            {isOpenShift ? (
                              <Badge tone="danger">Open shift</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-1.5">
                          {row.hoursWorked === null
                            ? "—"
                            : formatHours(row.hoursWorked)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-border border-border divide-y rounded-2xl border sm:hidden">
              {rows.map((row) => {
                const isOpenShift = !row.clockOut && !row.autoClockedOut;
                const day = dayOfMonth(row.date);
                const weekday = calendarWeekday(row.date);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 px-3.5 py-3"
                  >
                    <div className="w-11 flex-none">
                      <span className="font-mono text-base leading-tight font-semibold tabular-nums">
                        {day}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">
                        {weekday}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm tabular-nums">
                        {row.clockIn
                          ? formatClockTime(row.clockIn, timeZone)
                          : "—"}
                        {" – "}
                        {row.clockOut
                          ? formatClockTime(row.clockOut, timeZone)
                          : isOpenShift
                            ? "open"
                            : "—"}
                      </span>
                      {row.autoClockedOut || isOpenShift ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {row.autoClockedOut ? "Auto-closed" : "Open shift"}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "font-mono text-base font-semibold tabular-nums",
                        isOpenShift
                          ? "text-destructive"
                          : row.autoClockedOut
                            ? "text-warn"
                            : "text-foreground",
                      )}
                    >
                      {row.hoursWorked === null
                        ? "—"
                        : formatHours(row.hoursWorked)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="border-border flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-medium">{monthLabel} total</span>
          <span className="font-mono font-semibold">
            {formatHours(summary.totalHours)}
          </span>
        </div>
        {summary.excludedRowCount > 0 ? (
          <p className="text-muted-foreground text-xs">
            {summary.excludedRowCount}{" "}
            {summary.excludedRowCount === 1 ? "row has" : "rows have"} no
            recorded hours and {summary.excludedRowCount === 1 ? "is" : "are"}{" "}
            excluded from this total.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
