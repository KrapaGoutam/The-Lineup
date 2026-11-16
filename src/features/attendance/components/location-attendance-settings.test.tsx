import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationAttendanceSettings } from "./location-attendance-settings";
import * as actions from "../actions/attendance-mode-actions";

vi.mock("../actions/attendance-mode-actions", () => ({
  getLocationAttendanceModeAction: vi.fn(),
  setLocationAttendanceModeAction: vi.fn(),
}));

const legacy = {
  locationId: "00000000-0000-0000-0000-000000000001",
  organizationId: "00000000-0000-0000-0000-000000000002",
  mode: "EXTERNAL" as const,
  isConfigured: false,
  updatedAt: "2026-11-16T12:00:00Z",
  timeZone: "America/Chicago",
};

beforeEach(() => vi.resetAllMocks());

describe("LocationAttendanceSettings", () => {
  it("shows legacy status and mode guidance, then persists and rereads the setting", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAttendanceModeAction)
      .mockResolvedValueOnce({ ok: true, data: legacy })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...legacy,
          mode: "INTERNAL_THE_LINEUP",
          isConfigured: true,
          updatedAt: "2026-11-16T12:01:00Z",
        },
      });
    vi.mocked(actions.setLocationAttendanceModeAction).mockResolvedValue({
      ok: true,
      data: {
        ...legacy,
        mode: "INTERNAL_THE_LINEUP",
        isConfigured: true,
        updatedAt: "2026-11-16T12:01:00Z",
      },
    });

    render(
      <LocationAttendanceSettings
        locationId={legacy.locationId}
        locationName="League City"
      />,
    );
    expect(
      await screen.findByText(
        /Unconfigured \(legacy external-compatible reads/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Branch:/)).toHaveTextContent("League City");
    await user.selectOptions(
      screen.getByLabelText("Attendance mode"),
      "INTERNAL_THE_LINEUP",
    );
    expect(
      screen.getByText(/authorized registered device/),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Reason for change"),
      "Using native attendance",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(actions.setLocationAttendanceModeAction).toHaveBeenCalledWith({
        locationId: legacy.locationId,
        mode: "INTERNAL_THE_LINEUP",
        expectedUpdatedAt: legacy.updatedAt,
        reason: "Using native attendance",
      }),
    );
    expect(
      await screen.findByText("Attendance settings saved."),
    ).toBeInTheDocument();
    expect(actions.getLocationAttendanceModeAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Configured/)).toBeInTheDocument();
  });

  it("refreshes a conflict and makes the administrator review the latest mode", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.getLocationAttendanceModeAction)
      .mockResolvedValueOnce({ ok: true, data: legacy })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...legacy,
          mode: "DISABLED",
          isConfigured: true,
          updatedAt: "2026-11-16T12:02:00Z",
        },
      });
    vi.mocked(actions.setLocationAttendanceModeAction).mockResolvedValue({
      ok: false,
      code: "conflict",
      error: "Configuration conflict.",
    });
    render(
      <LocationAttendanceSettings
        locationId={legacy.locationId}
        locationName="NASA"
      />,
    );
    await screen.findByText(/Unconfigured/);
    await user.type(
      screen.getByLabelText("Reason for change"),
      "Choose external provider",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another administrator changed this branch",
    );
    expect(screen.getByLabelText("Attendance mode")).toHaveValue("DISABLED");
  });

  it("shows access denial without an editable form", async () => {
    vi.mocked(actions.getLocationAttendanceModeAction).mockResolvedValue({
      ok: false,
      error: "Location not found or access denied.",
    });
    render(
      <LocationAttendanceSettings
        locationId={legacy.locationId}
        locationName="NASA"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("access denied");
    expect(screen.queryByLabelText("Attendance mode")).not.toBeInTheDocument();
  });
});
