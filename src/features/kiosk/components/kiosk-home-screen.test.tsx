import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KioskHomeScreen } from "./kiosk-home-screen";
import * as clockActions from "../actions/kiosk-clock-actions";
import type { KioskActiveContext } from "../domain/kiosk-device";

vi.mock("../actions/kiosk-clock-actions", () => ({
  kioskAuthenticatePinAction: vi.fn(),
}));

describe("KioskHomeScreen Component", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders station branding, location, device name, and live clock", () => {
    render(
      <KioskHomeScreen context={MOCK_CONTEXT} onAuthenticated={vi.fn()} />,
    );

    expect(screen.getByText("The Grand Bistro")).toBeInTheDocument();
    expect(screen.getByText("Downtown")).toBeInTheDocument();
    expect(screen.getByText("Front Host Stand")).toBeInTheDocument();
    expect(screen.getByTestId("live-clock-time")).toBeInTheDocument();
    expect(screen.getByTestId("pin-dots-display")).toBeInTheDocument();
    expect(screen.getByTestId("numeric-keypad")).toBeInTheDocument();
  });

  it("enters digits on keypad and auto-submits on 4th digit", async () => {
    vi.mocked(clockActions.kioskAuthenticatePinAction).mockResolvedValueOnce({
      ok: true,
      data: {
        employee: {
          profileId: "prof-1",
          displayName: "Alice Chef",
          organizationId: "org-1",
          locationId: "loc-1",
          roles: ["server"],
        },
        currentSession: null,
      },
    });

    const onAuthenticated = vi.fn();
    const user = userEvent.setup();

    render(
      <KioskHomeScreen
        context={MOCK_CONTEXT}
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.click(screen.getByTestId("digit-1"));
    await user.click(screen.getByTestId("digit-2"));
    await user.click(screen.getByTestId("digit-3"));
    await user.click(screen.getByTestId("digit-4"));

    await waitFor(() => {
      expect(clockActions.kioskAuthenticatePinAction).toHaveBeenCalledWith({
        pin: "1234",
      });
      expect(onAuthenticated).toHaveBeenCalledWith({
        profileId: "prof-1",
        displayName: "Alice Chef",
        organizationId: "org-1",
        locationId: "loc-1",
        roles: ["server"],
      });
    });
  });

  it("clears digits on Clear button click", async () => {
    const user = userEvent.setup();
    render(
      <KioskHomeScreen context={MOCK_CONTEXT} onAuthenticated={vi.fn()} />,
    );

    await user.click(screen.getByTestId("digit-7"));
    await user.click(screen.getByTestId("digit-8"));

    const dot0 = screen.getByTestId("pin-dot-0");
    const dot1 = screen.getByTestId("pin-dot-1");
    expect(dot0).toHaveClass("bg-[#f2a65a]");
    expect(dot1).toHaveClass("bg-[#f2a65a]");

    await user.click(screen.getByTestId("keypad-clear"));
    expect(dot0).not.toHaveClass("bg-[#f2a65a]");
    expect(dot1).not.toHaveClass("bg-[#f2a65a]");
  });

  it("displays error alert when PIN is invalid", async () => {
    vi.mocked(clockActions.kioskAuthenticatePinAction).mockResolvedValueOnce({
      ok: false,
      error: "PIN not recognized.",
      code: "invalid_pin",
    });

    const user = userEvent.setup();
    render(
      <KioskHomeScreen context={MOCK_CONTEXT} onAuthenticated={vi.fn()} />,
    );

    await user.click(screen.getByTestId("digit-9"));
    await user.click(screen.getByTestId("digit-9"));
    await user.click(screen.getByTestId("digit-9"));
    await user.click(screen.getByTestId("digit-9"));

    await waitFor(() => {
      expect(screen.getByTestId("pin-error-alert")).toHaveTextContent(
        "PIN not recognized.",
      );
    });
  });
});
