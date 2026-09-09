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
