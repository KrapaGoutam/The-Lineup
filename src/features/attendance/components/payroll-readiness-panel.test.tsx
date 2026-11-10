import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAttendanceFinancialReadinessAction: vi.fn(),
}));
vi.mock(
  "@/features/attendance/actions/financial-readiness-actions",
  () => mocks,
);

import { PayrollReadinessPanel } from "./payroll-readiness-panel";

const NAMES = new Map([
  ["e1", "Ada"],
  ["e2", "Ben"],
]);

function native(
  readiness: Record<string, unknown>,
  activation: unknown = {
    status: "BLOCKED_POLICY",
    pending: [
      "q1BreakClassification",
      "q4PayrollRules",
      "q6ConfirmedPeriodCorrections",
    ],
  },
) {
  return {
    ok: true as const,
    data: {
      kind: "NATIVE",
      previewOnly: true,
      state: "INTERNAL_THE_LINEUP",
      activation,
      timeZone: "America/Chicago",
      period: { startDate: "2026-05-01", endDate: "2026-05-31" },
      readiness: {
        source: "INTERNAL_THE_LINEUP",
        truncated: false,
        ...readiness,
      },
    },
  };
}

function renderPanel() {
  return render(
    <PayrollReadinessPanel
      restaurantSlug="the-monks"
      start="2026-05-01"
      end="2026-05-31"
      reloadKey={0}
      names={NAMES}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PayrollReadinessPanel", () => {
  it("is labelled preview-only and names the pending owner decisions", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue(
      native({
        recordCount: 0,
        eligibleCount: 0,
        excludedCount: 0,
        excludedByReason: {},
        totalsComplete: true,
        employees: [],
      }),
    );
    renderPanel();
    expect(screen.getByText("Preview only")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/Waiting on the owner to decide/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/how breaks are classified paid or unpaid/),
    ).toBeInTheDocument();
    expect(screen.getByText(/nobody is paid from it/i)).toBeInTheDocument();
  });

  it("surfaces unresolved shifts with their reason and per person — never hides or zeroes them", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue(
      native({
        recordCount: 3,
        eligibleCount: 1,
        excludedCount: 2,
        excludedByReason: { UNCLASSIFIED_BREAK: 1, OPEN_SESSION: 1 },
        totalsComplete: false,
        employees: [
          {
            employeeId: "e1",
            externalUserId: null,
            eligibleCount: 1,
            excludedCount: 1,
            eligibleSeconds: 28800,
            eligibleReportedHours: 0,
            finalizable: false,
            excluded: [
              {
                sourceRecordId: "s2",
                serviceDate: "2026-05-05",
                recordStatus: "UNCLASSIFIED_BREAK",
                reasons: ["UNCLASSIFIED_BREAK"],
              },
            ],
          },
          {
            employeeId: "e2",
            externalUserId: null,
            eligibleCount: 0,
            excludedCount: 1,
            eligibleSeconds: 0,
            eligibleReportedHours: 0,
            finalizable: false,
            excluded: [
              {
                sourceRecordId: "s3",
                serviceDate: "2026-05-06",
                recordStatus: "OPEN_SESSION",
                reasons: ["OPEN_SESSION"],
              },
            ],
          },
        ],
      }),
    );
    renderPanel();
    const counts = await screen.findByTestId("readiness-counts");
    expect(counts).toHaveTextContent("1 of 3 shifts ready");
    expect(counts).toHaveTextContent("2 need attention");

    const why = screen.getByRole("list", { name: "Why shifts need attention" });
    expect(
      within(why).getByText("Break not yet decided paid or unpaid"),
    ).toBeInTheDocument();
    expect(within(why).getByText("Shift still open")).toBeInTheDocument();

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Ben")).toBeInTheDocument();
    expect(
      screen.getByText(/Tue, May 5 — Break not yet decided/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Every shift in these dates is ready/),
    ).toBeNull();
  });

  it("shows no hours and no money anywhere, even when shifts are ready", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue(
      native({
        recordCount: 1,
        eligibleCount: 1,
        excludedCount: 0,
        excludedByReason: {},
        totalsComplete: true,
        employees: [
          {
            employeeId: "e1",
            externalUserId: null,
            eligibleCount: 1,
            excludedCount: 0,
            eligibleSeconds: 28800,
            eligibleReportedHours: 0,
            finalizable: true,
            excluded: [],
          },
        ],
      }),
    );
    renderPanel();
    await screen.findByText(/Every shift in these dates is ready/);
    const text = screen.getByTestId("payroll-readiness").textContent ?? "";
    expect(text).not.toMatch(/\$|\bUSD\b/);
    expect(text).not.toMatch(/\b8(\.00)?\s*h|28800|8h/);
  });

  it("an incomplete (truncated) read says so and never claims every shift is ready", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue(
      native({
        recordCount: 5000,
        eligibleCount: 5000,
        excludedCount: 0,
        excludedByReason: {},
        totalsComplete: false,
        truncated: true,
        employees: [],
      }),
    );
    renderPanel();
    expect(
      await screen.findByText(/too many shifts to check at once/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Every shift in these dates is ready/),
    ).toBeNull();
  });

  it("a denied or failed read is an alert — not 'no shifts' and not 'ready'", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue({
      ok: false,
      code: "access_denied",
      error: "You don't have access to payroll readiness for this location.",
    });
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /don't have access/,
    );
    expect(screen.queryByText(/No shifts recorded/)).toBeNull();
    expect(screen.queryByTestId("readiness-counts")).toBeNull();
  });

  it("an external location is told its existing behaviour is unchanged (no records shown)", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue({
      ok: true,
      data: {
        kind: "EXTERNAL_UNCHANGED",
        previewOnly: true,
        state: "EXTERNAL",
        activation: { status: "ACTIVE_LEGACY_UNCHANGED" },
      },
    });
    renderPanel();
    expect(
      await screen.findByText(
        /External attendance keeps its existing payroll and tip behaviour/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("readiness-counts")).toBeNull();
  });

  it("re-checks when the range changes", async () => {
    mocks.getAttendanceFinancialReadinessAction.mockResolvedValue(
      native({
        recordCount: 0,
        eligibleCount: 0,
        excludedCount: 0,
        excludedByReason: {},
        totalsComplete: true,
        employees: [],
      }),
    );
    const { rerender } = renderPanel();
    await waitFor(() =>
      expect(mocks.getAttendanceFinancialReadinessAction).toHaveBeenCalledTimes(
        1,
      ),
    );
    rerender(
      <PayrollReadinessPanel
        restaurantSlug="the-monks"
        start="2026-06-01"
        end="2026-06-30"
        reloadKey={0}
        names={NAMES}
      />,
    );
    await waitFor(() =>
      expect(
        mocks.getAttendanceFinancialReadinessAction,
      ).toHaveBeenLastCalledWith({
        restaurantSlug: "the-monks",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      }),
    );
  });
});
