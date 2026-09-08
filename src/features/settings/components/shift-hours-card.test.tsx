import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";

import { ShiftHoursCard } from "./shift-hours-card";

const shiftDefaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

describe("ShiftHoursCard", () => {
  it("renders the three shift defaults", () => {
    render(<ShiftHoursCard shiftDefaults={shiftDefaults} onEdit={vi.fn()} />);
    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("11:00 – 16:00")).toBeInTheDocument();
    expect(screen.getByText("Evening")).toBeInTheDocument();
    expect(screen.getByText("16:00 – 23:00")).toBeInTheDocument();
    expect(screen.getByText("Full day")).toBeInTheDocument();
    expect(screen.getByText("11:00 – 23:00")).toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<ShiftHoursCard shiftDefaults={shiftDefaults} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
