"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createManualAttendanceEntryAction,
  listLocationEmployeesAction,
  type AttendanceEmployeeOption,
} from "@/features/attendance/actions/native-report-actions";
import {
  calculateGrossElapsed,
  MANUAL_ENTRY_REASON_MAX,
  MANUAL_ENTRY_REASON_MIN,
  MAX_SHIFT_DURATION_HOURS,
  validateManualEntryLocalTime,
} from "@/features/attendance/domain/attendance-manual-entry";
import { formatWorkedDuration } from "@/features/attendance/domain/attendance-session";
import { localInputToInstant } from "@/features/attendance/domain/correction-form";
import {
  formatInstantInZone,
  NATIVE_REPORT_SOURCE_LABEL,
} from "@/features/attendance/domain/native-report";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

type Step = "edit" | "review" | "done";

export function AttendanceManualEntryDialog({
  restaurantSlug,
  locationId,
  locationName,
  timeZone,
  onClose,
  onCreated,
}: {
  restaurantSlug: string;
  locationId: string;
  locationName: string;
  timeZone: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = useMemo(
    () => zonedWallTimeFromInstant(new Date(), timeZone).date,
    [timeZone],
  );

  const [step, setStep] = useState<Step>("edit");
  const [employees, setEmployees] = useState<AttendanceEmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState("");
  const [serviceDate, setServiceDate] = useState(today);
  const [clockInTime, setClockInTime] = useState("09:00");
  const [isOpenShift, setIsOpenShift] = useState(false);
  const [clockOutDate, setClockOutDate] = useState(today);
  const [clockOutTime, setClockOutTime] = useState("17:00");
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const errorAlertId = useId();

  // Load available active employees for this location
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingEmployees(true);
      const res = await listLocationEmployeesAction({
        restaurantSlug,
        expectedLocationId: locationId,
      });
      if (cancelled) return;
      setLoadingEmployees(false);
      if (!res.ok) {
        setEmployeeError(res.error);
        return;
      }
      setEmployees(res.data);
      if (res.data.length > 0) {
        setProfileId(res.data[0].profileId);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, locationId]);

  // Keep clockOutDate in sync with serviceDate unless user explicitly modified it
  function handleServiceDateChange(newDate: string) {
    if (clockOutDate === serviceDate) {
      setClockOutDate(newDate);
    }
    setServiceDate(newDate);
  }

  // Pure wall-clock conversion with DST gap / duplicate check
  const inLocalString = `${serviceDate}T${clockInTime}`;
  const outLocalString = isOpenShift ? null : `${clockOutDate}T${clockOutTime}`;

  const inIso = useMemo(
    () => localInputToInstant(inLocalString, timeZone),
    [inLocalString, timeZone],
  );
  const outIso = useMemo(
    () =>
      outLocalString ? localInputToInstant(outLocalString, timeZone) : null,
    [outLocalString, timeZone],
  );

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.profileId === profileId) ?? null,
    [employees, profileId],
  );

  const reasonTrimmed = reason.trim();
  const reasonValid =
    reasonTrimmed.length >= MANUAL_ENTRY_REASON_MIN &&
    reasonTrimmed.length <= MANUAL_ENTRY_REASON_MAX;

  // Validation errors
  const validationErrors: string[] = [];
  if (!profileId) validationErrors.push("Select an employee.");
  if (!serviceDate) validationErrors.push("Enter a valid service date.");
  if (!clockInTime) validationErrors.push("Enter a clock-in time.");
  if (!inIso) {
    validationErrors.push(
      "Clock-in time is not a valid local wall time (may fall in a Daylight Saving transition).",
    );
  }

  if (isOpenShift) {
    if (serviceDate !== today) {
      validationErrors.push(
        `Open shifts can only be recorded for today (${today}). Earlier dates require a clock-out time.`,
      );
    }
  } else {
    if (!clockOutTime) validationErrors.push("Enter a clock-out time.");
    if (!outIso) {
      validationErrors.push(
        "Clock-out time is not a valid local wall time (may fall in a Daylight Saving transition).",
      );
    }
    if (inIso && outIso) {
      const inMs = Date.parse(inIso);
      const outMs = Date.parse(outIso);
      if (outMs <= inMs) {
        validationErrors.push("Clock-out must follow clock-in.");
      }
      if (outMs > inMs + MAX_SHIFT_DURATION_HOURS * 3600 * 1000) {
        validationErrors.push(
          `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours.`,
        );
      }
    }
  }

  if (inIso) {
    const localCheck = validateManualEntryLocalTime({
      serviceDate,
      clockInAt: inIso,
      clockOutAt: outIso,
      timeZone,
    });
    if (!localCheck.ok) {
      validationErrors.push(localCheck.error);
    }
  }

  if (
    reasonTrimmed.length > 0 &&
    reasonTrimmed.length < MANUAL_ENTRY_REASON_MIN
  ) {
    validationErrors.push(
      `Reason must be at least ${MANUAL_ENTRY_REASON_MIN} characters.`,
    );
  }

  const canReview =
    validationErrors.length === 0 && reasonValid && !loadingEmployees;

  const grossElapsed =
    inIso && outIso ? calculateGrossElapsed(inIso, outIso) : null;

  async function handleConfirmSubmit() {
    if (!canReview || !inIso) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await createManualAttendanceEntryAction({
      restaurantSlug,
      expectedLocationId: locationId,
      profileId,
      serviceDate,
      clockInAt: inIso,
      clockOutAt: isOpenShift ? null : outIso,
      reason: reasonTrimmed,
      idempotencyKey: idempotencyKey.current,
    });

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setStep("done");
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        step === "review" ? "Review manual shift entry" : "Record manual shift"
      }
      description={`Record an explicit-time shift at ${locationName} (${timeZone}).`}
      className="max-w-[min(94vw,38rem)]"
    >
      <div className="flex flex-col gap-4">
        {step === "edit" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canReview) {
                setSubmitError(null);
                setStep("review");
              }
            }}
            className="flex flex-col gap-4"
          >
            {employeeError ? (
              <p role="alert" className="text-destructive text-sm">
                {employeeError}
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="man-emp">Employee (required)</Label>
              {loadingEmployees ? (
                <p className="text-muted-foreground text-xs">
                  Loading employees…
                </p>
              ) : employees.length === 0 ? (
                <p className="text-destructive text-xs">
                  No active employees assigned to this location.
                </p>
              ) : (
                <Select
                  id="man-emp"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                >
                  {employees.map((emp) => (
                    <option key={emp.profileId} value={emp.profileId}>
                      {emp.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="man-service-date">Service date</Label>
                <Input
                  id="man-service-date"
                  type="date"
                  value={serviceDate}
                  onChange={(e) => handleServiceDateChange(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="man-in-time">Clock-in time</Label>
                <Input
                  id="man-in-time"
                  type="time"
                  value={clockInTime}
                  onChange={(e) => setClockInTime(e.target.value)}
                />
              </div>
            </div>

            <div className="border-border flex flex-col gap-3 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <input
                  id="man-open-toggle"
                  type="checkbox"
                  checked={isOpenShift}
                  onChange={(e) => setIsOpenShift(e.target.checked)}
                  className="size-4"
                />
                <Label
                  htmlFor="man-open-toggle"
                  className="cursor-pointer text-sm font-medium"
                >
                  Leave shift open (employee is currently clocked in)
                </Label>
              </div>

              {isOpenShift ? (
                <p className="text-muted-foreground text-xs">
                  An open shift records a clock-in only. It can only be entered
                  for today ({today}) and only if the employee has no active
                  open shift.
                </p>
              ) : (
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="man-out-date">Clock-out date</Label>
                    <Input
                      id="man-out-date"
                      type="date"
                      value={clockOutDate}
                      onChange={(e) => setClockOutDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="man-out-time">Clock-out time</Label>
                    <Input
                      id="man-out-time"
                      type="time"
                      value={clockOutTime}
                      onChange={(e) => setClockOutTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="man-reason">
                Reason for manual entry (required)
              </Label>
              <textarea
                id="man-reason"
                rows={2}
                maxLength={MANUAL_ENTRY_REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this shift was manually recorded (e.g. employee forgot badge, power outage)"
                className="border-input bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              />
              <p className="text-muted-foreground text-xs">
                Saved with your manager attribution in the audit trail.{" "}
                {reasonTrimmed.length}/{MANUAL_ENTRY_REASON_MAX} (minimum{" "}
                {MANUAL_ENTRY_REASON_MIN})
              </p>
            </div>

            <p className="text-muted-foreground text-xs">
              Note: A clock-out without a start is unsupported. Payable time
              requires an established start time.
            </p>

            {validationErrors.length > 0 &&
            (reasonTrimmed.length > 0 || !canReview) ? (
              <ul
                role="alert"
                className="text-destructive list-disc pl-5 text-xs"
              >
                {validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canReview}>
                Review shift
              </Button>
            </div>
          </form>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-semibold">
                    {selectedEmployee?.displayName ?? "Selected Employee"}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Location:</span>
                  <span>
                    {locationName} ({timeZone})
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Service date:</span>
                  <span>{serviceDate}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Interval:</span>
                  <span className="font-medium">
                    {inIso
                      ? formatInstantInZone(inIso, timeZone)
                      : inLocalString}{" "}
                    →{" "}
                    {isOpenShift ? (
                      <Badge tone="warning">Open (Clocked in)</Badge>
                    ) : outIso ? (
                      formatInstantInZone(outIso, timeZone)
                    ) : (
                      outLocalString
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Gross duration:</span>
                  <span>
                    {isOpenShift
                      ? "In progress"
                      : grossElapsed !== null
                        ? formatWorkedDuration(grossElapsed)
                        : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-muted-foreground">Manager reason:</span>
                  <p className="bg-muted/40 rounded-lg p-2.5 text-xs italic">
                    “{reasonTrimmed}”
                  </p>
                </div>
              </CardContent>
            </Card>

            {submitError ? (
              <p
                id={errorAlertId}
                role="alert"
                className="text-destructive text-sm"
              >
                {submitError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setStep("edit")}
              >
                Back to edit
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmSubmit()}
              >
                {submitting ? "Saving shift…" : "Confirm & Save shift"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Badge tone="success" className="px-3 py-1 text-sm font-medium">
              Shift Recorded Successfully
            </Badge>
            <p className="text-muted-foreground text-sm">
              The shift has been committed to the attendance log with your audit
              attribution.
            </p>
            <div className="pt-2">
              <Button
                type="button"
                onClick={() => {
                  onCreated();
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-muted-foreground text-xs">
          Source: {NATIVE_REPORT_SOURCE_LABEL} · Timestamps stored as absolute
          UTC instants
        </p>
      </div>
    </Dialog>
  );
}
