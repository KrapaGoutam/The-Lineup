import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LocationKioskManagement } from "./location-kiosk-management";
import * as adminActions from "../actions/kiosk-admin-actions";
import type { KioskDevice } from "../domain/kiosk-device";

vi.mock("../actions/kiosk-admin-actions", () => ({
  listKioskDevicesAction: vi.fn(),
  generateKioskPairingCodeAction: vi.fn(),
  renameKioskDeviceAction: vi.fn(),
  reassignKioskDeviceAction: vi.fn(),
  revokeKioskDeviceAction: vi.fn(),
}));

describe("LocationKioskManagement Component", () => {
  const MOCK_LOC_ID = "22222222-2222-2222-2222-222222222222";
  const MOCK_LOC_NAME = "Downtown";
  const MOCK_DEVICE: KioskDevice = {
    id: "dev-1",
    organizationId: "org-1",
    locationId: MOCK_LOC_ID,
    name: "Front Host Stand",
    status: "active",
    credentialVersion: 1,
    lastSeenAt: "2026-11-11T12:00:00Z",
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    createdAt: "2026-11-10T10:00:00Z",
    updatedAt: "2026-11-11T12:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header and empty state when no devices exist", async () => {
    vi.mocked(adminActions.listKioskDevicesAction).mockResolvedValueOnce({
      ok: true,
      data: [],
    });

    render(
      <LocationKioskManagement
        locationId={MOCK_LOC_ID}
        locationName={MOCK_LOC_NAME}
      />,
    );

    expect(screen.getByText("Station Kiosk Tablets")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /add kiosk device/i })[0],
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no kiosk devices paired/i)).toBeInTheDocument();
    });
  });

  it("loads and displays paired kiosk devices with status badges", async () => {
    vi.mocked(adminActions.listKioskDevicesAction).mockResolvedValueOnce({
      ok: true,
      data: [MOCK_DEVICE],
    });

    render(
      <LocationKioskManagement
        locationId={MOCK_LOC_ID}
        locationName={MOCK_LOC_NAME}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Front Host Stand")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Rename Front Host Stand"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Revoke Front Host Stand"),
      ).toBeInTheDocument();
    });
  });

  it("opens Pair New Tablet dialog and generates pairing code", async () => {
    vi.mocked(adminActions.listKioskDevicesAction).mockResolvedValueOnce({
      ok: true,
      data: [],
    });

    vi.mocked(
      adminActions.generateKioskPairingCodeAction,
    ).mockResolvedValueOnce({
      ok: true,
      data: {
        pairingId: "pair-1",
        locationId: MOCK_LOC_ID,
        organizationId: "org-1",
        deviceName: "Kitchen Terminal",
        pairingCode: "A2B3C4",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      },
    });

    const user = userEvent.setup();
    render(
      <LocationKioskManagement
        locationId={MOCK_LOC_ID}
        locationName={MOCK_LOC_NAME}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: /add kiosk device/i })[0],
    );

    expect(screen.getByText("Pair Kiosk Device")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/device name \/ label/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Kitchen Terminal");

    await user.click(
      screen.getByRole("button", { name: /generate pairing code/i }),
    );

    await waitFor(() => {
      expect(adminActions.generateKioskPairingCodeAction).toHaveBeenCalledWith({
        locationId: MOCK_LOC_ID,
        deviceName: "Kitchen Terminal",
      });
      expect(screen.getByText("A2B-3C4")).toBeInTheDocument();
    });
  });
});
