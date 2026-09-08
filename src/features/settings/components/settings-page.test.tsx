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
