import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPayrollRateOptionsAction } from "@/features/payroll/actions/payroll-actions";

import { PayRatesSection } from "./pay-rates-section";

vi.mock("@/features/payroll/actions/payroll-actions", () => ({
  getPayrollRateOptionsAction: vi.fn(),
  setPayrollDefaultRateAction: vi.fn(),
  setPayrollRateOverrideAction: vi.fn(),
  removePayrollRateOverrideAction: vi.fn(),
}));

const mockedGetOptions = vi.mocked(getPayrollRateOptionsAction);

afterEach(() => {
  vi.clearAllMocks();
});

describe("PayRatesSection", () => {
  it("fetches and renders the rate settings once loaded", async () => {
    mockedGetOptions.mockResolvedValue({
      ok: true,
      data: { users: [], defaultRateCents: 1000, overrides: [] },
    });
    render(<PayRatesSection restaurantSlug="the-monks" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Pay rates")).toBeInTheDocument(),
    );
    expect(mockedGetOptions).toHaveBeenCalledWith({
      restaurantSlug: "the-monks",
    });
  });

  it("shows a retry action when the fetch fails", async () => {
    mockedGetOptions.mockResolvedValue({
      ok: false,
      error: "You don't have access to payroll.",
    });
    render(<PayRatesSection restaurantSlug="the-monks" />);
    await waitFor(() =>
      expect(
        screen.getByText("You don't have access to payroll."),
      ).toBeInTheDocument(),
    );
    mockedGetOptions.mockResolvedValue({
      ok: true,
      data: { users: [], defaultRateCents: null, overrides: [] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("Pay rates")).toBeInTheDocument(),
    );
  });
});
