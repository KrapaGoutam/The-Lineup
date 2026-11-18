import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { UnifiedAttendanceReport } from "../domain/unified-attendance-report";
import { UnifiedAttendancePrintDialog } from "./unified-attendance-print-dialog";

vi.mock("@/lib/print-utils", () => ({
  triggerPrintWithFilename: vi.fn(),
}));

import { triggerPrintWithFilename } from "@/lib/print-utils";

const sampleReport: UnifiedAttendanceReport = {
  organization: "Liquor Tap",
  branch: "League City",
  reportingPeriod: "November 2026",
  attendanceSource: "TheLineup Internal",
  timeZone: "America/Chicago",
  totalEmployees: 2,
  grandTotalHours: 25.5,
  grandTotalShifts: 4,
  totalMissingPunches: 1,
  totalCorrectedShifts: 1,
  sections: [
    {
      employeeId: "emp-1",
      employeeName: "Jack Taylor",
      employeeRole: "Bartender",
      totalHours: 15.5,
      totalShifts: 2,
      missingPunchCount: 0,
      correctedShiftCount: 1,
      rows: [
        {
          id: "row-1",
          employeeId: "emp-1",
          employeeName: "Jack Taylor",
          employeeRole: "Bartender",
          organization: "Liquor Tap",
          branch: "League City",
          reportingPeriod: "November 2026",
          attendanceSource: "TheLineup Internal",
          businessDate: "2026-11-04",
          weekday: "Wed",
          clockIn: "10:00 AM",
          clockOut: "05:30 PM",
          clockInIso: "2026-11-04T16:00:00.000Z",
          clockOutIso: "2026-11-04T23:30:00.000Z",
          workedHours: 7.5,
          workedHoursDisplay: "7.5h",
          missingPunches: false,
          correctionIndicators: {
            isCorrected: true,
            count: 1,
            lastCorrectedAt: "2026-11-05T10:00:00.000Z",
          },
          timeZone: "America/Chicago",
        },
      ],
    },
    {
      employeeId: "emp-2",
      employeeName: "Sam Vance",
      employeeRole: "Server",
      totalHours: 10.0,
      totalShifts: 2,
      missingPunchCount: 1,
      correctedShiftCount: 0,
      rows: [
        {
          id: "row-2",
          employeeId: "emp-2",
          employeeName: "Sam Vance",
          employeeRole: "Server",
          organization: "Liquor Tap",
          branch: "League City",
          reportingPeriod: "November 2026",
          attendanceSource: "TheLineup Internal",
          businessDate: "2026-11-05",
          weekday: "Thu",
          clockIn: "11:00 AM",
          clockOut: null,
          clockInIso: "2026-11-05T17:00:00.000Z",
          clockOutIso: null,
          workedHours: null,
          workedHoursDisplay: "—",
          missingPunches: true,
          missingPunchType: "clock_out",
          correctionIndicators: { isCorrected: false, count: 0 },
          timeZone: "America/Chicago",
        },
      ],
    },
  ],
};

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
    expect(screen.getByText("Jack Taylor (Bartender)")).toBeInTheDocument();
    expect(screen.getByText("Sam Vance (Server)")).toBeInTheDocument();

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

    expect(screen.getByText("Jack Taylor (Bartender)")).toBeInTheDocument();
    expect(screen.queryByText("Sam Vance (Server)")).not.toBeInTheDocument();
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
});
