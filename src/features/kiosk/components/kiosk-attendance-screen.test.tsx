import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KioskAttendanceScreen } from "./kiosk-attendance-screen";
import * as clockActions from "../actions/kiosk-clock-actions";
import type { KioskActiveContext } from "../domain/kiosk-device";
import type { KioskEmployeeSessionState } from "./kiosk-app";

vi.mock("../actions/kiosk-clock-actions", () => ({
  kioskGetActiveStatusAction: vi.fn(),
  kioskClockInAction: vi.fn(),
  kioskClockOutAction: vi.fn(),
  kioskBreakStartAction: vi.fn(),
  kioskBreakEndAction: vi.fn(),
  kioskClearSessionAction: vi.fn(),
  kioskGetEmployeeReportAction: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { rows: [] } }),
}));

describe("KioskAttendanceScreen Component", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders employee header and not clocked in status", async () => {
    vi.mocked(clockActions.kioskGetActiveStatusAction).mockResolvedValueOnce({
      ok: true,
      data: {
        employee: {
          profileId: "prof-1",
          displayName: "Alice Chef",
          organizationId: "org-1",
          locationId: "loc-1",
        },
        currentSession: null,
      },
    });

    render(
      <KioskAttendanceScreen
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
        onFinished={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Chef")).toBeInTheDocument();
    expect(
      screen.getByText(/the grand bistro • downtown/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("current-status-badge")).toHaveTextContent(
        "Not Clocked In",
      );
      expect(screen.getByTestId("clock-in-button")).toBeInTheDocument();
    });
  });

  it("handles clock-in operation and displays success card", async () => {
    vi.mocked(clockActions.kioskGetActiveStatusAction).mockResolvedValue({
      ok: true,
      data: {
        employee: {
          profileId: "prof-1",
          displayName: "Alice Chef",
          organizationId: "org-1",
          locationId: "loc-1",
        },
        currentSession: null,
      },
    });

    vi.mocked(clockActions.kioskClockInAction).mockResolvedValueOnce({
      ok: true,
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-1",
        eventId: 101,
        status: "active",
        clockInAt: new Date().toISOString(),
      },
    });

    const user = userEvent.setup();
    render(
      <KioskAttendanceScreen
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
        onFinished={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("clock-in-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("clock-in-button"));

    await waitFor(() => {
      expect(clockActions.kioskClockInAction).toHaveBeenCalled();
      expect(screen.getByTestId("success-confirmation")).toHaveTextContent(
        "Successfully Clocked In!",
      );
    });
  });

  it("clears session and returns to keypad on Finish click", async () => {
    vi.mocked(clockActions.kioskGetActiveStatusAction).mockResolvedValueOnce({
      ok: true,
      data: {
        employee: {
          profileId: "prof-1",
          displayName: "Alice Chef",
          organizationId: "org-1",
          locationId: "loc-1",
        },
        currentSession: null,
      },
    });

    const onFinished = vi.fn();
    const user = userEvent.setup();

    render(
      <KioskAttendanceScreen
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
        onFinished={onFinished}
      />,
    );

    await user.click(screen.getByTestId("finish-button"));

    await waitFor(() => {
      expect(clockActions.kioskClearSessionAction).toHaveBeenCalled();
      expect(onFinished).toHaveBeenCalled();
    });
  });
  it("D3: status card, actions and footer are excluded from print; the report dialog is not", async () => {
    vi.mocked(clockActions.kioskGetActiveStatusAction).mockResolvedValue({
      ok: true,
      data: {
        employee: {
          profileId: "prof-1",
          displayName: "Alice Chef",
          organizationId: "org-1",
          locationId: "loc-1",
        },
        currentSession: null,
      },
    });
    vi.mocked(clockActions.kioskGetEmployeeReportAction).mockResolvedValue({
      ok: true,
      data: { rows: [] },
    });

    const user = userEvent.setup();
    render(
      <KioskAttendanceScreen
        context={MOCK_CONTEXT}
        employee={MOCK_EMPLOYEE}
        onFinished={vi.fn()}
      />,
    );

    const badge = await screen.findByTestId("current-status-badge");
    const main = badge.closest("main");
    expect(main).not.toBeNull();
    // Current Status card, Clock In/Out + break controls live inside <main>.
    expect(main).toHaveClass("print:hidden");
    expect(main).toContainElement(screen.getByTestId("clock-in-button"));
    expect(
      screen.getByText(/always press finish/i).closest("footer"),
    ).toHaveClass("print:hidden");
    // Root must not paint the dark kiosk surface or reserve screen height on paper.
    expect(screen.getByTestId("kiosk-attendance-screen")).toHaveClass(
      "print:bg-white",
      "print:min-h-0",
    );

    await user.click(screen.getByTestId("view-timesheet-button"));
    const dialog = await screen.findByRole("dialog");
    // The printable report is a sibling of <main>, so main being print:hidden
    // cannot hide the timesheet.
    expect(main).not.toContainElement(dialog);
    expect(dialog).not.toHaveClass("print:hidden");
    expect(dialog.querySelector('[class~="print:hidden"]')).not.toBeNull();
  });
});
