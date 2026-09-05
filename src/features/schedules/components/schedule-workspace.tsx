"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
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
import { CsvImportPanel } from "@/features/schedules/components/csv-import-panel";
import {
  createShiftInstances,
  findShiftConflicts,
  type ShiftDefaults,
  type ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import { initialShifts, team, type DemoShift } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const weekDates = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];
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

function ShiftBlock({
  shift,
  compact = false,
}: {
  shift: DemoShift;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        shiftStyles[shift.shiftKind],
      )}
    >
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
    </div>
  );
}

function ShiftEditor({
  onAdd,
  shiftDefaults,
}: {
  onAdd: (shifts: DemoShift[]) => void;
  shiftDefaults: ShiftDefaults;
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
      const instances = createShiftInstances({
        shiftKind,
        fromDate,
        toDate,
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
            <Select id="employeeId" name="employeeId" defaultValue="mia">
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
              defaultValue="2026-09-07"
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
  shiftDefaults,
}: {
  user: SignedInUser;
  shiftDefaults: ShiftDefaults;
}) {
  const isManager = user.role !== "server";
  const [view, setView] = useState<"week" | "month">("week");
  const [showEditor, setShowEditor] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [shifts, setShifts] = useState<DemoShift[]>(initialShifts);
  const visibleShifts = useMemo(
    () => shifts.filter((shift) => isManager || shift.status === "published"),
    [isManager, shifts],
  );
  const conflictCount = findShiftConflicts(
    visibleShifts.map((shift) => ({ ...shift })),
  ).length;
  const draftCount = shifts.filter(({ status }) => status === "draft").length;

  function publishDraft() {
    setShifts((current) =>
      current.map((shift) => ({ ...shift, status: "published" })),
    );
  }

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
            <Button onClick={publishDraft} disabled={draftCount === 0}>
              <Send aria-hidden="true" /> Publish {draftCount || ""}
            </Button>
          ) : null}
        </div>
      </div>

      {showEditor && isManager ? (
        <ShiftEditor
          shiftDefaults={shiftDefaults}
          onAdd={(added) => setShifts((current) => [...current, ...added])}
        />
      ) : null}

      {showCsvImport && isManager ? (
        <CsvImportPanel
          employees={team.map(({ id, name }) => ({ id, name }))}
          shiftDefaults={shiftDefaults}
          onCommit={(added) => setShifts((current) => [...current, ...added])}
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
              <h2 className="font-semibold">September 7–13</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                America/Chicago · default hours applied when custom times are
                blank
              </p>
            </div>
            <div className="flex">
              <Button variant="ghost" size="icon" aria-label="Previous week">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next week">
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 pt-5">
            <div className="border-border min-w-[960px] border-t">
              <div className="bg-muted grid grid-cols-[160px_repeat(7,minmax(110px,1fr))]">
                <div className="border-border text-muted-foreground border-r p-3 text-xs font-semibold">
                  Team member
                </div>
                {weekDates.map((date, index) => (
                  <div
                    key={date}
                    className="border-border border-r p-3 last:border-r-0"
                  >
                    <p className="text-xs font-semibold">
                      {weekdayLabels[index]}
                    </p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      Sep {Number(date.slice(-2))}
                    </p>
                  </div>
                ))}
              </div>
              {(isManager ? team : team).map((member) => (
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
                      <span className="text-sm font-medium">{member.name}</span>
                    </div>
                    {!isManager && member.id === user.profileId ? (
                      <p className="text-primary mt-1 text-[10px] font-bold uppercase">
                        You
                      </p>
                    ) : null}
                  </div>
                  {weekDates.map((date) => {
                    const cellShifts = visibleShifts.filter(
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
                          <ShiftBlock key={shift.id} shift={shift} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
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
                <h2 className="font-semibold">September 2026</h2>
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
              {Array.from({ length: 1 }, (_, index) => (
                <div
                  key={`blank-${index}`}
                  className="bg-background/70 min-h-24"
                />
              ))}
              {Array.from({ length: 30 }, (_, index) => {
                const day = index + 1;
                const date = `2026-09-${String(day).padStart(2, "0")}`;
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
    </div>
  );
}
