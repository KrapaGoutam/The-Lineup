import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KioskReportDialog } from "./kiosk-report-dialog";
import * as clockActions from "../actions/kiosk-clock-actions";
import type { KioskActiveContext } from "../domain/kiosk-device";
import type { KioskEmployeeSessionState } from "./kiosk-app";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";

vi.mock("../actions/kiosk-clock-actions", () => ({
  kioskGetEmployeeReportAction: vi.fn(),
}));

describe("KioskReportDialog Component", () => {
  const MOCK_CONTEXT: KioskActiveContext = {
    deviceId: "dev-1",
    deviceName: "Front Host Stand",
    organizationId: "org-1",
    organizationName: "The Grand Bistro",
    organizationSlug: "grand-bistro",
    locationId: "loc-1",
    locationName: "Downtown",
    timeZone: "America/Chicago",
    status: "active",
  };

  const MOCK_EMPLOYEE: KioskEmployeeSessionState = {
    profileId: "prof-1",
    displayName: "Alice Chef",
    organizationId: "org-1",
    locationId: "loc-1",
    roles: ["server"],
  };

  const MOCK_ROWS: NativeReportRow[] = [
    {
      sessionId: "sess-1",
      profileId: "prof-1",
      employeeName: "Alice Chef",
      locationId: "loc-1",
      serviceDate: "2026-11-10",
      status: "completed",
      clockInAt: "2026-11-10T10:00:00Z",
      clockOutAt: "2026-11-10T18:00:00Z",
      grossElapsedSeconds: 28800,
      totalBreakSeconds: 1800,
      paidBreakSeconds: 0,
      unpaidBreakSeconds: 1800,
      unclassifiedBreakSeconds: 0,
      openBreakCount: 0,
      breakCount: 1,
      breakPolicyResolved: true,
      netPayableSeconds: 27000,
      version: 1,
      correctionCount: 0,
      lastCorrectedAt: null,
      source: "internal_the_lineup",
      timeZone: "America/Chicago",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders timesheet dialog with metrics and table rows", async () => {
    vi.mocked(clockActions.kioskGetEmployeeReportAction).mockResolvedValueOnce({
      ok: true,
      data: { rows: MOCK_ROWS },
    });

    render(
      <KioskReportDialog
        open={true}
        onClose={vi.fn()}
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
      />,
    );

    expect(screen.getByText("My Attendance Timesheet")).toBeInTheDocument();
    expect(screen.getByText(/alice chef • downtown/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Total Hours")).toBeInTheDocument();
      expect(screen.getByText("Total Shifts")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
    });
  });

  it("triggers window.print on Print button click", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    vi.mocked(clockActions.kioskGetEmployeeReportAction).mockResolvedValueOnce({
      ok: true,
      data: { rows: MOCK_ROWS },
    });

    const user = userEvent.setup();
    render(
      <KioskReportDialog
        open={true}
        onClose={vi.fn()}
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("print-timesheet-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("print-timesheet-button"));

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
