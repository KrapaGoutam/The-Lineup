import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLocationEmployeesAction: vi.fn(),
  createManualAttendanceEntryAction: vi.fn(),
}));

vi.mock("@/features/attendance/actions/native-report-actions", () => ({
  listLocationEmployeesAction: mocks.listLocationEmployeesAction,
  createManualAttendanceEntryAction: mocks.createManualAttendanceEntryAction,
}));

import { AttendanceManualEntryDialog } from "./attendance-manual-entry-dialog";

const SLUG = "test-restaurant";
const LOC_ID = "00000000-0000-0000-0000-0000000000b1";
const LOC_NAME = "Downtown Bar";
const TZ = "America/Chicago";
const EMP_ID = "00000000-0000-0000-0000-0000000000c1";

describe("AttendanceManualEntryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-11-10T23:59:00Z"));
    mocks.listLocationEmployeesAction.mockResolvedValue({
      ok: true,
      data: [{ profileId: EMP_ID, displayName: "Sarah Connor" }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads employees and enables review when form is filled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <AttendanceManualEntryDialog
        restaurantSlug={SLUG}
        locationId={LOC_ID}
        locationName={LOC_NAME}
        timeZone={TZ}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    // Wait for employee to load
    await waitFor(() => {
      expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
    });

    const reviewBtn = screen.getByRole("button", { name: /review shift/i });
    expect(reviewBtn).toBeDisabled();

    // Fill in a valid reason
    const reasonInput = screen.getByLabelText(/reason for manual entry/i);
    await user.type(
      reasonInput,
      "Badge reader was offline during morning rush",
    );

    expect(reviewBtn).toBeEnabled();

    // Click review
    await user.click(reviewBtn);

    // Verify review summary
    expect(
      screen.getByRole("heading", { name: /review manual shift entry/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
    expect(screen.getAllByText(/Downtown Bar/)[0]).toBeInTheDocument();
    expect(screen.getByText("8h")).toBeInTheDocument();
    expect(
      screen.getByText(/Badge reader was offline during morning rush/),
    ).toBeInTheDocument();
  });

  it("submits the reviewed shift and calls onCreated on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    mocks.createManualAttendanceEntryAction.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-1",
        eventId: 10,
        status: "completed",
      },
    });

    render(
      <AttendanceManualEntryDialog
        restaurantSlug={SLUG}
        locationId={LOC_ID}
        locationName={LOC_NAME}
        timeZone={TZ}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
    });

    const reasonInput = screen.getByLabelText(/reason for manual entry/i);
    await user.type(reasonInput, "Employee forgot card");

    const reviewBtn = screen.getByRole("button", { name: /review shift/i });
    await user.click(reviewBtn);

    const confirmBtn = screen.getByRole("button", {
      name: /confirm & save shift/i,
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Shift Recorded Successfully/i),
      ).toBeInTheDocument();
    });

    expect(mocks.createManualAttendanceEntryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantSlug: SLUG,
        expectedLocationId: LOC_ID,
        profileId: EMP_ID,
        reason: "Employee forgot card",
      }),
    );

    const doneBtn = screen.getByRole("button", { name: /done/i });
    await user.click(doneBtn);

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("displays server error banner if submission fails", async () => {
    const user = userEvent.setup();
    mocks.createManualAttendanceEntryAction.mockResolvedValue({
      ok: false,
      code: "overlap",
      error: "This entry overlaps another attendance session for the employee.",
    });

    render(
      <AttendanceManualEntryDialog
        restaurantSlug={SLUG}
        locationId={LOC_ID}
        locationName={LOC_NAME}
        timeZone={TZ}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
    });

    const reasonInput = screen.getByLabelText(/reason for manual entry/i);
    await user.type(reasonInput, "Overlapping shift test");

    await user.click(screen.getByRole("button", { name: /review shift/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm & save shift/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/This entry overlaps another attendance session/),
      ).toBeInTheDocument();
    });
  });
});
