import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generatePayrollForEmployeesAction,
  getPayrollAccessAction,
  getPayrollDashboardAction,
  getPayrollGenerationEligibilityAction,
  getPayrollLedgerAction,
  getPayrollRateOptionsAction,
  listPayrollPeriodsAction,
} from "@/features/payroll/actions/payroll-actions";
import { getCombinedMonthlyStatementAction } from "@/features/payroll/actions/statement-actions";
import { CombinedStatementDialog } from "./combined-statement-dialog";
import { PayrollWorkspace } from "./payroll-workspace";

vi.mock("@/features/payroll/actions/payroll-actions", () => ({
  getPayrollAccessAction: vi.fn(),
  getPayrollRateOptionsAction: vi.fn(),
  getPayrollDashboardAction: vi.fn(),
  listPayrollPeriodsAction: vi.fn(),
  getPayrollLedgerAction: vi.fn(),
  recordPayrollPaymentAction: vi.fn(),
  recordAdjustmentAction: vi.fn(),
  confirmPayrollPaymentAction: vi.fn(),
  deletePayrollPaymentAction: vi.fn(),
  editPayrollPaymentAction: vi.fn(),
  generatePayrollPeriodAction: vi.fn(),
  generatePayrollForEmployeesAction: vi.fn(),
  getPayrollGenerationEligibilityAction: vi.fn(),
  regeneratePayrollPeriodAction: vi.fn(),
  lockPayrollPeriodAction: vi.fn(),
}));

vi.mock("@/features/payroll/actions/statement-actions", () => ({
  getCombinedMonthlyStatementAction: vi.fn(),
}));

const mockedGetAccess = vi.mocked(getPayrollAccessAction);
const mockedGetRateOptions = vi.mocked(getPayrollRateOptionsAction);
const mockedGetDashboard = vi.mocked(getPayrollDashboardAction);
const mockedListPeriods = vi.mocked(listPayrollPeriodsAction);
const mockedGetLedger = vi.mocked(getPayrollLedgerAction);
const mockedGetStatement = vi.mocked(getCombinedMonthlyStatementAction);
const mockedGetEligibility = vi.mocked(getPayrollGenerationEligibilityAction);
const mockedGenerateForEmployees = vi.mocked(generatePayrollForEmployeesAction);

afterEach(() => {
  vi.clearAllMocks();
});

describe("PayrollWorkspace", () => {
  it("renders SelfPayrollView for regular staff with 'My Payroll' heading and no admin controls", async () => {
    mockedGetAccess.mockResolvedValue({
      ok: true,
      data: {
        scope: "self",
        neonUserId: 101,
        person: {
          id: 101,
          fullName: "Mia Chen",
          role: "Server",
          phone: null,
          createdAt: "2026-01-01T00:00:00Z",
          isActive: true,
        },
      },
    });
    mockedGetDashboard.mockResolvedValue({
      ok: true,
      data: {
        totalBalanceOwedCents: 60000,
        previousMonthGeneratedCents: 60000,
        owedThisMonthCents: 0,
        owedLastMonthCents: 60000,
        oldestOpenPeriod: null,
        perPerson: [
          {
            neonUserId: 101,
            balanceCents: 60000,
            totalGeneratedCents: 60000,
          },
        ],
        periods: [],
      },
    });
    mockedListPeriods.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 1,
          organizationId: "org-1",
          neonUserId: 101,
          periodMonth: "2026-08-01",
          hoursSnapshot: 40,
          rateCentsSnapshot: 1500,
          grossCents: 60000,
          status: "locked",
          generatedAt: "2026-09-01T00:00:00Z",
          generatedBy: "admin-1",
          regeneratedAt: null,
          regeneratedBy: null,
          lockedAt: "2026-09-01T01:00:00Z",
          lockedBy: "admin-1",
        },
      ],
    });
    mockedGetLedger.mockResolvedValue({
      ok: true,
      data: {
        period: {
          id: 1,
          organizationId: "org-1",
          neonUserId: 101,
          periodMonth: "2026-08-01",
          hoursSnapshot: 40,
          rateCentsSnapshot: 1500,
          grossCents: 60000,
          status: "locked",
          generatedAt: "2026-09-01T00:00:00Z",
          generatedBy: "admin-1",
          regeneratedAt: null,
          regeneratedBy: null,
          lockedAt: "2026-09-01T01:00:00Z",
          lockedBy: "admin-1",
        },
        payments: [],
        adjustments: [],
        balance: {
          grossCents: 60000,
          confirmedPaymentsCents: 0,
          draftPaymentsCents: 0,
          adjustmentsCents: 0,
          balanceCents: 60000,
          fullyPaid: false,
        },
        organizationName: "The Monk's Restaurant & Bar",
      },
    });

    render(
      <PayrollWorkspace
        restaurantSlug="the-monks"
        timeZone="America/Chicago"
        onGoToPayRates={vi.fn()}
      />,
    );

    // Shows loading then My Payroll header
    await waitFor(() =>
      expect(screen.getByText("My Payroll")).toBeInTheDocument(),
    );

    // Ledger for selected month is rendered
    await waitFor(() =>
      expect(screen.getByText("August 2026 ledger")).toBeInTheDocument(),
    );
    expect(screen.getByText("Combined statement")).toBeInTheDocument();

    // Verifies admin controls are NOT rendered
    expect(screen.queryByText("Generate Payroll")).not.toBeInTheDocument();
    expect(screen.queryByText("Pay rates")).not.toBeInTheDocument();
    expect(screen.queryByText("Record payment")).not.toBeInTheDocument();
  });

  it("renders PrivilegedPayrollView with Option 1k layout and 3 KPI cards for managers, without inline RateSettings", async () => {
    mockedGetAccess.mockResolvedValue({
      ok: true,
      data: { scope: "all" },
    });
    mockedGetRateOptions.mockResolvedValue({
      ok: true,
      data: {
        users: [
          {
            id: 101,
            fullName: "Mia Chen",
            role: "Server",
            phone: null,
            createdAt: "2026-01-01T00:00:00Z",
            isActive: true,
          },
        ],
        defaultRateCents: 1500,
        overrides: [],
      },
    });
    mockedGetDashboard.mockResolvedValue({
      ok: true,
      data: {
        totalBalanceOwedCents: 125000,
        previousMonthGeneratedCents: 90000,
        owedThisMonthCents: 45000,
        owedLastMonthCents: 80000,
        oldestOpenPeriod: {
          periodMonth: "2026-08-01",
          neonUserId: 101,
          balanceCents: 80000,
        },
        perPerson: [
          {
            neonUserId: 101,
            balanceCents: 80000,
            totalGeneratedCents: 150000,
          },
        ],
        periods: [
          {
            id: 1,
            neonUserId: 101,
            periodMonth: "2026-08-01",
            hoursSnapshot: 40,
            rateCentsSnapshot: 1500,
            grossCents: 60000,
            status: "locked",
            balanceCents: 30000,
          },
        ],
      },
    });

    const onGoToPayRates = vi.fn();
    render(
      <PayrollWorkspace
        restaurantSlug="the-monks"
        timeZone="America/Chicago"
        onGoToPayRates={onGoToPayRates}
      />,
    );

    // Verifies 3 Option 1k KPI cards
    await waitFor(() =>
      expect(screen.getByText("Overall balance owed")).toBeInTheDocument(),
    );
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("Last month")).toBeInTheDocument();

    // Verifies Option 1k layout headings
    expect(
      screen.getByText("Balances by person and month"),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance per person")).toBeInTheDocument();

    // Verifies part-paid badge rendered in the sub-table (gross 60000, balance 30000 => part-paid)
    expect(screen.getByText("Part-paid")).toBeInTheDocument();

    // Verifies header toolbar buttons
    const payRatesButton = screen.getByRole("button", { name: "Pay rates" });
    expect(payRatesButton).toBeInTheDocument();
    await userEvent.click(payRatesButton);
    expect(onGoToPayRates).toHaveBeenCalled();

    // Verifies RateSettings is NOT duplicated inline on the page
    expect(
      screen.queryByText("Set fallback rate applied to anyone without one"),
    ).not.toBeInTheDocument();
  });

  it("bulk-generates payroll for a manager-chosen subset, defaults the checklist to not-yet-generated employees, and reports the mixed outcome clearly", async () => {
    mockedGetAccess.mockResolvedValue({ ok: true, data: { scope: "all" } });
    mockedGetRateOptions.mockResolvedValue({
      ok: true,
      data: {
        users: [
          {
            id: 101,
            fullName: "Mia Chen",
            role: "Server",
            phone: null,
            createdAt: "2026-01-01T00:00:00Z",
            isActive: true,
          },
          {
            id: 102,
            fullName: "Leo Park",
            role: "Server",
            phone: null,
            createdAt: "2026-01-01T00:00:00Z",
            isActive: true,
          },
        ],
        defaultRateCents: 1500,
        overrides: [],
      },
    });
    mockedGetDashboard.mockResolvedValue({
      ok: true,
      data: {
        totalBalanceOwedCents: 0,
        previousMonthGeneratedCents: 0,
        owedThisMonthCents: 0,
        owedLastMonthCents: 0,
        oldestOpenPeriod: null,
        perPerson: [],
        periods: [],
      },
    });
    // Mia already has a period for the chosen month; Leo doesn't --
    // the checklist should default to selecting only Leo.
    mockedGetEligibility.mockResolvedValue({
      ok: true,
      data: [
        { neonUserId: 101, fullName: "Mia Chen", alreadyGenerated: true },
        { neonUserId: 102, fullName: "Leo Park", alreadyGenerated: false },
      ],
    });
    mockedGenerateForEmployees.mockResolvedValue({
      ok: true,
      data: {
        successful: [
          {
            neonUserId: 102,
            period: {
              id: 5,
              organizationId: "org-1",
              neonUserId: 102,
              periodMonth: "2026-09-01",
              hoursSnapshot: 80,
              rateCentsSnapshot: 1500,
              grossCents: 120000,
              status: "draft",
              generatedAt: "2026-09-10T00:00:00Z",
              generatedBy: "manager-1",
              regeneratedAt: null,
              regeneratedBy: null,
              lockedAt: null,
              lockedBy: null,
            },
          },
        ],
        skipped: [
          { neonUserId: 101, reason: "Already generated for this month." },
        ],
        failed: [],
      },
    });

    render(
      <PayrollWorkspace
        restaurantSlug="the-monks"
        timeZone="America/Chicago"
        onGoToPayRates={vi.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Generate Payroll" }),
    );
    // Feature: Generate Payroll now opens as a modal dialog -- the
    // toolbar's own opener button stays mounted (just visually covered)
    // behind it, sharing the same accessible name as the dialog's own
    // submit button in the single-person case, so every query from here
    // on must be scoped to the dialog to stay unambiguous.
    const dialog = screen.getByRole("dialog", { name: "Generate Payroll" });
    await userEvent.type(within(dialog).getByLabelText("Month"), "2026-09");

    await waitFor(() =>
      expect(within(dialog).getByText("Already generated")).toBeInTheDocument(),
    );
    // Default selection: only the not-yet-generated employee (Leo).
    const leoCheckbox = within(dialog).getByRole("checkbox", { name: /Leo/ });
    const miaCheckbox = within(dialog).getByRole("checkbox", { name: /Mia/ });
    expect(leoCheckbox).toBeChecked();
    expect(miaCheckbox).not.toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Generate Payroll" }),
    ).toBeInTheDocument();

    // Select All switches the button label to the "all employees" copy.
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Select All" }),
    );
    expect(miaCheckbox).toBeChecked();
    expect(
      within(dialog).getByRole("button", {
        name: "Generate Payroll for All Employees",
      }),
    ).toBeInTheDocument();

    // Deselect Mia again -- back to a plain single-person submit label.
    await userEvent.click(miaCheckbox);
    expect(
      within(dialog).getByRole("button", { name: "Generate Payroll" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Generate Payroll" }),
    );

    expect(mockedGenerateForEmployees).toHaveBeenCalledWith({
      restaurantSlug: "the-monks",
      neonUserIds: [102],
      periodMonth: "2026-09-01",
    });
    await waitFor(() =>
      expect(within(dialog).getByText("Payroll Generated")).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByText("1 generated · 1 already existed · 0 failed"),
    ).toBeInTheDocument();
    // The dialog stays open so this summary is actually visible -- it
    // must not have been dismissed the instant the request resolved.
    expect(
      screen.getByRole("dialog", { name: "Generate Payroll" }),
    ).toBeInTheDocument();
  });

  it("PeriodLedgerPanel's single-statement print renders the shared letterhead and a dynamic filename", async () => {
    mockedGetAccess.mockResolvedValue({ ok: true, data: { scope: "all" } });
    mockedGetRateOptions.mockResolvedValue({
      ok: true,
      data: {
        users: [
          {
            id: 101,
            fullName: "Mia Chen",
            role: "Server",
            phone: null,
            createdAt: "2026-01-01T00:00:00Z",
            isActive: true,
          },
        ],
        defaultRateCents: 1500,
        overrides: [],
      },
    });
    mockedGetDashboard.mockResolvedValue({
      ok: true,
      data: {
        totalBalanceOwedCents: 30000,
        previousMonthGeneratedCents: 60000,
        owedThisMonthCents: 0,
        owedLastMonthCents: 30000,
        oldestOpenPeriod: null,
        perPerson: [
          { neonUserId: 101, balanceCents: 30000, totalGeneratedCents: 60000 },
        ],
        periods: [
          {
            id: 1,
            neonUserId: 101,
            periodMonth: "2026-08-01",
            hoursSnapshot: 40,
            rateCentsSnapshot: 1500,
            grossCents: 60000,
            status: "locked",
            balanceCents: 30000,
          },
        ],
      },
    });
    mockedGetLedger.mockResolvedValue({
      ok: true,
      data: {
        period: {
          id: 1,
          organizationId: "org-1",
          neonUserId: 101,
          periodMonth: "2026-08-01",
          hoursSnapshot: 40,
          rateCentsSnapshot: 1500,
          grossCents: 60000,
          status: "locked",
          generatedAt: "2026-08-01T00:00:00Z",
          generatedBy: "admin-1",
          regeneratedAt: null,
          regeneratedBy: null,
          lockedAt: "2026-08-02T00:00:00Z",
          lockedBy: "admin-1",
        },
        payments: [],
        adjustments: [],
        balance: {
          grossCents: 60000,
          confirmedPaymentsCents: 30000,
          draftPaymentsCents: 0,
          adjustmentsCents: 0,
          balanceCents: 30000,
          fullyPaid: false,
        },
        organizationName: "The Monk's Restaurant & Bar",
      },
    });

    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <PayrollWorkspace
        restaurantSlug="the-monks"
        timeZone="America/Chicago"
        onGoToPayRates={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Overall balance owed")).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Open ledger for August 2026" }),
    );

    // Bug fix: the ledger opens as a modal dialog now, not expanded
    // inline at the bottom of the page.
    const ledgerDialog = await screen.findByRole("dialog", {
      name: "August 2026 Ledger",
    });
    expect(
      within(ledgerDialog).getByText("August 2026 ledger"),
    ).toBeInTheDocument();
    // The shared letterhead's own fixed heading, once per statement --
    // never the old bare organizationName-as-heading text.
    expect(
      within(ledgerDialog).getByText("The Monk's Indian Fusion - Webster"),
    ).toBeInTheDocument();
    expect(
      within(ledgerDialog).getByText("Payroll Compensation Statement"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(ledgerDialog).getByRole("button", { name: "Print statement" }),
    );
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe("Mia Chen (Server) Payroll Report Aug 2026");

    printSpy.mockRestore();

    // Export/print functionality still works from inside the dialog,
    // and the dialog itself can be explicitly closed.
    await userEvent.click(
      within(ledgerDialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "August 2026 Ledger" }),
    ).not.toBeInTheDocument();
  });
});

describe("CombinedStatementDialog", () => {
  it("renders corporate letterhead, attendance log, payroll breakdown, and print trigger", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    mockedGetStatement.mockResolvedValue({
      ok: true,
      data: {
        restaurant: {
          name: "The Monk's Restaurant & Bar",
          slug: "the-monks",
        },
        employee: {
          neonUserId: 101,
          name: "Mia Chen",
          role: "Server",
        },
        period: {
          year: 2026,
          month: 8,
          monthLabel: "August 2026",
        },
        attendance: {
          rows: [
            {
              id: 1,
              userId: 101,
              date: "2026-08-05",
              clockIn: "2026-08-05T11:00:00Z",
              clockOut: "2026-08-05T19:30:00Z",
              hoursWorked: 8.5,
              autoClockedOut: false,
            },
          ],
          totalHours: 8.5,
          daysWorked: 1,
          avgHoursPerDay: 8.5,
        },
        payroll: {
          periodId: 1,
          status: "part-paid",
          grossCents: 63750,
          hoursSnapshot: 42.5,
          rateCentsSnapshot: 1500,
          confirmedPaymentsCents: 30000,
          adjustmentsCents: 0,
          balanceCents: 33750,
          payments: [
            {
              id: 1,
              organizationId: "org-1",
              payrollPeriodId: 1,
              amountCents: 30000,
              paymentDate: "2026-08-20",
              status: "confirmed",
              comment: "Bi-weekly pay check #1042",
              createdAt: "2026-08-20T00:00:00Z",
              createdBy: "admin-1",
              updatedAt: "2026-08-20T00:00:00Z",
              confirmedAt: "2026-08-20T00:00:00Z",
              confirmedBy: "admin-1",
              reversesPaymentId: null,
            },
          ],
          adjustments: [],
        },
        generatedAt: "2026-09-01T00:00:00Z",
      },
    });

    render(
      <CombinedStatementDialog
        restaurantSlug="the-monks"
        target={{ scope: "single", neonUserId: 101 }}
        year={2026}
        month={8}
        onClose={vi.fn()}
      />,
    );

    // Letterhead details -- the shared ReportLetterhead's own fixed
    // heading, not the (now unused-here) statement.restaurant.name.
    // Feature 033: the statement is now two flat `.print-page-break`
    // pages (Attendance + Payroll, for duplex printing), each with its
    // own full letterhead -- so these appear twice, not once.
    await waitFor(() =>
      expect(
        screen.getAllByText("The Monk's Indian Fusion - Webster"),
      ).toHaveLength(2),
    );
    expect(screen.getAllByText("August 2026")).toHaveLength(2);
    // The letterhead concatenates name + role into one text node now
    // ("Mia Chen (Server)"), so this checks a substring.
    expect(screen.getAllByText(/Mia Chen/)).toHaveLength(2);
    expect(screen.getByText("Part 1: Recorded Attendance")).toBeInTheDocument();
    expect(
      screen.getByText("Part 2: Payroll & Compensation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Employee Signature & Date")).toBeInTheDocument();

    // Print action -- triggerPrintWithFilename defers window.print()
    // behind a short setTimeout (real timers here), so this must poll
    // rather than assert immediately after the click.
    const printButton = screen.getByRole("button", { name: "Print" });
    await userEvent.click(printButton);
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.title).toBe("Mia Chen Monthly Report Aug 2026");

    printSpy.mockRestore();
  });
});
