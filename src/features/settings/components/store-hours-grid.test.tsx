import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DayHours } from "@/hooks/use-restaurant-clock";

import { StoreHoursGrid } from "./store-hours-grid";

const hours: DayHours[] = [
  { opening: "11:00", closing: "23:00", closed: false }, // Sun
  { opening: "11:00", closing: "23:00", closed: false }, // Mon
  { opening: "11:00", closing: "23:00", closed: false }, // Tue
  { opening: "11:00", closing: "23:00", closed: false }, // Wed
  { opening: "11:00", closing: "23:00", closed: false }, // Thu
  { opening: "11:00", closing: "23:00", closed: false }, // Fri
  { opening: "00:00", closing: "00:00", closed: true }, // Sat
];

describe("StoreHoursGrid", () => {
  it("renders all seven days with their opening and closing times", () => {
    render(<StoreHoursGrid hours={hours} todayIndex={1} />);
    expect(screen.getAllByText("11:00 – 23:00")).toHaveLength(6);
  });

  it("shows a closed day as Closed instead of a time range", () => {
    render(<StoreHoursGrid hours={hours} todayIndex={1} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("highlights today's cell", () => {
    render(<StoreHoursGrid hours={hours} todayIndex={2} />);
    const tueLabel = screen.getByText("Tue");
    expect(tueLabel.className).toContain("text-primary");
  });
});
