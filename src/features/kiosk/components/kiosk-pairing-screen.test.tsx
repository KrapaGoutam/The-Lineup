import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KioskPairingScreen } from "./kiosk-pairing-screen";
import * as pairingActions from "../actions/kiosk-pairing-actions";

vi.mock("../actions/kiosk-pairing-actions", () => ({
  pairKioskDeviceAction: vi.fn(),
}));

describe("KioskPairingScreen Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header branding and empty code display boxes", () => {
    render(<KioskPairingScreen />);

    expect(
      screen.getByRole("heading", { name: /clock in \/ out kiosk/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pairing-code-display")).toBeInTheDocument();
    expect(screen.getByTestId("code-box-0")).toHaveTextContent("");
    expect(screen.getByTestId("code-box-5")).toHaveTextContent("");
    expect(screen.getByTestId("virtual-keypad")).toBeInTheDocument();
  });

  it("enters characters via virtual keypad buttons", async () => {
    const user = userEvent.setup();
    render(<KioskPairingScreen />);

    await user.click(screen.getByTestId("key-A"));
    await user.click(screen.getByTestId("key-B"));
    await user.click(screen.getByTestId("key-C"));

    expect(screen.getByTestId("code-box-0")).toHaveTextContent("A");
    expect(screen.getByTestId("code-box-1")).toHaveTextContent("B");
    expect(screen.getByTestId("code-box-2")).toHaveTextContent("C");
    expect(screen.getByTestId("code-box-3")).toHaveTextContent("");
  });

  it("removes characters on delete and resets on clear", async () => {
    const user = userEvent.setup();
    render(<KioskPairingScreen defaultCode="AB" />);

    expect(screen.getByTestId("code-box-0")).toHaveTextContent("A");
    expect(screen.getByTestId("code-box-1")).toHaveTextContent("B");

    // Click delete
    await user.click(screen.getByTestId("key-backspace"));
    expect(screen.getByTestId("code-box-1")).toHaveTextContent("");
    expect(screen.getByTestId("code-box-0")).toHaveTextContent("A");

    // Click clear
    await user.click(screen.getByTestId("key-clear"));
    expect(screen.getByTestId("code-box-0")).toHaveTextContent("");
  });

  it("submits pairing code and calls onPaired on success", async () => {
    const mockContext = {
      deviceId: "dev-1",
      deviceName: "Station 1",
      organizationId: "org-1",
      organizationName: "Grand Bistro",
      organizationSlug: "bistro",
      locationId: "loc-1",
      locationName: "Downtown",
      timeZone: "America/Chicago",
      status: "active" as const,
    };

    vi.mocked(pairingActions.pairKioskDeviceAction).mockResolvedValueOnce({
      ok: true,
      data: mockContext,
    });

    const onPaired = vi.fn();
    const user = userEvent.setup();
    render(<KioskPairingScreen onPaired={onPaired} />);

    // Type 6 characters
    await user.click(screen.getByTestId("key-2"));
    await user.click(screen.getByTestId("key-3"));
    await user.click(screen.getByTestId("key-4"));
    await user.click(screen.getByTestId("key-5"));
    await user.click(screen.getByTestId("key-6"));
    await user.click(screen.getByTestId("key-7"));

    await waitFor(() => {
      expect(pairingActions.pairKioskDeviceAction).toHaveBeenCalledWith({
        pairingCode: "234567",
      });
      expect(onPaired).toHaveBeenCalledWith(mockContext);
    });
  });

  it("shows error alert when pairing action returns error", async () => {
    vi.mocked(pairingActions.pairKioskDeviceAction).mockResolvedValueOnce({
      ok: false,
      error: "Pairing code has expired.",
    });

    const user = userEvent.setup();
    render(<KioskPairingScreen />);

    // Type 6 characters
    await user.click(screen.getByTestId("key-2"));
    await user.click(screen.getByTestId("key-3"));
    await user.click(screen.getByTestId("key-4"));
    await user.click(screen.getByTestId("key-5"));
    await user.click(screen.getByTestId("key-6"));
    await user.click(screen.getByTestId("key-7"));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-error-alert")).toHaveTextContent(
        "Pairing code has expired.",
      );
    });
  });
});
