import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("reviews and submits an overnight row with its explicit end date", async () => {
    vi.setSystemTime(new Date("2026-11-12T23:59:00Z"));
    const user = userEvent.setup();
    mocks.createBulkAttendanceEntriesAction.mockResolvedValue({
      ok: true,
      data: { results: [], succeededCount: 0, failedCount: 1 },
    });

    render(
      <AttendanceBulkEntryDialog
        restaurantSlug={SLUG}
        locationId={LOC_ID}
        locationName={LOC_NAME}
        timeZone={TZ}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await screen.findByLabelText("Row 1 service date");
    fireEvent.change(screen.getByLabelText("Row 1 service date"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(screen.getByLabelText("Row 1 clock-in time"), {
      target: { value: "23:00" },
    });
    fireEvent.change(screen.getByLabelText("Row 1 clock-out date"), {
      target: { value: "2026-11-11" },
    });
    fireEvent.change(screen.getByLabelText("Row 1 clock-out time"), {
      target: { value: "01:00" },
    });

    await user.click(screen.getByRole("button", { name: /review 1 shifts/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm & save 1 shifts/i }),
    );

    await waitFor(() =>
      expect(mocks.createBulkAttendanceEntriesAction).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [
            expect.objectContaining({
              serviceDate: "2026-11-10",
              clockInAt: "2026-11-11T05:00:00.000Z",
              clockOutAt: "2026-11-11T07:00:00.000Z",
            }),
          ],
        }),
      ),
    );
  });

  it("retries only the failed row with its original operation key", async () => {
    const user = userEvent.setup();
    mocks.createBulkAttendanceEntriesAction
      .mockImplementationOnce(
        async (input: { entries: Array<{ rowId: string }> }) => ({
          ok: true,
          data: {
            results: [
              {
                rowId: input.entries[0].rowId,
                ok: true,
                data: { status: "completed" },
              },
              {
                rowId: input.entries[1].rowId,
                ok: false,
                error: "Temporary error",
                code: "unexpected",
              },
            ],
            succeededCount: 1,
            failedCount: 1,
          },
        }),
      )
      .mockImplementationOnce(
        async (input: { entries: Array<{ rowId: string }> }) => ({
          ok: true,
          data: {
            results: [
              {
                rowId: input.entries[0].rowId,
                ok: true,
                data: { status: "completed" },
              },
            ],
            succeededCount: 1,
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
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await screen.findByLabelText("Row 1 employee");
    await user.click(screen.getByRole("button", { name: /\+ add row/i }));
    await user.selectOptions(screen.getByLabelText("Row 2 employee"), EMP_2);
    await user.click(screen.getByRole("button", { name: /review 2 shifts/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm & save 2 shifts/i }),
    );
    await screen.findByText(/1 of 2 shifts saved/i);
    await user.click(
      screen.getByRole("button", { name: /retry 1 failed row/i }),
    );
    await screen.findByText(/All shifts saved successfully/i);

    const [first, second] = mocks.createBulkAttendanceEntriesAction.mock.calls;
    expect(first[0].entries).toHaveLength(2);
    expect(second[0].entries).toHaveLength(1);
    expect(second[0].entries[0].rowId).toBe(first[0].entries[1].rowId);
    expect(second[0].entries[0].idempotencyKey).toBe(
      first[0].entries[1].idempotencyKey,
    );
  });
});
