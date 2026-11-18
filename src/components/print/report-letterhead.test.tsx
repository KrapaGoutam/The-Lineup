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
    expect(screen.getByText("1416 FM 528 Rd, Suite D")).toBeInTheDocument();
    expect(screen.getByText("Webster, TX 77598")).toBeInTheDocument();
    expect(screen.queryByText(/New York/)).not.toBeInTheDocument();
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

  it("renders Liquor Tap League City with organization-name fallback and no SVG logo", () => {
    const { container } = render(
      <ReportLetterhead
        reportTitle="Monthly Attendance Timesheet"
        periodName="October 2026"
        employeeName="Jack Taylor"
        brand={{
          organizationName: "Liquor Tap",
          organizationSlug: "liquor-tap",
          locationName: "League City",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Liquor Tap" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Liquor Tap - League City")).toBeInTheDocument();
    // No address on record -> no guessed city line; never inherits Monks' address.
    expect(screen.queryByText(/League City, T/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Webster/)).not.toBeInTheDocument();
    expect(screen.getByText("Jack Taylor")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    // No unverified logo asset -> uses text mark
    expect(container.querySelectorAll("svg")).toHaveLength(0);
    expect(screen.getByText("LT")).toBeInTheDocument();
  });

  it("renders Liquor Tap NASA with correct branch title", () => {
    render(
      <ReportLetterhead
        reportTitle="Monthly Attendance Timesheet"
        periodName="October 2026"
        brand={{
          organizationName: "Liquor Tap",
          organizationSlug: "liquor-tap",
          locationName: "NASA",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Liquor Tap" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Liquor Tap - NASA")).toBeInTheDocument();
    expect(screen.queryByText(/Houston/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Webster/)).not.toBeInTheDocument();
    expect(screen.queryByText("monkswebster.com")).not.toBeInTheDocument();
  });

  it("prints the canonical location address when one is on record", () => {
    render(
      <ReportLetterhead
        reportTitle="Monthly Attendance Timesheet"
        periodName="October 2026"
        brand={{
          organizationName: "Liquor Tap",
          organizationSlug: "liquor-tap",
          locationName: "League City",
          locationAddress: {
            line1: "100 Main St",
            city: "League City",
            region: "TX",
            postalCode: "77573",
          },
        }}
      />,
    );
    expect(screen.getByText("100 Main St")).toBeInTheDocument();
    expect(screen.getByText("League City, TX 77573")).toBeInTheDocument();
  });

  it("ignores caller-supplied logo markup (only trusted constants reach raw HTML)", () => {
    const { container } = render(
      <ReportLetterhead
        reportTitle="X"
        periodName="Y"
        brand={
          {
            organizationName: "Evil Bistro",
            logoMarkup: '<script>alert(1)</script><path onload="x()"/>',
          } as never
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert(1)");
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("renders The Lineup platform fallback", () => {
    render(
      <ReportLetterhead
        reportTitle="System Attendance Audit"
        periodName="November 2026"
        brand={{
          organizationName: "The Lineup",
          organizationSlug: "the-lineup",
          locationName: "Operations",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The Lineup" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The Lineup - Operations")).toBeInTheDocument();
    expect(
      screen.getByText("Restaurant Management Platform"),
    ).toBeInTheDocument();
    expect(screen.getByText("TL")).toBeInTheDocument();
  });
});
