"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Send,
  Upload,
} from "lucide-react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getScheduleContextForWeekAction } from "@/features/schedules/actions/schedule-actions";
import { CsvImportPanel } from "@/features/schedules/components/csv-import-panel";
import {
  ShiftEditDialog,
  type ShiftEditResult,
} from "@/features/schedules/components/shift-edit-dialog";
import {
  expandRecurringDates,
  WEEKDAY_TOKENS,
} from "@/features/schedules/domain/recurring-shifts";
import {
  addDays,
  createShiftInstances,
  findShiftConflicts,
  getWeekDates,
  type ShiftDefaults,
  type ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import type { DemoShift, TeamMember } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const shiftLabels: Record<ShiftKind, string> = {
  morning: "Morning",
  evening: "Evening",
  full_day: "Full day",
};

const shiftStyles: Record<ShiftKind, string> = {
  morning: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  evening: "border-violet-400/20 bg-violet-400/10 text-violet-100",
  full_day: "border-primary/25 bg-primary/10 text-orange-100",
};

function displayTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// Feature 027, real bug found live-testing (not assumed): both label
// helpers below build a UTC-anchored Date purely to hand to
// Intl.DateTimeFormat for its month-name text -- but without an
// explicit `timeZone: "UTC"`, DateTimeFormat renders in the *host's own*
// local timezone by default. On a host west of UTC (this dev machine:
// America/Chicago, UTC-5/-6), `Date.UTC(2000, 8, 1)` (Sep 1, 2000
// 00:00 UTC) lands on Aug 31 local, so this component had been silently
// mislabeling the month header ("Aug 7-13" for what was actually the
// week of Sep 7-13) since long before this feature touched it -- caught
// only now because this is the first time this session actually
// live-loaded the Schedule tab's week header. Both isoDate/anyDateInMonth
// are pure calendar dates already, so pinning the formatter to UTC is
// the fix, not a workaround -- there was never a real timezone
// conversion to do here.
export function monthDayLabel(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
  return `${monthName} ${day}`;
}

export function weekRangeLabel(weekDates: string[]) {
  const [startYear, startMonth] = weekDates[0].split("-").map(Number);
  const [endYear, endMonth] = weekDates.at(-1)!.split("-").map(Number);
  const sameMonth = startYear === endYear && startMonth === endMonth;
  const start = monthDayLabel(weekDates[0]);
  const end = sameMonth
    ? weekDates.at(-1)!.split("-")[2]
    : monthDayLabel(weekDates.at(-1)!);
  return `${start}–${end}`;
}

export function monthLabel(anyDateInMonth: string) {
  const [year, month] = anyDateInMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** 0 = the month's 1st falls on a Monday .. 6 = falls on a Sunday. */
function leadingBlankCount(firstOfMonth: string) {
  const [year, month, day] = firstOfMonth.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return (utcDay + 6) % 7;
}

function ShiftBlock({
  shift,
  compact = false,
  onEdit,
}: {
  shift: DemoShift;
  compact?: boolean;
  // Feature 027: manager-only, week-grid-only (see this component's own
  // call sites) -- the month view's compact block only ever shows the
  // signed-in user's own shift and has no editing affordance, matching
  // the spec's own scope (Week Navigation + shift editing, not a
  // separate month-view editing surface).
  onEdit?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold">
          {shiftLabels[shift.shiftKind]}
        </span>
        {shift.status === "draft" ? (
          <span className="text-[10px] font-bold uppercase opacity-70">
            Draft
          </span>
        ) : null}
      </div>
      {!compact ? (
        <p className="mt-1 font-mono text-[11px] opacity-80">
          {displayTime(shift.startLocal)}–{displayTime(shift.endLocal)}
        </p>
      ) : null}
    </>
  );

  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${shiftLabels[shift.shiftKind]} shift, ${displayTime(shift.startLocal)}–${displayTime(shift.endLocal)}`}
        className={cn(
          "min-h-11 w-full rounded-lg border px-2.5 py-2 text-left transition hover:brightness-110",
          shiftStyles[shift.shiftKind],
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        shiftStyles[shift.shiftKind],
      )}
    >
      {content}
    </div>
  );
}

function ShiftEditor({
  team,
  onAdd,
  shiftDefaults,
  defaultFromDate,
}: {
  team: TeamMember[];
  onAdd: (shifts: DemoShift[]) => void;
  shiftDefaults: ShiftDefaults;
  defaultFromDate: string;
}) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const employeeId = String(form.get("employeeId"));
      const shiftKind = String(form.get("shiftKind")) as ShiftKind;
      const fromDate = String(form.get("fromDate"));
      const toDate = String(form.get("toDate") || "") || undefined;
      const customStart = String(form.get("customStart") || "") || undefined;
      const customEnd = String(form.get("customEnd") || "") || undefined;
      const note = String(form.get("note") || "").trim() || undefined;

      // Feature 027: "Repeat on" -- none checked keeps the exact existing
      // behavior (one continuous range); any checked requires an end
      // date (nothing to repeat across a single day) and filters the
      // range down to just those weekdays.
      const daysOfWeek = form.getAll("days").map((value) => Number(value));
      let dates: string[] | undefined;
      let seriesId: string | undefined;
      let isRecurring = false;
      if (daysOfWeek.length > 0) {
        if (!toDate) {
          throw new Error(
            "An end date is required when repeating on specific days.",
          );
        }
        dates = expandRecurringDates({ fromDate, toDate, daysOfWeek });
        if (dates.length === 0) {
          throw new Error("No dates in the range match the selected days.");
        }
        seriesId = crypto.randomUUID();
        isRecurring = true;
      }

      const instances = createShiftInstances({
        shiftKind,
        fromDate,
        toDate,
        dates,
        customStart,
        customEnd,
        defaults: shiftDefaults,
      });
      onAdd(
        instances.map((instance, index) => ({
          id: `shift-${Date.now()}-${index}`,
          employeeId,
          ...instance,
          status: "draft" as const,
          note,
          seriesId,
          isRecurring,
        })),
      );
      event.currentTarget.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to add shift.",
      );
    }
  }

  return (
    <Card className="border-primary/15">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary grid size-9 place-items-center rounded-xl">
            <Plus className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold">Add shift</h3>
            <p className="text-muted-foreground text-xs">
              One day is required. End date and custom times are optional.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={submit}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <div className="space-y-2">
            <Label htmlFor="employeeId">Person</Label>
            <Select
              id="employeeId"
              name="employeeId"
              defaultValue={team[0]?.id}
            >
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shiftKind">Shift</Label>
            <Select id="shiftKind" name="shiftKind" defaultValue="morning">
              <option value="morning">
                Morning · {displayTime(shiftDefaults.morning.start)}–
                {displayTime(shiftDefaults.morning.end)}
              </option>
              <option value="evening">
                Evening · {displayTime(shiftDefaults.evening.start)}–
                {displayTime(shiftDefaults.evening.end)}
              </option>
              <option value="full_day">
                Full day · {displayTime(shiftDefaults.full_day.start)}–
                {displayTime(shiftDefaults.full_day.end)}
              </option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromDate">From date</Label>
            <Input
              id="fromDate"
              name="fromDate"
              type="date"
              defaultValue={defaultFromDate}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toDate">
              To date{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input id="toDate" name="toDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customStart">
              From time{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input id="customStart" name="customStart" type="time" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customEnd">
              To time{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input id="customEnd" name="customEnd" type="time" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="note">
              Manager note{" "}
              <span className="text-muted-foreground font-normal">
                (private)
              </span>
            </Label>
            <Input
              id="note"
              name="note"
              placeholder="Optional setup or station note"
            />
          </div>
          <fieldset className="space-y-2 sm:col-span-2 xl:col-span-4">
            <legend className="text-sm font-medium">
              Repeat on{" "}
              <span className="text-muted-foreground font-normal">
                (optional — requires an end date)
              </span>
            </legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_TOKENS.map((token, index) => (
                <label
                  key={token}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="days"
                    value={index}
                    className="accent-[var(--primary)]"
                  />
                  {token}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-3 sm:col-span-2 xl:col-span-4">
            <Button type="submit">
              <Plus aria-hidden="true" /> Add to draft
            </Button>
            <p className="text-muted-foreground text-xs">
              Blank times use the configured shift defaults.
            </p>
          </div>
          {error ? (
            <p
              className="text-destructive text-sm sm:col-span-2 xl:col-span-4"
              aria-live="polite"
            >
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function ScheduleWorkspace({
  user,
  team,
  shiftDefaults,
  shifts,
  weekDates,
  monthDates,
  timeZone,
  restaurantSlug,
  demoMode,
  onAddShifts,
  onPublish,
  onUpdateShift,
  onDeleteShift,
}: {
  user: SignedInUser;
  team: TeamMember[];
  shiftDefaults: ShiftDefaults;
  shifts: DemoShift[];
  weekDates: string[];
  monthDates: string[];
  timeZone: string;
  restaurantSlug: string;
  demoMode: boolean;
  onAddShifts: (shifts: DemoShift[]) => void;
  onPublish: () => void;
  onUpdateShift: (input: {
    shiftId: string;
    employeeId: string;
    shiftKind: ShiftKind;
    startLocal: string;
    endLocal: string;
    note?: string;
  }) => Promise<ShiftEditResult>;
  onDeleteShift: (input: { shiftId: string }) => Promise<ShiftEditResult>;
}) {
  const isManager = user.role !== "server";
  const [view, setView] = useState<"week" | "month">("week");
  const [showEditor, setShowEditor] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  // Feature 027: which shift the edit dialog is open for, manager-only,
  // week-grid-only (ShiftBlock's own onEdit doc comment).
  const [editingShift, setEditingShift] = useState<DemoShift | null>(null);

  // Feature 027: week navigation. `weekDates[0]` (the initial, "today"
  // week from the Server Component's own load / demo's fixed anchor) is
  // the one week `shifts` (the prop) is always guaranteed to already
  // cover in real mode -- browsing anywhere else needs its own fetch.
  // Demo mode never needs a fetch at all: `shifts` there is already the
  // complete, unbounded set for the whole session (see
  // tasks/current-task.md's Investigation #9), so browsing is a pure
  // client-side filter.
  const initialWeekStart = weekDates[0];
  const [viewWeekStart, setViewWeekStart] = useState(initialWeekStart);
  const isInitialWeek = viewWeekStart === initialWeekStart;
  const [fetchedWeek, setFetchedWeek] = useState<{
    weekStart: string;
    weekDates: string[];
    shifts: DemoShift[];
  } | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [weekReloadKey, setWeekReloadKey] = useState(0);

  useEffect(() => {
    if (demoMode || isInitialWeek) return;
    let cancelled = false;
    async function load() {
      setWeekLoading(true);
      setWeekError(null);
      const result = await getScheduleContextForWeekAction({
        restaurantSlug,
        weekStartDate: viewWeekStart,
      });
      if (cancelled) return;
      setWeekLoading(false);
      if (!result.ok) {
        setWeekError(result.error);
        return;
      }
      setFetchedWeek({
        weekStart: viewWeekStart,
        weekDates: result.data.weekDates,
        shifts: result.data.shifts,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [demoMode, isInitialWeek, viewWeekStart, restaurantSlug, weekReloadKey]);

  const activeWeekDates = isInitialWeek
    ? weekDates
    : demoMode
      ? getWeekDates(viewWeekStart)
      : (fetchedWeek?.weekDates ?? getWeekDates(viewWeekStart));

  function stepWeek(deltaDays: 7 | -7) {
    setViewWeekStart((current) => addDays(current, deltaDays));
  }

  // A shift added/imported while browsing a non-today real-mode week
  // lands via revalidatePath on the *initial* week's own data, not this
  // locally-fetched one -- re-triggering the fetch here is what keeps a
  // browsed week from going stale after a mutation.
  function afterMutation() {
    if (!demoMode && !isInitialWeek) {
      setWeekReloadKey((key) => key + 1);
    }
  }

  // Feature 027: thin wrappers so a browsed (non-today) real-mode week
  // refreshes the same way an add does, on top of whatever optimistic
  // update the parent's own onUpdateShift/onDeleteShift already applied
  // to `shifts`.
  async function handleUpdateShift(
    shiftId: string,
    submission: {
      employeeId: string;
      shiftKind: ShiftKind;
      startLocal: string;
      endLocal: string;
      note?: string;
    },
  ): Promise<ShiftEditResult> {
    const result = await onUpdateShift({ shiftId, ...submission });
    if (result.ok) afterMutation();
    return result;
  }

  async function handleDeleteShift(shiftId: string): Promise<ShiftEditResult> {
    const result = await onDeleteShift({ shiftId });
    if (result.ok) afterMutation();
    return result;
  }

  const visibleShifts = useMemo(
    () => shifts.filter((shift) => isManager || shift.status === "published"),
    [isManager, shifts],
  );
  // Computes which shifts are active for the currently-viewed week (see
  // the three-way isInitialWeek/demoMode/fetchedWeek branching above)
  // and the manager-only draft visibility filter in one memo, so the
  // intermediate "active" array is never a fresh reference every render
  // for downstream hooks to chase.
  const visibleActiveShifts = useMemo(() => {
    const active: DemoShift[] = isInitialWeek
      ? shifts
      : demoMode
        ? shifts.filter((shift) => activeWeekDates.includes(shift.serviceDate))
        : fetchedWeek?.weekStart === viewWeekStart
          ? fetchedWeek.shifts
          : [];
    return active.filter((shift) => isManager || shift.status === "published");
  }, [
    isInitialWeek,
    demoMode,
    shifts,
    activeWeekDates,
    fetchedWeek,
    viewWeekStart,
    isManager,
  ]);
  const conflictCount = findShiftConflicts(
    visibleShifts.map((shift) => ({ ...shift })),
  ).length;
  const draftCount = shifts.filter(({ status }) => status === "draft").length;
  const leadingBlanks = leadingBlankCount(monthDates[0]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Module 1</Badge>
            <span className="text-muted-foreground text-xs">
              Published team schedule
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            Weekly & monthly roster
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            {isManager
              ? "Plan Morning, Evening, or Full Day shifts with optional date ranges and time overrides."
              : "Your detailed shifts and the restaurant’s published team roster."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div
            className="border-border bg-secondary flex rounded-xl border p-1"
            aria-label="Schedule view"
          >
            {(["week", "month"] as const).map((item) => (
              <Button
                key={item}
                variant={view === item ? "default" : "ghost"}
                size="sm"
                onClick={() => setView(item)}
                aria-pressed={view === item}
              >
                {item === "week" ? "Week" : "Month"}
              </Button>
            ))}
          </div>
          {isManager ? (
            <Button
              variant="secondary"
              onClick={() => setShowEditor((value) => !value)}
            >
              <Plus aria-hidden="true" /> Add shift
            </Button>
          ) : null}
          {isManager ? (
            <Button variant="secondary" onClick={() => setShowCsvImport(true)}>
              <Upload aria-hidden="true" /> Import CSV
            </Button>
          ) : null}
          {isManager ? (
            <Button onClick={onPublish} disabled={draftCount === 0}>
              <Send aria-hidden="true" /> Publish {draftCount || ""}
            </Button>
          ) : null}
        </div>
      </div>

      {showEditor && isManager ? (
        <ShiftEditor
          team={team}
          shiftDefaults={shiftDefaults}
          defaultFromDate={activeWeekDates[0]}
          onAdd={(added) => {
            onAddShifts(added);
            afterMutation();
          }}
        />
      ) : null}

      {showCsvImport && isManager ? (
        <CsvImportPanel
          employees={team.map(({ id, name }) => ({ id, name }))}
          shiftDefaults={shiftDefaults}
          onCommit={(added) => {
            onAddShifts(added);
            afterMutation();
          }}
          onClose={() => setShowCsvImport(false)}
        />
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Schedule summary"
      >
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Published shifts
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {shifts.filter(({ status }) => status === "published").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Draft shifts
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {isManager ? draftCount : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Conflicts
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {isManager ? conflictCount : "—"}
            </p>
          </CardContent>
        </Card>
      </section>

      {view === "week" ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">
                {weekRangeLabel(activeWeekDates)}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {timeZone} · default hours applied when custom times are blank
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!isInitialWeek ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setViewWeekStart(initialWeekStart)}
                >
                  <RotateCcw aria-hidden="true" /> Today
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous week"
                onClick={() => stepWeek(-7)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next week"
                onClick={() => stepWeek(7)}
              >
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          {weekError ? (
            <CardContent className="pt-0">
              <div className="border-destructive/30 bg-destructive/10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm">
                <span className="text-destructive">{weekError}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWeekReloadKey((key) => key + 1)}
                >
                  Try again
                </Button>
              </div>
            </CardContent>
          ) : null}
          <CardContent className="overflow-x-auto p-0 pt-5">
            {weekLoading ? (
              <p
                className="text-muted-foreground px-5 pb-5 text-sm"
                aria-live="polite"
              >
                Loading that week…
              </p>
            ) : (
              <div className="border-border min-w-[960px] border-t">
                <div className="bg-muted grid grid-cols-[160px_repeat(7,minmax(110px,1fr))]">
                  <div className="border-border text-muted-foreground border-r p-3 text-xs font-semibold">
                    Name
                  </div>
                  {activeWeekDates.map((date, index) => (
                    <div
                      key={date}
                      className="border-border border-r p-3 last:border-r-0"
                    >
                      <p className="text-xs font-semibold">
                        {weekdayLabels[index]}
                      </p>
                      <p className="text-muted-foreground mt-1 font-mono text-xs">
                        {monthDayLabel(date)}
                      </p>
                    </div>
                  ))}
                </div>
                {team.map((member) => (
                  <div
                    key={member.id}
                    className={cn(
                      "border-border grid grid-cols-[160px_repeat(7,minmax(110px,1fr))] border-t",
                      !isManager &&
                        member.id === user.profileId &&
                        "bg-primary/[0.025]",
                    )}
                  >
                    <div className="border-border border-r p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: member.color }}
                        />
                        <span className="text-sm font-medium">
                          {member.name}
                        </span>
                      </div>
                      {!isManager && member.id === user.profileId ? (
                        <p className="text-primary mt-1 text-[10px] font-bold uppercase">
                          You
                        </p>
                      ) : null}
                    </div>
                    {activeWeekDates.map((date) => {
                      const cellShifts = visibleActiveShifts.filter(
                        (shift) =>
                          shift.employeeId === member.id &&
                          shift.serviceDate === date,
                      );
                      return (
                        <div
                          key={date}
                          className="border-border min-h-24 space-y-1.5 border-r p-2 last:border-r-0"
                        >
                          {cellShifts.map((shift) => (
                            <ShiftBlock
                              key={shift.id}
                              shift={shift}
                              onEdit={
                                isManager
                                  ? () => setEditingShift(shift)
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CalendarDays
                className="text-primary size-5"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-semibold">{monthLabel(monthDates[0])}</h2>
                <p className="text-muted-foreground text-xs">
                  Select Week for exact staff-by-day detail.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-border bg-border grid grid-cols-7 gap-px overflow-hidden rounded-xl border">
              {weekdayLabels.map((day) => (
                <div
                  key={day}
                  className="bg-secondary text-muted-foreground p-2 text-center text-xs font-semibold"
                >
                  {day}
                </div>
              ))}
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <div
                  key={`blank-${index}`}
                  className="bg-background/70 min-h-24"
                />
              ))}
              {monthDates.map((date) => {
                const day = Number(date.split("-")[2]);
                const dayShifts = visibleShifts.filter(
                  (shift) => shift.serviceDate === date,
                );
                const own = dayShifts.find(
                  (shift) => shift.employeeId === user.profileId,
                );
                return (
                  <div key={date} className="bg-card min-h-24 p-2">
                    <p className="text-muted-foreground font-mono text-xs">
                      {day}
                    </p>
                    {own ? (
                      <div className="mt-2">
                        <ShiftBlock shift={own} compact />
                      </div>
                    ) : dayShifts.length ? (
                      <p className="mt-3 text-xs font-medium">
                        {dayShifts.length} scheduled
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-3 text-xs">
                        No shifts
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!isManager ? (
        <Card className="border-primary/15">
          <CardContent className="flex items-start gap-3">
            <Check className="text-primary mt-0.5 size-5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Only published shifts are visible</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Draft changes and manager notes stay private until your manager
                publishes the roster.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {editingShift && isManager ? (
        <ShiftEditDialog
          shift={editingShift}
          employeeName={
            team.find((member) => member.id === editingShift.employeeId)
              ?.name ?? "Unknown"
          }
          dateLabel={monthDayLabel(editingShift.serviceDate)}
          team={team}
          shiftDefaults={shiftDefaults}
          onClose={() => setEditingShift(null)}
          onSave={(submission) =>
            handleUpdateShift(editingShift.id, submission)
          }
          onDelete={() => handleDeleteShift(editingShift.id)}
        />
      ) : null}
    </div>
  );
}
