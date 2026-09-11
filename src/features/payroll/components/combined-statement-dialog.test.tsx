import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCombinedMonthlyStatementAction } from "@/features/payroll/actions/statement-actions";
import type { CombinedMonthlyStatement } from "@/features/payroll/actions/statement-actions";
import { CombinedStatementDialog } from "./combined-statement-dialog";

vi.mock("@/features/payroll/actions/statement-actions", () => ({
  getCombinedMonthlyStatementAction: vi.fn(),
}));

const mockedGetStatement = vi.mocked(getCombinedMonthlyStatementAction);

afterEach(() => {
  vi.clearAllMocks();
});

function makeStatement(
  neonUserId: number,
  name: string,
  role: string,
): CombinedMonthlyStatement {
  return {
    restaurant: { name: "The Monk's Restaurant & Bar", slug: "the-monks" },
    employee: { neonUserId, name, role },
    period: { year: 2026, month: 9, monthLabel: "September 2026" },
    attendance: {
      rows: [],
      totalHours: 0,
      daysWorked: 0,
      avgHoursPerDay: 0,
    },
    payroll: null,
    generatedAt: "2026-09-01T00:00:00Z",
  };
}

describe("CombinedStatementDialog -- 'all' scope (Feature 031)", () => {
  it("fetches every employee in parallel and renders one print-page-break section each, with the roster heading", async () => {
    mockedGetStatement.mockImplementation(async ({ neonUserId }) => ({
      ok: true,
      data: makeStatement(neonUserId, `Employee ${neonUserId}`, "Server"),
    }));

    const { container } = render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "all", neonUserIds: [101, 102, 103] }}
        year={2026}
        month={9}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    expect(mockedGetStatement).toHaveBeenCalledTimes(3);

    // Feature 033: each employee is now two flat `.print-page-break`
    // pages (Attendance + Payroll, for duplex printing), so the
    // letterhead's name+role text node appears twice per employee --
    // once per page -- not once.
    await waitFor(() =>
      expect(screen.getAllByText(/Employee 101/)).toHaveLength(2),
    );
    expect(screen.getAllByText(/Employee 102/)).toHaveLength(2);
    expect(screen.getAllByText(/Employee 103/)).toHaveLength(2);

    expect(
      screen.getByText("Monthly Statements — All Employees"),
    ).toBeInTheDocument();
    expect(screen.getByText(/— 3 employees/)).toBeInTheDocument();

    expect(container.querySelectorAll(".print-page-break")).toHaveLength(6);
  });

  it("renders the successful statements and shows a partial-failure note when some fetches fail", async () => {
    mockedGetStatement.mockImplementation(async ({ neonUserId }) => {
      if (neonUserId === 102) {
        return { ok: false, error: "No payroll access for this employee." };
      }
      return {
        ok: true,
        data: makeStatement(neonUserId, `Employee ${neonUserId}`, "Server"),
      };
    });

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "all", neonUserIds: [101, 102, 103] }}
        year={2026}
        month={9}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Employee 101/)).toHaveLength(2),
    );
    expect(screen.getAllByText(/Employee 103/)).toHaveLength(2);
    expect(screen.queryByText(/Employee 102/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "1 statement could not be generated and is not included below.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a blocking error state when every statement fails to fetch", async () => {
    mockedGetStatement.mockResolvedValue({
      ok: false,
      error: "No payroll access for this employee.",
    });

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "all", neonUserIds: [101, 102] }}
        year={2026}
        month={9}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No payroll access for this employee."),
      ).toBeInTheDocument(),
    );
  });

  it("uses the 'Staff Payroll Statements <Mon> <Year>' filename for a multi-employee print, not the single-employee convention", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    mockedGetStatement.mockImplementation(async ({ neonUserId }) => ({
      ok: true,
      data: makeStatement(neonUserId, `Employee ${neonUserId}`, "Server"),
    }));

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "all", neonUserIds: [101, 102] }}
        year={2026}
        month={9}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Employee 101/)).toHaveLength(2),
    );

    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe("Staff Payroll Statements Sep 2026");

    printSpy.mockRestore();
  });
});

describe("CombinedStatementDialog -- clock-in/out timezone (bug fix)", () => {
  it("renders clock-in/out times in the restaurant's business timezone, not the test environment's default", async () => {
    const statement = makeStatement(101, "Employee 101", "Server");
    statement.attendance.rows = [
      {
        id: 1,
        userId: 101,
        date: "2026-09-10",
        // 16:06 UTC is 11:06 AM in America/Chicago during CDT (UTC-5).
        // Vitest's default test environment timezone is UTC, so this
        // would previously have rendered as "4:06 PM" (or worse, an
        // arbitrary offset on CI) without an explicit business
        // timeZone passed through to the dialog.
        clockIn: "2026-09-10T16:06:00.000Z",
        clockOut: "2026-09-10T23:30:00.000Z",
        hoursWorked: 7.4,
        autoClockedOut: false,
      },
    ];
    mockedGetStatement.mockResolvedValue({ ok: true, data: statement });

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "single", neonUserId: 101 }}
        year={2026}
        month={9}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("11:06 AM")).toBeInTheDocument(),
    );
    expect(screen.getByText("6:30 PM")).toBeInTheDocument();
    // The exact wrong reading the original bug would have produced for
    // the clock-in instant if formatted with no timezone in a UTC test
    // environment -- asserted absent so a regression can't silently
    // pass by coincidence.
    expect(screen.queryByText("4:06 PM")).not.toBeInTheDocument();
  });

  it("renders the same wall-clock reading correctly across a DST boundary (CST, winter)", async () => {
    const statement = makeStatement(101, "Employee 101", "Server");
    statement.attendance.rows = [
      {
        id: 1,
        userId: 101,
        date: "2026-01-10",
        // 17:06 UTC is 11:06 AM in America/Chicago during CST (UTC-6) --
        // a different UTC instant than the CDT case above, rendering to
        // the identical wall-clock time, proving the offset isn't
        // hardcoded anywhere in the render path.
        clockIn: "2026-01-10T17:06:00.000Z",
        clockOut: null,
        hoursWorked: null,
        autoClockedOut: false,
      },
    ];
    mockedGetStatement.mockResolvedValue({ ok: true, data: statement });

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "single", neonUserId: 101 }}
        year={2026}
        month={1}
        timeZone="America/Chicago"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("11:06 AM")).toBeInTheDocument(),
    );
  });
});
