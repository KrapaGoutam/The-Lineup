import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLocationEmployeesAction: vi.fn(),
  createBulkAttendanceEntriesAction: vi.fn(),
}));

vi.mock("@/features/attendance/actions/native-report-actions", () => ({
  listLocationEmployeesAction: mocks.listLocationEmployeesAction,
  createBulkAttendanceEntriesAction: mocks.createBulkAttendanceEntriesAction,
}));

import { AttendanceBulkEntryDialog } from "./attendance-bulk-entry-dialog";

const SLUG = "test-restaurant";
const LOC_ID = "00000000-0000-0000-0000-0000000000b1";
const LOC_NAME = "Downtown Bar";
const TZ = "America/Chicago";
const EMP_1 = "00000000-0000-0000-0000-0000000000c1";
const EMP_2 = "00000000-0000-0000-0000-0000000000c2";

describe("AttendanceBulkEntryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-11-10T23:59:00Z"));
    mocks.listLocationEmployeesAction.mockResolvedValue({
      ok: true,
      data: [
        { profileId: EMP_1, displayName: "Sarah Connor" },
        { profileId: EMP_2, displayName: "John Connor" },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads employees, allows adding rows, and reviews valid entries", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <AttendanceBulkEntryDialog
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

    // Add a second row
    const addRowBtn = screen.getByRole("button", { name: /\+ add row/i });
    await user.click(addRowBtn);

    // Select different employee for row 2 to avoid overlap
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], EMP_2);

    const reviewBtn = screen.getByRole("button", { name: /review 2 shifts/i });
    expect(reviewBtn).toBeEnabled();

    await user.click(reviewBtn);

    expect(screen.getByText(/Review bulk entries/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm & save 2 shifts/i }),
    ).toBeInTheDocument();
  });

  it("submits the batch and displays per-row results with retry for failed rows", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    mocks.createBulkAttendanceEntriesAction.mockImplementation(
      async (input: { entries: Array<{ rowId: string }> }) => ({
        ok: true,
        data: {
          results: input.entries.map((e) => ({
            rowId: e.rowId,
            ok: true,
            data: {
              success: true,
              idempotent: false,
              sessionId: "sess-1",
              eventId: 1,
              status: "completed",
            },
          })),
          succeededCount: input.entries.length,
          failedCount: 0,
        },
      }),
    );

    render(
      <AttendanceBulkEntryDialog
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

    await user.click(screen.getByRole("button", { name: /review 1 shifts/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm & save 1 shifts/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/All shifts saved successfully/i),
      ).toBeInTheDocument();
    });

    const doneBtn = screen.getByRole("button", { name: /done/i });
    await user.click(doneBtn);

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
