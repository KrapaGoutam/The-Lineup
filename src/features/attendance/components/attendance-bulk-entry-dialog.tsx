"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createBulkAttendanceEntriesAction,
  listLocationEmployeesAction,
  type AttendanceEmployeeOption,
  type BulkEntryRowResult,
} from "@/features/attendance/actions/native-report-actions";
import {
  calculateGrossElapsed,
  detectBatchOverlaps,
  MANUAL_ENTRY_REASON_MAX,
  MANUAL_ENTRY_REASON_MIN,
  MAX_BULK_ENTRIES,
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

interface BulkGridRow {
  readonly rowId: string;
  readonly idempotencyKey: string;
  profileId: string;
  serviceDate: string;
  clockInTime: string;
  clockOutTime: string;
  reason: string;
}

type Step = "edit" | "review" | "results";

export function AttendanceBulkEntryDialog({
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

  // Shared defaults
  const [defaultDate, setDefaultDate] = useState(today);
  const [defaultInTime, setDefaultInTime] = useState("09:00");
  const [defaultOutTime, setDefaultOutTime] = useState("17:00");
  const defaultReason = "Bulk missed punch entry by manager";

  const [rows, setRows] = useState<BulkGridRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<
    Map<string, BulkEntryRowResult>
  >(new Map());

  // Load employees
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
      if (res.data.length > 0 && rows.length === 0) {
        // Initialize with one empty row
        setRows([
          {
            rowId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            profileId: res.data[0].profileId,
            serviceDate: today,
            clockInTime: "09:00",
            clockOutTime: "17:00",
            reason: "Bulk missed punch entry by manager",
          },
        ]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, locationId, today, rows.length]);

  function addRow() {
    if (rows.length >= MAX_BULK_ENTRIES) return;
    const defaultEmp = employees[0]?.profileId ?? "";
    setRows((prev) => [
      ...prev,
      {
        rowId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        profileId: defaultEmp,
        serviceDate: defaultDate,
        clockInTime: defaultInTime,
        clockOutTime: defaultOutTime,
        reason: defaultReason,
      },
    ]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function updateRow(rowId: string, patch: Partial<BulkGridRow>) {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  function applyDefaultsToAll() {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        serviceDate: defaultDate,
        clockInTime: defaultInTime,
        clockOutTime: defaultOutTime,
        reason: defaultReason,
      })),
    );
  }

  // Row evaluations & validations
  const rowEvaluations = useMemo(() => {
    return rows.map((r) => {
      const inStr = `${r.serviceDate}T${r.clockInTime}`;
      const outStr = `${r.serviceDate}T${r.clockOutTime}`;
      const inIso = localInputToInstant(inStr, timeZone);
      const outIso = localInputToInstant(outStr, timeZone);
      const errors: string[] = [];

      if (!r.profileId) errors.push("Select an employee.");
      if (!inIso)
        errors.push("Invalid clock-in time (may fall in DST transition).");
      if (!outIso)
        errors.push("Invalid clock-out time (may fall in DST transition).");

      if (inIso && outIso) {
        const inMs = Date.parse(inIso);
        const outMs = Date.parse(outIso);
        if (outMs <= inMs) errors.push("Clock-out must follow clock-in.");
        if (outMs > inMs + MAX_SHIFT_DURATION_HOURS * 3600 * 1000) {
          errors.push(
            `Shift duration cannot exceed ${MAX_SHIFT_DURATION_HOURS} hours.`,
          );
        }
      }

      const reasonTrimmed = r.reason.trim();
      if (
        reasonTrimmed.length < MANUAL_ENTRY_REASON_MIN ||
        reasonTrimmed.length > MANUAL_ENTRY_REASON_MAX
      ) {
        errors.push(
          `Reason must be ${MANUAL_ENTRY_REASON_MIN}–${MANUAL_ENTRY_REASON_MAX} characters.`,
        );
      }

      if (inIso) {
        const timeCheck = validateManualEntryLocalTime({
          serviceDate: r.serviceDate,
          clockInAt: inIso,
          clockOutAt: outIso,
          timeZone,
        });
        if (!timeCheck.ok) errors.push(timeCheck.error);
      }

      const grossElapsed =
        inIso && outIso ? calculateGrossElapsed(inIso, outIso) : null;

      return {
        row: r,
        inIso,
        outIso,
        grossElapsed,
        errors,
      };
    });
  }, [rows, timeZone]);

  // Batch internal overlaps
  const batchOverlaps = useMemo(() => {
    const validRows = rowEvaluations
      .filter((e) => e.inIso && e.outIso)
      .map((e) => ({
        rowId: e.row.rowId,
        profileId: e.row.profileId,
        clockInAt: e.inIso!,
        clockOutAt: e.outIso!,
      }));
    return detectBatchOverlaps(validRows);
  }, [rowEvaluations]);

  const hasAnyRowErrors = rowEvaluations.some(
    (e) => e.errors.length > 0 || batchOverlaps.has(e.row.rowId),
  );

  const canReview = rows.length > 0 && !hasAnyRowErrors && !loadingEmployees;

  // Execute batch submission
  async function submitBatch(rowsToSubmit: BulkGridRow[]) {
    setSubmitting(true);
    const entries = rowsToSubmit
      .map((r) => {
        const inIso = localInputToInstant(
          `${r.serviceDate}T${r.clockInTime}`,
          timeZone,
        );
        const outIso = localInputToInstant(
          `${r.serviceDate}T${r.clockOutTime}`,
          timeZone,
        );
        if (!inIso || !outIso) return null;
        return {
          rowId: r.rowId,
          profileId: r.profileId,
          serviceDate: r.serviceDate,
          clockInAt: inIso,
          clockOutAt: outIso,
          reason: r.reason.trim(),
          idempotencyKey: r.idempotencyKey,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const res = await createBulkAttendanceEntriesAction({
      restaurantSlug,
      expectedLocationId: locationId,
      entries,
    });

    setSubmitting(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }

    setSubmissionResults((prev) => {
      const next = new Map(prev);
      for (const item of res.data.results) {
        next.set(item.rowId, item);
      }
      return next;
    });

    setStep("results");
  }

  const failedCount = useMemo(() => {
    let count = 0;
    for (const r of rows) {
      const res = submissionResults.get(r.rowId);
      if (!res || !res.ok) count++;
    }
    return count;
  }, [rows, submissionResults]);

  const succeededCount = rows.length - failedCount;

  function retryFailedRows() {
    const failedRows = rows.filter((r) => {
      const res = submissionResults.get(r.rowId);
      return !res || !res.ok;
    });
    void submitBatch(failedRows);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        step === "edit"
          ? "Bulk attendance entry"
          : step === "review"
            ? "Review bulk entries"
            : "Bulk submission results"
      }
      description={`Multi-shift entry grid for ${locationName} (${timeZone}).`}
      className="max-w-[min(96vw,56rem)]"
    >
      <div className="flex flex-col gap-4">
        {step === "edit" ? (
          <div className="flex flex-col gap-4">
            {employeeError ? (
              <p role="alert" className="text-destructive text-sm">
                {employeeError}
              </p>
            ) : null}

            {/* Shared Defaults Card */}
            <Card>
              <CardContent className="flex flex-col gap-3 pt-4 text-xs">
                <span className="text-foreground text-sm font-semibold">
                  Shared batch defaults
                </span>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="blk-def-date">Date</Label>
                    <Input
                      id="blk-def-date"
                      type="date"
                      value={defaultDate}
                      onChange={(e) => setDefaultDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="blk-def-in">Start time</Label>
                    <Input
                      id="blk-def-in"
                      type="time"
                      value={defaultInTime}
                      onChange={(e) => setDefaultInTime(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="blk-def-out">End time</Label>
                    <Input
                      id="blk-def-out"
                      type="time"
                      value={defaultOutTime}
                      onChange={(e) => setDefaultOutTime(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={applyDefaultsToAll}
                    >
                      Apply to all rows
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rows Table */}
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-2.5">Employee</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">In</th>
                    <th className="p-2.5">Out</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, idx) => {
                    const evalInfo = rowEvaluations[idx];
                    const overlapErr = batchOverlaps.get(r.rowId);
                    const allErrors = [
                      ...(evalInfo?.errors ?? []),
                      ...(overlapErr ? [overlapErr] : []),
                    ];

                    return (
                      <tr key={r.rowId} className="align-top">
                        <td className="p-2">
                          <Select
                            value={r.profileId}
                            onChange={(e) =>
                              updateRow(r.rowId, { profileId: e.target.value })
                            }
                            className="text-xs"
                          >
                            {employees.map((emp) => (
                              <option key={emp.profileId} value={emp.profileId}>
                                {emp.displayName}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="date"
                            value={r.serviceDate}
                            onChange={(e) =>
                              updateRow(r.rowId, {
                                serviceDate: e.target.value,
                              })
                            }
                            className="text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="time"
                            value={r.clockInTime}
                            onChange={(e) =>
                              updateRow(r.rowId, {
                                clockInTime: e.target.value,
                              })
                            }
                            className="text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="time"
                            value={r.clockOutTime}
                            onChange={(e) =>
                              updateRow(r.rowId, {
                                clockOutTime: e.target.value,
                              })
                            }
                            className="text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="text"
                            value={r.reason}
                            maxLength={MANUAL_ENTRY_REASON_MAX}
                            onChange={(e) =>
                              updateRow(r.rowId, { reason: e.target.value })
                            }
                            className="text-xs"
                          />
                          {allErrors.length > 0 ? (
                            <p className="text-destructive pt-1 text-[11px]">
                              {allErrors[0]}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeRow(r.rowId)}
                            disabled={rows.length <= 1}
                            className="text-destructive h-7 px-2 text-xs"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addRow}
                disabled={rows.length >= MAX_BULK_ENTRIES}
              >
                + Add row ({rows.length}/{MAX_BULK_ENTRIES})
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!canReview}
                  onClick={() => setStep("review")}
                >
                  Review {rows.length} shifts
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Verify all {rows.length} shifts before saving. Each row will be
              committed as an independent transaction with full audit tracking.
            </p>

            <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-2.5">Employee</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Interval</th>
                    <th className="p-2.5">Duration</th>
                    <th className="p-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowEvaluations.map(
                    ({ row, inIso, outIso, grossElapsed }) => {
                      const empName =
                        employees.find((e) => e.profileId === row.profileId)
                          ?.displayName ?? "Employee";

                      return (
                        <tr key={row.rowId}>
                          <td className="p-2.5 font-medium">{empName}</td>
                          <td className="p-2.5">{row.serviceDate}</td>
                          <td className="p-2.5">
                            {inIso ? formatInstantInZone(inIso, timeZone) : "—"}{" "}
                            →{" "}
                            {outIso
                              ? formatInstantInZone(outIso, timeZone)
                              : "—"}
                          </td>
                          <td className="p-2.5">
                            {grossElapsed !== null
                              ? formatWorkedDuration(grossElapsed)
                              : "—"}
                          </td>
                          <td className="text-muted-foreground p-2.5 italic">
                            {row.reason}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>

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
                onClick={() => void submitBatch(rows)}
              >
                {submitting
                  ? "Submitting entries…"
                  : `Confirm & Save ${rows.length} shifts`}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "results" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Badge
                tone={failedCount === 0 ? "success" : "warning"}
                className="px-3 py-1 font-medium"
              >
                {failedCount === 0
                  ? "All shifts saved successfully"
                  : `${succeededCount} of ${rows.length} shifts saved`}
              </Badge>
              {failedCount > 0 ? (
                <p className="text-destructive text-xs">
                  {failedCount} shift(s) encountered errors and can be retried.
                </p>
              ) : null}
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-2.5">Employee</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Times</th>
                    <th className="p-2.5">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const res = submissionResults.get(r.rowId);
                    const empName =
                      employees.find((e) => e.profileId === r.profileId)
                        ?.displayName ?? "Employee";

                    return (
                      <tr key={r.rowId}>
                        <td className="p-2.5 font-medium">{empName}</td>
                        <td className="p-2.5">{r.serviceDate}</td>
                        <td className="p-2.5">
                          {r.clockInTime} → {r.clockOutTime}
                        </td>
                        <td className="p-2.5">
                          {res?.ok ? (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Saved ({res.data?.status})
                            </span>
                          ) : (
                            <span className="text-destructive font-medium">
                              ✗ {res?.error || "Submission failed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {failedCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={retryFailedRows}
                >
                  {submitting
                    ? "Retrying…"
                    : `Retry ${failedCount} failed row(s)`}
                </Button>
              ) : null}
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
          Source: {NATIVE_REPORT_SOURCE_LABEL} · Operations are idempotency-safe
          per row
        </p>
      </div>
    </Dialog>
  );
}
