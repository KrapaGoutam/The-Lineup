import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNativeAttendanceReportAction: vi.fn(),
  listLocationEmployeesAction: vi.fn(),
  getAttendanceSessionDetailAction: vi.fn(),
  correctAttendanceSessionAction: vi.fn(),
}));

vi.mock("@/features/attendance/actions/native-report-actions", () => mocks);
vi.mock("@/features/attendance/components/payroll-readiness-panel", () => ({
  PayrollReadinessPanel: () => (
    <div data-testid="payroll-readiness-panel">readiness</div>
  ),
}));

import type { AttendanceSourceView } from "@/features/attendance/actions/native-report-actions";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";
import { NativeAttendanceReport } from "./native-attendance-report";

const mockSource: AttendanceSourceView = {
  source: "internal",
  label: "TheLineup Internal",
  description: "Native clock tracking",
  locationId: "11111111-1111-1111-1111-111111111111",
  locationName: "Webster Branch",
  timeZone: "America/Chicago",
  canManage: true,
  organizationId: "monks-org-id",
  organizationName: "Monks",
  organizationSlug: "monks",
};

const sampleRow: NativeReportRow = {
  sessionId: "session-1",
  profileId: "emp-1",
  employeeName: "Alice Smith",
  locationId: "11111111-1111-1111-1111-111111111111",
  serviceDate: "2026-11-10",
  status: "completed",
  clockInAt: "2026-11-10T15:00:00Z",
  clockOutAt: "2026-11-10T23:00:00Z",
  grossElapsedSeconds: 28800,
  totalBreakSeconds: 1800,
  paidBreakSeconds: 1800,
  unpaidBreakSeconds: 0,
  unclassifiedBreakSeconds: 0,
  openBreakCount: 0,
  breakCount: 1,
  breakPolicyResolved: true,
  netPayableSeconds: 28800,
  version: 1,
  correctionCount: 0,
  lastCorrectedAt: null,
  source: "internal_the_lineup",
  timeZone: "America/Chicago",
};

describe("NativeAttendanceReport V2.0.6 monthly filters and print preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLocationEmployeesAction.mockResolvedValue({
      ok: true,
      data: [
        { profileId: "emp-1", displayName: "Alice Smith" },
        { profileId: "emp-2", displayName: "Bob Jones" },
      ],
    });
    mocks.getNativeAttendanceReportAction.mockResolvedValue({
      ok: true,
      data: {
        rows: [sampleRow],
        totals: {
          sessionCount: 1,
          openSessionCount: 0,
          closedSessionCount: 1,
          voidedSessionCount: 0,
          grossSeconds: 28800,
          breakSeconds: 1800,
          paidBreakSeconds: 1800,
          unpaidBreakSeconds: 0,
          unclassifiedBreakSeconds: 0,
          netPayableSeconds: 28800,
          resolvedNetPayableSeconds: 28800,
          unresolvedSessionCount: 0,
          hasUnresolvedBreaks: false,
        },
        truncated: false,
        timeZone: "America/Chicago",
        canManage: true,
      },
    });
  });

  it("renders monthly presets and navigates when clicking This Month and Last Month", async () => {
    render(
      <NativeAttendanceReport restaurantSlug="test-slug" source={mockSource} />,
    );

    expect(
      await screen.findByRole("button", { name: "This month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Last month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This week" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Print attendance statements" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "This month" }));

    await waitFor(() => {
      expect(mocks.getNativeAttendanceReportAction).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantSlug: "test-slug",
          startDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
          endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });
  });

  it("toggles multi-employee mode and filters by selected employees", async () => {
    render(
      <NativeAttendanceReport restaurantSlug="test-slug" source={mockSource} />,
    );

    await waitFor(() => {
      expect(mocks.getNativeAttendanceReportAction).toHaveBeenCalled();
    });

    const toggleBtn = await screen.findByRole("button", {
      name: "Select multiple...",
    });
    await userEvent.click(toggleBtn);

    expect(screen.getByText("Filter Multiple Employees")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Select all" }));

    await waitFor(() => {
      expect(mocks.getNativeAttendanceReportAction).toHaveBeenCalledWith(
        expect.objectContaining({
          profileIds: expect.arrayContaining(["emp-1", "emp-2"]),
        }),
      );
    });
  });

  it("opens UnifiedAttendancePrintDialog preview modal when clicking Print Statements", async () => {
    render(
      <NativeAttendanceReport restaurantSlug="test-slug" source={mockSource} />,
    );

    const printBtn = await screen.findByRole("button", {
      name: "Print attendance statements",
    });
    expect(printBtn).not.toBeDisabled();

    await userEvent.click(printBtn);

    const dialog = await screen.findByRole("dialog", {
      name: "Attendance Statement Print Preview",
    });
    expect(dialog).toBeInTheDocument();

    // Verify dynamic organization letterhead within the print preview
    expect(within(dialog).getByText("Monks")).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(/Webster Branch/).length,
    ).toBeGreaterThanOrEqual(1);

    // Verify timesheet table rendering in dialog
    expect(
      within(dialog).getAllByText("Alice Smith").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      within(dialog).getByRole("button", { name: /^Print$/i }),
    ).toBeInTheDocument();
  });
});
