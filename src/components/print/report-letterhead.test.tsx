import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportLetterhead } from "./report-letterhead";

describe("ReportLetterhead", () => {
  it("renders the report title, brand contact block, employee, and period", () => {
    render(
      <ReportLetterhead
        reportTitle="Monthly Attendance Timesheet"
        periodName="September 2026"
        employeeName="Mia Chen"
        employeeRole="Server"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The Monk's" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Monthly Attendance Timesheet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The Monk's Indian Fusion - Webster"),
    ).toBeInTheDocument();
    expect(screen.getByText("Webster, New York")).toBeInTheDocument();
    expect(screen.getByText("monkswebster.com")).toBeInTheDocument();
    expect(screen.getByText("Employee")).toBeInTheDocument();
    expect(screen.getByText("Mia Chen (Server)")).toBeInTheDocument();
    expect(screen.getByText("Pay Period")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("renders the employee name without a role suffix when no role is given", () => {
    render(
      <ReportLetterhead
        reportTitle="Payroll Compensation Statement"
        periodName="August 2026"
        employeeName="Leo Park"
      />,
    );
    expect(screen.getByText("Leo Park")).toBeInTheDocument();
  });

  it("hides the Employee block entirely when employeeName is omitted, but still shows Pay Period", () => {
    render(
      <ReportLetterhead
        reportTitle="Staff Attendance Report"
        periodName="September 2026"
      />,
    );
    expect(screen.queryByText("Employee")).not.toBeInTheDocument();
    expect(screen.getByText("Pay Period")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("embeds an inline SVG mark, never a raster <img>", () => {
    const { container } = render(
      <ReportLetterhead reportTitle="X" periodName="Y" employeeName="Z" />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});
