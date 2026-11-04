import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";
import type { DayHours } from "@/hooks/use-restaurant-clock";

import { SettingsPage } from "./settings-page";

vi.mock("./pay-rates-section", () => ({
  PayRatesSection: () => <div data-testid="pay-rates-section" />,
}));

const shiftDefaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

const operatingHours: DayHours[] = Array.from({ length: 7 }, () => ({
  opening: "11:00",
  closing: "23:00",
  closed: false,
}));

function baseProps() {
  return {
    restaurantSlug: "the-monks",
    timeZone: "America/Chicago",
    operatingHours,
    shiftDefaults,
    todayIndex: 2,
    onEditHours: vi.fn(),
    onChangePasscode: vi.fn(),
    onGoToTab: vi.fn(),
    onSignOut: vi.fn(),
    onBack: vi.fn(),
  };
}

describe("SettingsPage", () => {
  it("shows every configuration card and Pay rates for a manager in real mode", () => {
    render(<SettingsPage {...baseProps()} isManager demoMode={false} />);
    expect(
      screen.getByRole("heading", { name: "Shift hours" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Store hours" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Locations" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pay-rates-section")).toBeInTheDocument();
    expect(screen.getByText("Change your passcode")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Appearance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    // Manager sees an edit trigger on the store hours card.
    expect(
      screen.getByRole("button", { name: "Edit hours" }),
    ).toBeInTheDocument();
  });

  it("opens Location Administration subview when Locations card is clicked, and returns on Back", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<SettingsPage {...baseProps()} isManager demoMode />);
    const locationsHeading = screen.getByRole("heading", { name: "Locations" });
    const locationsBtn = locationsHeading.closest("button")!;
    expect(locationsBtn).toBeInTheDocument();

    await user.click(locationsBtn);

    // In demoMode, LocationAdministration renders with title "Locations" and description
    expect(
      screen.getByRole("heading", { name: "Locations", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage restaurant branches, addresses, time zones and operating hours.",
      ),
    ).toBeInTheDocument();

    // Clicking back in LocationAdministration returns to main Settings view
    const backBtn = screen.getByRole("button", { name: "Back to Settings" });
    await user.click(backBtn);

    expect(
      screen.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeInTheDocument();
  });

  it("hides Pay rates for a manager in demo mode", () => {
    render(<SettingsPage {...baseProps()} isManager demoMode />);
    expect(screen.queryByTestId("pay-rates-section")).not.toBeInTheDocument();
  });

  it("shows only personal account settings and read-only store hours for staff", () => {
    render(
      <SettingsPage {...baseProps()} isManager={false} demoMode={false} />,
    );
    expect(
      screen.queryByRole("heading", { name: "Shift hours" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Locations" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Team" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Schedule" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-rates-section")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit hours" }),
    ).not.toBeInTheDocument();

    // Store hours, passcode, appearance, and sign out remain.
    expect(
      screen.getByRole("heading", { name: "Store hours" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Change your passcode")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Appearance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });
});
