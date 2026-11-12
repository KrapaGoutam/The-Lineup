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
  describe("stale device list: reassigning a device revoked elsewhere (U-1)", () => {
    const REVOKED_MESSAGE =
      "This device has been revoked and can’t be reassigned. Pair the tablet again with a new pairing code.";

    it("shows the actionable error, reloads the real (revoked) state, and offers no Reassign for it", async () => {
      vi.mocked(adminActions.listKioskDevicesAction)
        .mockResolvedValueOnce({ ok: true, data: [MOCK_DEVICE] })
        .mockResolvedValueOnce({
          ok: true,
          data: [
            {
              ...MOCK_DEVICE,
              status: "revoked",
              credentialVersion: 2,
              revokedAt: "2026-11-12T10:00:00Z",
              revocationReason: "Lost tablet",
            },
          ],
        });
      vi.mocked(adminActions.reassignKioskDeviceAction).mockResolvedValueOnce({
        ok: false,
        error: REVOKED_MESSAGE,
      });

      const user = userEvent.setup();
      render(
        <LocationKioskManagement
          locationId={MOCK_LOC_ID}
          locationName={MOCK_LOC_NAME}
          availableLocations={[
            { id: MOCK_LOC_ID, name: MOCK_LOC_NAME },
            { id: "loc-2", name: "Uptown" },
          ]}
        />,
      );

      await user.click(
        await screen.findByLabelText("Reassign Front Host Stand"),
      );
      await user.click(
        await screen.findByRole("button", { name: /^reassign device$/i }),
      );

      await waitFor(() => {
        expect(adminActions.reassignKioskDeviceAction).toHaveBeenCalledWith({
          deviceId: "dev-1",
          newLocationId: "loc-2",
        });
      });
      // List was reloaded and the message survived the reload (fetchDevices clears errors).
      await waitFor(() =>
        expect(adminActions.listKioskDevicesAction).toHaveBeenCalledTimes(2),
      );
      expect(await screen.findByText(REVOKED_MESSAGE)).toBeInTheDocument();
      expect(screen.getByText("Revoked")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Reassign Front Host Stand"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: /reassign kiosk device/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("revoke dialog reason (D2: required, min 3 trimmed characters)", () => {
    async function openRevokeDialog() {
      vi.mocked(adminActions.listKioskDevicesAction).mockResolvedValue({
        ok: true,
        data: [MOCK_DEVICE],
      });
      const user = userEvent.setup();
      render(
        <LocationKioskManagement
          locationId={MOCK_LOC_ID}
          locationName={MOCK_LOC_NAME}
        />,
      );
      await user.click(await screen.findByLabelText("Revoke Front Host Stand"));
      const input = await screen.findByLabelText(/reason for revocation/i);
      const submit = screen.getByRole("button", { name: /^revoke device$/i });
      return { user, input, submit };
    }

    it("labels the reason required with the minimum and disables submit while empty", async () => {
      const { input, submit } = await openRevokeDialog();
      expect(
        screen.getByText(/required, at least 3 characters/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/(optional)/i)).not.toBeInTheDocument();
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("maxlength", "200");
      expect(submit).toBeDisabled();
    });

    it("rejects whitespace-only and too-short reasons with inline feedback and never calls the action", async () => {
      const { user, input, submit } = await openRevokeDialog();

      await user.type(input, "    ");
      expect(submit).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /at least 3 characters/i,
      );
      expect(input).toHaveAttribute("aria-invalid", "true");

      await user.clear(input);
      await user.type(input, " ab ");
      expect(submit).toBeDisabled();
      expect(screen.getByRole("alert")).toBeInTheDocument();

      expect(adminActions.revokeKioskDeviceAction).not.toHaveBeenCalled();
    });

    it("a valid reason (trimmed) reaches the canonical action and refreshes the list", async () => {
      vi.mocked(adminActions.revokeKioskDeviceAction).mockResolvedValueOnce({
        ok: true,
        data: undefined,
      } as never);
      const { user, input, submit } = await openRevokeDialog();

      await user.type(input, "  Lost tablet  ");
      expect(submit).toBeEnabled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await user.click(submit);

      await waitFor(() => {
        expect(adminActions.revokeKioskDeviceAction).toHaveBeenCalledWith({
          deviceId: "dev-1",
          reason: "Lost tablet",
        });
      });
      await waitFor(() =>
        expect(adminActions.listKioskDevicesAction).toHaveBeenCalledTimes(2),
      );
    });

    it("exactly three trimmed characters is accepted", async () => {
      const { user, input, submit } = await openRevokeDialog();
      await user.type(input, "abc");
      expect(submit).toBeEnabled();
    });

    it("Cancel closes without revoking and the next open starts clean", async () => {
      const { user, input } = await openRevokeDialog();
      await user.type(input, "x");
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(adminActions.revokeKioskDeviceAction).not.toHaveBeenCalled();
      // The native <dialog> stays mounted but closed (inaccessible).
      expect(
        screen.queryByRole("dialog", { name: /revoke kiosk device/i }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByLabelText("Revoke Front Host Stand"));
      const reopened = await screen.findByLabelText(/reason for revocation/i);
      expect(reopened).toHaveValue("");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
