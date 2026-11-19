import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NativeReportRow } from "../domain/native-report";
import {
  normalizeNativeAttendanceToUnified,
  type UnifiedAttendanceReport,
} from "../domain/unified-attendance-report";
import { UnifiedAttendancePrintDialog } from "./unified-attendance-print-dialog";

vi.mock("@/lib/print-utils", () => ({
  triggerPrintWithFilename: vi.fn(),
}));

import { triggerPrintWithFilename } from "@/lib/print-utils";

function native(over: Partial<NativeReportRow>): NativeReportRow {
  return {
    sessionId: "s",
    profileId: "emp-1",
    employeeName: "Jack Taylor",
    locationId: "loc-1",
    serviceDate: "2026-11-04",
    status: "completed",
    clockInAt: "2026-11-04T16:00:00.000Z",
    clockOutAt: "2026-11-04T23:30:00.000Z",
    grossElapsedSeconds: 27000,
    totalBreakSeconds: 0,
    paidBreakSeconds: 0,
    unpaidBreakSeconds: 0,
    unclassifiedBreakSeconds: 0,
    openBreakCount: 0,
    breakCount: 0,
    breakPolicyResolved: true,
    netPayableSeconds: 27000,
    version: 1,
    correctionCount: 0,
    lastCorrectedAt: null,
    source: "internal_the_lineup",
    timeZone: "America/Chicago",
    ...over,
  };
}

const ROWS: NativeReportRow[] = [
  native({
    sessionId: "row-1",
    correctionCount: 1,
    lastCorrectedAt: "2026-11-05T10:00:00.000Z",
  }),
  native({
    sessionId: "row-2",
    profileId: "emp-2",
    employeeName: "Sam Vance",
    serviceDate: "2026-11-05",
    status: "active",
    clockInAt: "2026-11-05T17:00:00.000Z",
    clockOutAt: null,
    grossElapsedSeconds: null,
    netPayableSeconds: null,
  }),
];

const OPTIONS = {
  organization: "Liquor Tap",
  branch: "League City",
  reportingPeriod: "November 2026",
  timeZone: "America/Chicago",
};

const sampleReport: UnifiedAttendanceReport =
  normalizeNativeAttendanceToUnified(ROWS, OPTIONS);

describe("UnifiedAttendancePrintDialog", () => {
  it("renders preview with letterhead, metrics, and timesheet table", () => {
    const onClose = vi.fn();
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={onClose}
        initialTarget="all"
      />,
    );

    // Modal toolbar
    expect(
      screen.getByRole("heading", { name: "Attendance Statements" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Liquor Tap · League City · November 2026/),
    ).toBeInTheDocument();

    // Document contents: both employees rendered in "all" mode
    expect(screen.getAllByRole("heading", { name: "Liquor Tap" })).toHaveLength(
      2,
    );
    const area = within(
      document.getElementById("attendance-statement-print-area")!,
    );
    expect(area.getAllByText("Jack Taylor").length).toBeGreaterThan(0);
    expect(area.getAllByText("Sam Vance").length).toBeGreaterThan(0);

    // Badges & metrics
    expect(screen.getByText("Corrected (v1)")).toBeInTheDocument();
    expect(screen.getByText("Missing Punch")).toBeInTheDocument();

    // Signatures
    expect(screen.getAllByText("Employee Signature & Date")).toHaveLength(2);
  });

  it("filters preview to a single employee when selected", () => {
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={vi.fn()}
        initialTarget="emp-1"
      />,
    );

    const area = within(
      document.getElementById("attendance-statement-print-area")!,
    );
    expect(area.getAllByText("Jack Taylor").length).toBeGreaterThan(0);
    expect(area.queryByText("Sam Vance")).not.toBeInTheDocument();
  });

  it("triggers print with suggested filename and zero UI bleed classes", () => {
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={vi.fn()}
        initialTarget="all"
      />,
    );

    const printBtn = screen.getByRole("button", { name: /Print/i });
    fireEvent.click(printBtn);

    expect(triggerPrintWithFilename).toHaveBeenCalledWith(
      "Liquor Tap Attendance Report November 2026",
    );
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={onClose}
        initialTarget="all"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not print misleading 'Page X of Y' counts", () => {
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={vi.fn()}
        initialTarget="all"
      />,
    );
    expect(screen.queryByText(/Page d+ of d+/)).not.toBeInTheDocument();
  });

  it("shows exact aggregated totals, the hours basis and unresolved-shift notice", () => {
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={vi.fn()}
        initialTarget="all"
      />,
    );
    // 27000s = 7.5h for Jack; Sam's open shift contributes nothing.
    expect(screen.getAllByText("7.5h").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hours basis:/)).toHaveLength(2);
    expect(
      screen.getByText(/1 shift has no counted hours/),
    ).toBeInTheDocument();
  });

  it("refuses to print a partial (truncated) report and says why", () => {
    const partial = normalizeNativeAttendanceToUnified(ROWS, {
      ...OPTIONS,
      truncated: true,
    });
    render(
      <UnifiedAttendancePrintDialog
        report={partial}
        onClose={vi.fn()}
        initialTarget="all"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/incomplete/i);
    expect(screen.getByRole("button", { name: /Print/i })).toBeDisabled();
    // No statement is rendered at all, so browser print cannot output partial data.
    expect(
      document.getElementById("attendance-statement-print-area"),
    ).toBeNull();
    expect(screen.queryByText("Employee Signature & Date")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Print/i }));
    expect(triggerPrintWithFilename).not.toHaveBeenCalled();
  });

  it("titles a whole-month statement 'Monthly' and shows the year in the period (C0.1)", () => {
    const month = normalizeNativeAttendanceToUnified(ROWS, {
      ...OPTIONS,
      reportingPeriod: "November 2026",
      reportingPeriodKind: "month",
    });
    render(
      <UnifiedAttendancePrintDialog
        report={month}
        onClose={vi.fn()}
        initialTarget="emp-1"
      />,
    );
    const area = within(
      document.getElementById("attendance-statement-print-area")!,
    );
    expect(area.getByText("Monthly Staff Attendance Timesheet")).toBeVisible();
    expect(area.getAllByText(/November 2026/).length).toBeGreaterThan(0);
  });

  it("does not call a custom range a monthly timesheet", () => {
    const custom = normalizeNativeAttendanceToUnified(ROWS, {
      ...OPTIONS,
      reportingPeriod: "Sun, Nov 1 – Sun, Nov 15, 2026",
      reportingPeriodKind: "custom",
    });
    render(
      <UnifiedAttendancePrintDialog
        report={custom}
        onClose={vi.fn()}
        initialTarget="emp-1"
      />,
    );
    const area = within(
      document.getElementById("attendance-statement-print-area")!,
    );
    expect(area.queryByText(/Monthly Staff Attendance Timesheet/)).toBeNull();
    expect(area.getByText("Staff Attendance Statement")).toBeVisible();
    expect(area.getAllByText(/Nov 15, 2026/).length).toBeGreaterThan(0);
  });

  it("falls back to the neutral title when the period kind is unknown", () => {
    render(
      <UnifiedAttendancePrintDialog
        report={sampleReport}
        onClose={vi.fn()}
        initialTarget="emp-1"
      />,
    );
    expect(screen.queryByText(/Monthly Staff Attendance Timesheet/)).toBeNull();
  });
});
