"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getNativeAttendanceReportAction,
  type AttendanceSourceView,
  type NativeReportView,
} from "@/features/attendance/actions/native-report-actions";
import { AttendanceCorrectionDialog } from "@/features/attendance/components/attendance-correction-dialog";
import {
  formatWorkedDuration,
  formatWorkedHours,
} from "@/features/attendance/domain/attendance-session";
import {
  classifySessionState,
  crossesLocalMidnight,
  describePayable,
  formatLocalTime,
  NATIVE_REPORT_SOURCE_LABEL,
  openElapsedSeconds,
  timeZoneAbbreviation,
  type NativeReportRow,
} from "@/features/attendance/domain/native-report";
import { getWeekDates } from "@/features/schedules/domain/shift-planning";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * V2-006.005. Native (TheLineup Internal) attendance for ONE location. Every time is shown in
 * the location's own zone, every row carries its provenance, and no figure is presented as
 * more certain than the data behind it: payable time reads "Pending break classification"
 * until every break has been explicitly decided.
 */
export function NativeAttendanceReport({
  restaurantSlug,
  source,
}: {
  restaurantSlug: string;
  source: AttendanceSourceView;
}) {
  const timeZone = source.timeZone;
  const today = zonedWallTimeFromInstant(new Date(), timeZone).date;
  const thisWeek = getWeekDates(today);

  const [start, setStart] = useState(thisWeek[0]);
  const [end, setEnd] = useState(thisWeek[6]);
  const [profileId, setProfileId] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<NativeReportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Refreshed with every load so elapsed-open-time display is never computed during render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [employees, setEmployees] = useState<Array<[string, string]>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rangeValid = start !== "" && end !== "" && start <= end;

  useEffect(() => {
    if (!rangeValid) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getNativeAttendanceReportAction({
        restaurantSlug,
        startDate: start,
        endDate: end,
        profileId: profileId || null,
      });
      if (cancelled) return;
      setLoading(false);
      setNowMs(Date.now());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setView(result.data);
      setEmployees((known) => {
        const map = new Map(known);
        for (const r of result.data.rows) map.set(r.profileId, r.employeeName);
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, start, end, profileId, reloadKey, rangeValid]);

  const selected = useMemo(
    () => view?.rows.find((r) => r.sessionId === selectedId) ?? null,
    [view, selectedId],
  );

  const rows = view?.rows ?? [];
  const totals = view?.totals;
  const longOpen = rows.filter(
    (r) => classifySessionState(r, today) === "open_across_midnight",
  );

  function applyRange(a: string, b: string) {
    setStart(a);
    setEnd(b);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nat-start">From</Label>
              <Input
                id="nat-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nat-end">To</Label>
              <Input
                id="nat-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            {source.canManage ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="nat-emp">Employee</Label>
                <Select
                  id="nat-emp"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                >
                  <option value="">All employees</option>
                  {employees.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyRange(today, today)}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyRange(thisWeek[0], thisWeek[6])}
            >
              This week
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                applyRange(
                  shiftDate(thisWeek[0], -7),
                  shiftDate(thisWeek[6], -7),
                )
              }
            >
              Last week
            </Button>
          </div>
          {!rangeValid ? (
            <p role="alert" className="text-destructive text-sm">
              Choose a start date that is on or before the end date.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5">
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {totals ? (
        <section
          aria-label="Totals"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Stat
            label="Shifts"
            value={`${totals.closedSessionCount} closed`}
            note={[
              totals.openSessionCount
                ? `${totals.openSessionCount} open`
                : null,
              totals.voidedSessionCount
                ? `${totals.voidedSessionCount} voided`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <Stat
            label="Gross hours (closed shifts)"
            value={formatWorkedHours(totals.grossSeconds)}
            note="Before any break adjustment"
          />
          <Stat
            label="Break time"
            value={formatWorkedDuration(totals.breakSeconds)}
            note={
              totals.unclassifiedBreakSeconds > 0
                ? `${formatWorkedDuration(totals.unclassifiedBreakSeconds)} not yet decided paid/unpaid`
                : "All breaks decided"
            }
            tone={totals.unclassifiedBreakSeconds > 0 ? "warning" : undefined}
          />
          <Stat
            label="Payable hours (confirmed only)"
            value={formatWorkedHours(totals.resolvedNetPayableSeconds)}
            note={
              totals.unresolvedSessionCount > 0
                ? `Excludes ${totals.unresolvedSessionCount} shift${totals.unresolvedSessionCount === 1 ? "" : "s"} awaiting break classification`
                : "All closed shifts confirmed"
            }
            tone={totals.unresolvedSessionCount > 0 ? "warning" : undefined}
          />
        </section>
      ) : null}

      {longOpen.length > 0 ? (
        <div
          role="status"
          className="border-warn/30 bg-warn/10 text-warn rounded-xl border p-3 text-sm"
        >
          {longOpen.length} shift{longOpen.length === 1 ? " is" : "s are"} still
          open from an earlier day. Nothing was closed automatically
          {source.canManage
            ? " — open the record to add the missing clock-out."
            : "."}
        </div>
      ) : null}
      {view?.truncated ? (
        <div
          role="status"
          className="border-warn/30 bg-warn/10 text-warn rounded-xl border p-3 text-sm"
        >
          Showing the most recent records only. Narrow the dates or pick an
          employee to see the rest; totals above cover the rows shown.
        </div>
      ) : null}

      {loading && !view ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading attendance…
        </p>
      ) : null}

      {view && rows.length === 0 && !loading ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold">No attendance recorded</p>
            <p className="text-muted-foreground text-sm">
              {prettyDate(start)} – {prettyDate(end)} at {source.locationName}.
              Clock-ins made in The Lineup appear here.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">
                Attendance for {source.locationName},{" "}
                {NATIVE_REPORT_SOURCE_LABEL}
              </caption>
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th scope="col" className="py-2 pr-3">
                    Employee
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    In
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Out
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Breaks
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Gross
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Payable
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Status
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.sessionId}
                    className="border-border border-t align-top"
                  >
                    <td className="py-3 pr-3 font-medium">{r.employeeName}</td>
                    <td className="py-3 pr-3">{prettyDate(r.serviceDate)}</td>
                    <td className="py-3 pr-3">
                      {formatLocalTime(r.clockInAt, timeZone)}{" "}
                      <span className="text-muted-foreground text-xs">
                        {timeZoneAbbreviation(r.clockInAt, timeZone)}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <OutCell r={r} timeZone={timeZone} />
                    </td>
                    <td className="py-3 pr-3">
                      <BreakCell r={r} />
                    </td>
                    <td className="py-3 pr-3">
                      {r.grossElapsedSeconds === null
                        ? "—"
                        : formatWorkedDuration(r.grossElapsedSeconds)}
                    </td>
                    <td className="py-3 pr-3">
                      <PayableCell r={r} />
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadges r={r} today={today} nowMs={nowMs} />
                    </td>
                    <td className="py-3 text-right">
                      <RowAction r={r} source={source} onOpen={setSelectedId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.sessionId}>
                <Card>
                  <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{r.employeeName}</p>
                        <p className="text-muted-foreground text-xs">
                          {prettyDate(r.serviceDate)}
                        </p>
                      </div>
                      <StatusBadges r={r} today={today} nowMs={nowMs} />
                    </div>
                    <p>
                      {formatLocalTime(r.clockInAt, timeZone)} →{" "}
                      <OutCell r={r} timeZone={timeZone} inline />{" "}
                      <span className="text-muted-foreground text-xs">
                        {timeZoneAbbreviation(r.clockInAt, timeZone)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Gross{" "}
                      {r.grossElapsedSeconds === null
                        ? "—"
                        : formatWorkedDuration(r.grossElapsedSeconds)}{" "}
                      · Breaks <BreakCell r={r} inline />
                    </p>
                    <p>
                      Payable: <PayableCell r={r} />
                    </p>
                    <div>
                      <RowAction r={r} source={source} onOpen={setSelectedId} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Source: {NATIVE_REPORT_SOURCE_LABEL} · {source.locationName} · times in{" "}
        {timeZone}
      </p>

      {selected ? (
        <AttendanceCorrectionDialog
          key={selected.sessionId}
          row={selected}
          restaurantSlug={restaurantSlug}
          timeZone={timeZone}
          canManage={source.canManage}
          onClose={() => setSelectedId(null)}
          onCorrected={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-5">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {note ? (
          <p
            className={
              tone === "warning"
                ? "text-warn text-xs"
                : "text-muted-foreground text-xs"
            }
          >
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OutCell({
  r,
  timeZone,
  inline,
}: {
  r: NativeReportRow;
  timeZone: string;
  inline?: boolean;
}) {
  if (!r.clockOutAt) return <Badge tone="warning">Open</Badge>;
  return (
    <span>
      {formatLocalTime(r.clockOutAt, timeZone)}
      {crossesLocalMidnight(r.clockInAt, r.clockOutAt, timeZone) ? (
        <span className="text-muted-foreground text-xs">
          {inline ? " (+1 day)" : " +1 day"}
        </span>
      ) : null}
    </span>
  );
}

function BreakCell({ r, inline }: { r: NativeReportRow; inline?: boolean }) {
  if (r.breakCount === 0) return <span>None</span>;
  return (
    <span className={inline ? "" : "flex flex-col"}>
      <span>
        {formatWorkedDuration(r.totalBreakSeconds)}
        {r.openBreakCount > 0 ? " (on break)" : ""}
      </span>
      {r.unclassifiedBreakSeconds > 0 || r.openBreakCount > 0 ? (
        <span className="text-warn text-xs">
          {inline ? " · " : ""}pay not decided
        </span>
      ) : null}
    </span>
  );
}

function PayableCell({ r }: { r: NativeReportRow }) {
  if (r.status === "voided")
    return <span className="text-muted-foreground">Voided</span>;
  if (r.status === "active" || r.status === "on_break")
    return <span className="text-muted-foreground">Shift open</span>;
  return (
    <span className={r.netPayableSeconds === null ? "text-warn" : ""}>
      {describePayable(r.netPayableSeconds, formatWorkedDuration)}
    </span>
  );
}

function StatusBadges({
  r,
  today,
  nowMs,
}: {
  r: NativeReportRow;
  today: string;
  nowMs: number;
}) {
  const state = classifySessionState(r, today);
  const open = openElapsedSeconds(r, nowMs);
  return (
    <span className="flex flex-wrap gap-1.5">
      {state === "completed" ? <Badge tone="success">Completed</Badge> : null}
      {state === "voided" ? <Badge tone="danger">Voided</Badge> : null}
      {state === "open" ? (
        <Badge tone="accent">
          {r.status === "on_break" ? "On break" : "Clocked in"}
        </Badge>
      ) : null}
      {state === "open_across_midnight" ? (
        <Badge tone="warning">
          Open since {prettyDate(r.serviceDate)}
          {open !== null ? ` · ${formatWorkedDuration(open)}` : ""}
        </Badge>
      ) : null}
      {r.correctionCount > 0 ? (
        <Badge tone="accent">Corrected ×{r.correctionCount}</Badge>
      ) : null}
    </span>
  );
}

function RowAction({
  r,
  source,
  onOpen,
}: {
  r: NativeReportRow;
  source: AttendanceSourceView;
  onOpen: (id: string) => void;
}) {
  const canCorrect = source.canManage && r.status !== "voided";
  if (!canCorrect && r.correctionCount === 0) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => onOpen(r.sessionId)}
      aria-label={`${canCorrect ? "Correct" : "View history for"} ${r.employeeName}, ${prettyDate(r.serviceDate)}`}
    >
      {canCorrect ? "Correct" : "History"}
    </Button>
  );
}
