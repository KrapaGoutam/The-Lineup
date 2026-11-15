import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { KioskPairingScreen } from "./kiosk-pairing-screen";
import { PAIRING_CODE_ALPHABET } from "../domain/kiosk-device";
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

  describe("keypad and physical keyboard alphabet (D1)", () => {
    const typed = () =>
      [0, 1, 2, 3, 4, 5]
        .map((i) => screen.getByTestId(`code-box-${i}`).textContent ?? "")
        .join("");

    it("renders a key for every character the generator can emit, and no L", () => {
      render(<KioskPairingScreen />);
      for (const ch of PAIRING_CODE_ALPHABET) {
        expect(screen.getByTestId(`key-${ch}`)).toBeInTheDocument();
      }
      expect(screen.queryByTestId("key-L")).not.toBeInTheDocument();
      expect(
        screen
          .getByTestId("virtual-keypad")
          .querySelectorAll(
            "button[data-testid^='key-']:not([data-testid='key-clear']):not([data-testid='key-backspace'])",
          ),
      ).toHaveLength(PAIRING_CODE_ALPHABET.length);
    });

    it("accepts lowercase physical keyboard input, normalized to uppercase", async () => {
      const user = userEvent.setup();
      render(<KioskPairingScreen />);
      await user.keyboard("ab2");
      expect(typed()).toBe("AB2");
    });

    it("ignores unsupported keys without corrupting or advancing input", async () => {
      const user = userEvent.setup();
      render(<KioskPairingScreen />);
      await user.keyboard("A");
      // L (retired), ambiguous 0/1/O/I, punctuation, whitespace, Tab.
      await user.keyboard("lL01OI#- {Tab}{ArrowLeft}");
      expect(typed()).toBe("A");
      await user.keyboard("{Control>}c{/Control}");
      expect(typed()).toBe("A");
      expect(pairingActions.pairKioskDeviceAction).not.toHaveBeenCalled();
    });

    it("Backspace removes one character and Escape clears", async () => {
      const user = userEvent.setup();
      render(<KioskPairingScreen />);
      await user.keyboard("ABC");
      await user.keyboard("{Backspace}");
      expect(typed()).toBe("AB");
      await user.keyboard("{Escape}");
      expect(typed()).toBe("");
    });

    it("Enter re-submits a complete code through the canonical action", async () => {
      vi.mocked(pairingActions.pairKioskDeviceAction).mockResolvedValue({
        ok: false,
        error: "Invalid or expired pairing code.",
      });
      const user = userEvent.setup();
      render(<KioskPairingScreen />);
      await user.keyboard("abcdef");
      await waitFor(() =>
        expect(pairingActions.pairKioskDeviceAction).toHaveBeenCalledTimes(1),
      );
      expect(pairingActions.pairKioskDeviceAction).toHaveBeenCalledWith({
        pairingCode: "ABCDEF",
      });
      await waitFor(() =>
        expect(screen.getByTestId("pairing-error-alert")).toBeInTheDocument(),
      );
      await user.keyboard("{Enter}");
      await waitFor(() =>
        expect(pairingActions.pairKioskDeviceAction).toHaveBeenCalledTimes(2),
      );
    });

    it("Enter with an incomplete code does not submit", async () => {
      const user = userEvent.setup();
      render(<KioskPairingScreen />);
      await user.keyboard("ABC{Enter}");
      expect(pairingActions.pairKioskDeviceAction).not.toHaveBeenCalled();
    });
  });
});
