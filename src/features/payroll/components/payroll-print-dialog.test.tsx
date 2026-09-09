import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PayrollPrintDialog } from "./payroll-print-dialog";
import type { PayrollPeriodWithBalance } from "@/features/payroll/domain/payroll-balance-metrics";

const users = [
  { id: 101, fullName: "Mia Chen", role: "Server" },
  { id: 102, fullName: "Leo Park", role: "Host" },
];

const periods: PayrollPeriodWithBalance[] = [
  {
    id: 1,
    neonUserId: 101,
    periodMonth: "2026-08-01",
    hoursSnapshot: 40,
    rateCentsSnapshot: 1500,
    grossCents: 60000,
    status: "locked",
    balanceCents: 20000, // open
  },
  {
    id: 2,
    neonUserId: 101,
    periodMonth: "2026-09-01",
    hoursSnapshot: 30,
    rateCentsSnapshot: 1500,
    grossCents: 45000,
    status: "locked",
    balanceCents: 0, // paid, not "open"
  },
  {
    id: 3,
    neonUserId: 102,
    periodMonth: "2026-09-01",
    hoursSnapshot: 20,
    rateCentsSnapshot: 1400,
    grossCents: 28000,
    status: "draft",
    balanceCents: 28000, // open
  },
];

describe("PayrollPrintDialog", () => {
  let printSpy: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    printSpy = vi.fn<() => void>();
    window.print = printSpy;
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it("defaults to the newest month and 'all employees' with no preselection", () => {
    render(
      <PayrollPrintDialog periods={periods} users={users} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue(
      "2026-09-01",
    );
    expect(
      screen.getByRole("radio", { name: "Print all employees" }),
    ).toBeChecked();
    // No "current employee" choice exists without a defaultNeonUserId.
    expect(
      screen.queryByText(/Print current employee/),
    ).not.toBeInTheDocument();
  });

  it("prints all employees for a specific month with the roster filename", async () => {
    render(
      <PayrollPrintDialog periods={periods} users={users} onClose={vi.fn()} />,
    );
    // Both Mia and Leo have a September period.
    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe("Staff Payroll Report Sep 2026");
    expect(document.querySelectorAll(".print-page-break")).toHaveLength(2);
  });

  it("pre-selects 'current employee' when opened with a defaultNeonUserId, and prints just them", async () => {
    render(
      <PayrollPrintDialog
        periods={periods}
        users={users}
        defaultNeonUserId={101}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", {
        name: "Print current employee (Mia Chen (Server))",
      }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe("Mia Chen (Server) Payroll Report Sep 2026");
    expect(document.querySelectorAll(".print-page-break")).toHaveLength(1);
  });

  it("'all open months' includes only positive-balance periods for the selected employee", async () => {
    render(
      <PayrollPrintDialog
        periods={periods}
        users={users}
        defaultNeonUserId={101}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Month" }),
      "all-open",
    );
    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe(
      "Mia Chen (Server) Payroll Report All Open Months",
    );
    // Mia's August period (balance 20000) is open; her September one
    // (balance 0) is not -- exactly one <td> row in the printed table,
    // not both of her periods. Scoped to <td> since "August 2026" also
    // appears as the (still-mounted, unrelated) month <option>.
    const printedMonthCells = document.querySelectorAll(
      ".print-timesheet-table tbody td:first-child",
    );
    expect(printedMonthCells).toHaveLength(1);
    expect(printedMonthCells[0]).toHaveTextContent("August 2026");
  });

  it("refuses to print with nothing selected under 'selected employees'", async () => {
    render(
      <PayrollPrintDialog periods={periods} users={users} onClose={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole("radio", { name: "Print selected employees" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(
      screen.getByText("Choose at least one employee."),
    ).toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("shows a specific error when the chosen scope has no matching periods", async () => {
    render(
      <PayrollPrintDialog periods={periods} users={users} onClose={vi.fn()} />,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Month" }),
      "2026-08-01",
    );
    await userEvent.click(
      screen.getByRole("radio", { name: "Print selected employees" }),
    );
    // Leo has no August period at all.
    await userEvent.click(screen.getByLabelText("Leo Park (Host)"));
    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(
      screen.getByText("Nobody selected has a period for that month."),
    ).toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("renders the shared letterhead once per printed employee", async () => {
    render(
      <PayrollPrintDialog periods={periods} users={users} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(printSpy).toHaveBeenCalled());

    expect(
      screen.getAllByText("The Monk's Indian Fusion - Webster"),
    ).toHaveLength(2);
  });
});
