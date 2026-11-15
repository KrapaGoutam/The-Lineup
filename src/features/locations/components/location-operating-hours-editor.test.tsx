import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocationOperatingHoursEditor } from "./location-operating-hours-editor";
import type { DayOperatingHours } from "@/features/locations/domain/location";

const MOCK_HOURS: DayOperatingHours[] = [
  { dayOfWeek: 0, openingLocal: null, closingLocal: null, closed: true },
  { dayOfWeek: 1, openingLocal: "11:00", closingLocal: "22:00", closed: false },
  { dayOfWeek: 2, openingLocal: "11:00", closingLocal: "22:00", closed: false },
  { dayOfWeek: 3, openingLocal: "11:00", closingLocal: "22:00", closed: false },
  { dayOfWeek: 4, openingLocal: "11:00", closingLocal: "23:00", closed: false },
  {
    dayOfWeek: 5,
    openingLocal: "17:00",
    closingLocal: "02:00",
    closed: false,
    isOvernight: true,
  },
  {
    dayOfWeek: 6,
    openingLocal: "17:00",
    closingLocal: "02:00",
    closed: false,
    isOvernight: true,
  },
];

describe("LocationOperatingHoursEditor", () => {
  it("renders all seven weekdays (HOURS-001, HOURS-002)", () => {
    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Thursday")).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
  });

  it("displays closed day accurately (HOURS-003)", () => {
    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Closed all day")).toBeInTheDocument();
  });

  it("displays overnight indicator when closing is next day (HOURS-007)", () => {
    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={vi.fn()}
      />,
    );

    const overnightBadges = screen.getAllByText("Closes next day");
    expect(overnightBadges.length).toBeGreaterThanOrEqual(2); // Friday and Saturday
  });

  it("allows editing opening and closing times and triggers save (HOURS-005, HOURS-006, HOURS-009)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ok: true });

    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={onSave}
      />,
    );

    const mondayOpenInput = screen.getByLabelText("Monday opening time");
    await user.clear(mondayOpenInput);
    await user.type(mondayOpenInput, "10:00");

    const saveBtn = screen.getByRole("button", {
      name: "Save Operating Hours",
    });
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          dayOfWeek: 1,
          openingLocal: "10:00",
          closed: false,
        }),
      ]),
    );

    expect(
      screen.getByText("Operating hours saved successfully."),
    ).toBeInTheDocument();
  });

  it("toggles closed day state (HOURS-003)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ok: true });

    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={onSave}
      />,
    );

    // Monday is currently open. Find all closed checkboxes and toggle Monday (index 1)
    const checkboxes = screen.getAllByRole("checkbox");
    // Monday checkbox
    await user.click(checkboxes[2]); // desktop/mobile pairs

    const saveBtn = screen.getByRole("button", {
      name: "Save Operating Hours",
    });
    await user.click(saveBtn);

    expect(onSave).toHaveBeenCalled();
  });

  it("preserves unsaved data on save error and allows retry (HOURS-010)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      ok: false,
      error: "Network failure while saving hours.",
    });

    render(
      <LocationOperatingHoursEditor
        initialHours={MOCK_HOURS}
        onSave={onSave}
      />,
    );

    const tuesdayOpen = screen.getByLabelText("Tuesday opening time");
    await user.clear(tuesdayOpen);
    await user.type(tuesdayOpen, "09:00");

    await user.click(
      screen.getByRole("button", { name: "Save Operating Hours" }),
    );

    expect(
      screen.getByText("Network failure while saving hours."),
    ).toBeInTheDocument();
    // Preserves edited input
    expect(screen.getByLabelText("Tuesday opening time")).toHaveValue("09:00");
  });
});
