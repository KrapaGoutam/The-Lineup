import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAttendanceSourceAction: vi.fn(),
  getNativeAttendanceReportAction: vi.fn(),
  getAttendanceSessionDetailAction: vi.fn(),
  correctAttendanceSessionAction: vi.fn(),
}));

vi.mock("@/features/attendance/actions/native-report-actions", () => mocks);
vi.mock("@/features/attendance/components/attendance-report", () => ({
  AttendanceReport: () => <div data-testid="legacy-neon-report">legacy</div>,
}));

import type { SignedInUser } from "@/components/login-screen";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";

import { AttendanceWorkspace } from "./attendance-workspace";

const user = {
  profileId: "p-manager",
  name: "Mia",
  role: "manager",
} as unknown as SignedInUser;
const TZ = "America/Chicago";

function source(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      source: "internal",
      label: "TheLineup Internal",
      description: "Clock-ins recorded directly in The Lineup.",
      locationId: "loc-1",
      locationName: "Monks Ale House",
      timeZone: TZ,
      canManage: true,
      ...overrides,
    },
  };
}

function row(overrides: Partial<NativeReportRow> = {}): NativeReportRow {
  return {
    sessionId: "00000000-0000-0000-0000-00000000aaaa",
    profileId: "emp-1",
    employeeName: "Ada Lovelace",
    locationId: "loc-1",
    serviceDate: "2026-11-09",
    status: "completed",
    clockInAt: "2026-11-09T15:00:00Z",
    clockOutAt: "2026-11-09T23:00:00Z",
    grossElapsedSeconds: 28800,
    totalBreakSeconds: 1800,
    paidBreakSeconds: 0,
    unpaidBreakSeconds: 0,
    unclassifiedBreakSeconds: 1800,
    openBreakCount: 0,
    breakCount: 1,
    breakPolicyResolved: false,
    netPayableSeconds: null,
    version: 4,
    correctionCount: 0,
    lastCorrectedAt: null,
    source: "internal_the_lineup",
    timeZone: TZ,
    ...overrides,
  };
}

function report(rows: NativeReportRow[], extra: Record<string, unknown> = {}) {
  const closed = rows.filter((r) => r.status === "completed");
  return {
    ok: true as const,
    data: {
      rows,
      truncated: false,
      timeZone: TZ,
      canManage: true,
      totals: {
        sessionCount: rows.length,
        closedSessionCount: closed.length,
        openSessionCount: rows.filter((r) => r.status === "active").length,
        voidedSessionCount: rows.filter((r) => r.status === "voided").length,
        correctedSessionCount: rows.filter((r) => r.correctionCount > 0).length,
        grossSeconds: closed.reduce(
          (s, r) => s + (r.grossElapsedSeconds ?? 0),
          0,
        ),
        breakSeconds: closed.reduce((s, r) => s + r.totalBreakSeconds, 0),
        paidBreakSeconds: 0,
        unpaidBreakSeconds: 0,
        unclassifiedBreakSeconds: closed.reduce(
          (s, r) => s + r.unclassifiedBreakSeconds,
          0,
        ),
        resolvedNetPayableSeconds: 0,
        resolvedSessionCount: 0,
        unresolvedSessionCount: closed.filter(
          (r) => r.netPayableSeconds === null,
        ).length,
      },
      ...extra,
    },
  };
}

function renderWorkspace() {
  return render(
    <AttendanceWorkspace
      restaurantSlug="monks-ale-house"
      demoMode={false}
      timeZone={TZ}
      user={user}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("source selection (never mixes sources)", () => {
  it("shows ONLY the native report for internal mode, labelled with its source", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValue(report([row()]));
    renderWorkspace();
    expect(
      await screen.findByText("Source: TheLineup Internal"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Ada Lovelace", { selector: "td" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-neon-report")).not.toBeInTheDocument();
  });

  it.each([
    ["external", "Source: External"],
    ["unconfigured", "Source: External (not configured)"],
  ])("shows ONLY the existing external report for %s", async (src, badge) => {
    mocks.getAttendanceSourceAction.mockResolvedValue(
      source({
        source: src,
        label: src === "external" ? "External" : "External (not configured)",
      }),
    );
    renderWorkspace();
    expect(await screen.findByText(badge)).toBeInTheDocument();
    expect(await screen.findByTestId("legacy-neon-report")).toBeInTheDocument();
    expect(mocks.getNativeAttendanceReportAction).not.toHaveBeenCalled();
  });

  it("shows an off notice (no report, no clock actions) when disabled", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(
      source({
        source: "disabled",
        label: "Attendance off",
        description: "Attendance tracking is turned off for this location.",
      }),
    );
    renderWorkspace();
    expect(
      await screen.findByText("Attendance is turned off"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-neon-report")).not.toBeInTheDocument();
    expect(mocks.getNativeAttendanceReportAction).not.toHaveBeenCalled();
  });

  it("keeps the legacy report (labelled) when no location can be verified, and never shows native data", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue({
      ok: false,
      error: "Choose a location first.",
      contextStale: true,
    });
    renderWorkspace();
    expect(await screen.findByTestId("legacy-neon-report")).toBeInTheDocument();
    expect(
      screen.getByText(/Showing the existing external records/),
    ).toBeInTheDocument();
    expect(mocks.getNativeAttendanceReportAction).not.toHaveBeenCalled();
  });

  it("surfaces a real failure with a retry instead of guessing a source", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValueOnce({
      ok: false,
      error: "Unable to read this location.",
    });
    mocks.getAttendanceSourceAction.mockResolvedValueOnce(
      source({
        source: "disabled",
        label: "Attendance off",
        description: "off",
      }),
    );
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to read this location.",
    );
    expect(screen.queryByTestId("legacy-neon-report")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Attendance is turned off"),
    ).toBeInTheDocument();
  });

  it("uses the existing demo report in demo mode without calling the server", () => {
    render(
      <AttendanceWorkspace
        restaurantSlug="demo"
        demoMode
        timeZone={TZ}
        user={user}
      />,
    );
    expect(screen.getByTestId("legacy-neon-report")).toBeInTheDocument();
    expect(mocks.getAttendanceSourceAction).not.toHaveBeenCalled();
  });
});

describe("native report honesty", () => {
  it("never shows unresolved payable time as zero and flags unclassified breaks", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValue(report([row()]));
    renderWorkspace();
    const table = await screen.findByRole("table");
    expect(
      within(table).getAllByText("Pending break classification").length,
    ).toBeGreaterThan(0);
    expect(within(table).getByText("pay not decided")).toBeInTheDocument();
    expect(
      screen.getByText(/awaiting break classification/),
    ).toBeInTheDocument();
  });

  it("renders times in the location's zone with its label and the source footer", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValue(report([row()]));
    renderWorkspace();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("9:00 AM")).toBeInTheDocument();
    expect(within(table).getByText("5:00 PM")).toBeInTheDocument();
    expect(
      screen.getByText(/Source: TheLineup Internal · Monks Ale House/),
    ).toBeInTheDocument();
  });

  it("warns about shifts left open from an earlier day without closing them", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValue(
      report([
        row({
          status: "active",
          clockOutAt: null,
          grossElapsedSeconds: null,
          serviceDate: "2020-01-01",
        }),
      ]),
    );
    renderWorkspace();
    expect(
      await screen.findByText(/still open from an earlier day/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was closed automatically/),
    ).toBeInTheDocument();
  });

  it("shows an empty state and an error state with retry", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValueOnce({
      ok: false,
      error: "Attendance data unavailable. Try again.",
    });
    mocks.getNativeAttendanceReportAction.mockResolvedValueOnce(report([]));
    renderWorkspace();
    expect(
      await screen.findByText("Attendance data unavailable. Try again."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No attendance recorded"),
    ).toBeInTheDocument();
  });
});

describe("who sees which actions", () => {
  it("offers Correct and an employee filter to managers", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(
      source({ canManage: true }),
    );
    mocks.getNativeAttendanceReportAction.mockResolvedValue(report([row()]));
    renderWorkspace();
    expect(await screen.findByLabelText("Employee")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Correct Ada Lovelace/ }).length,
    ).toBeGreaterThan(0);
  });

  it("gives an employee no Correct button and no employee picker; corrected rows offer read-only History", async () => {
    mocks.getAttendanceSourceAction.mockResolvedValue(
      source({ canManage: false }),
    );
    mocks.getNativeAttendanceReportAction.mockResolvedValue(
      report([
        row({ correctionCount: 2 }),
        row({ sessionId: "00000000-0000-0000-0000-00000000bbbb" }),
      ]),
    );
    renderWorkspace();
    await screen.findByRole("table");
    expect(screen.queryByLabelText("Employee")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Correct / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /View history for/ }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Corrected ×2").length).toBeGreaterThan(0);
  });
});

describe("correction workflow", () => {
  const detail = {
    ok: true as const,
    data: {
      breaks: [
        {
          id: 11,
          sessionId: "s",
          startTime: "2026-11-09T18:00:00Z",
          endTime: "2026-11-09T18:30:00Z",
          durationSeconds: 1800,
          payClassification: "unclassified" as const,
        },
      ],
      history: [
        {
          id: 1,
          eventType: "clock_in" as const,
          eventTime: "2026-11-09T15:00:00Z",
          source: "web" as const,
          actorProfileId: "emp-1",
          isCorrection: false,
          reason: null,
          correctionSeq: null,
          changedFields: [],
          selfCorrection: false,
          before: null,
          after: null,
        },
      ],
      names: { "emp-1": "Ada Lovelace" },
    },
  };

  async function openDialog() {
    mocks.getAttendanceSourceAction.mockResolvedValue(source());
    mocks.getNativeAttendanceReportAction.mockResolvedValue(report([row()]));
    mocks.getAttendanceSessionDetailAction.mockResolvedValue(detail);
    renderWorkspace();
    const buttons = await screen.findAllByRole("button", {
      name: /Correct Ada Lovelace/,
    });
    await userEvent.click(buttons[0]);
    return await screen.findByLabelText("Clock-out");
  }

  it("requires a reason, then shows a review with before/after and pending payable", async () => {
    const out = await openDialog();
    const review = screen.getByRole("button", { name: "Review changes" });
    await userEvent.clear(out);
    await userEvent.type(out, "2026-11-09T17:30");
    expect(review).toBeDisabled(); // no reason yet
    await userEvent.type(
      screen.getByLabelText("Reason (required)"),
      "Closed late by mistake",
    );
    expect(review).toBeEnabled();
    await userEvent.click(review);

    expect(screen.getByText("Review your correction")).toBeInTheDocument();
    const changes = screen.getByText("Review your correction").parentElement!;
    expect(within(changes).getByText("Clock-out")).toBeInTheDocument();
    expect(within(changes).getByText(/5:30 PM CST/)).toBeInTheDocument();
    // The projection says payable time is pending — never zero.
    expect(
      within(changes).getByText("Pending break classification"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Closed late by mistake/)).toBeInTheDocument();
    expect(mocks.correctAttendanceSessionAction).not.toHaveBeenCalled();
  });

  it("blocks an impossible correction before any server call", async () => {
    const out = await openDialog();
    await userEvent.clear(out);
    await userEvent.type(out, "2026-11-09T08:00"); // before clock-in (9:00 AM local)
    await userEvent.type(
      screen.getByLabelText("Reason (required)"),
      "oops wrong time",
    );
    expect(
      await screen.findByText("Clock-out cannot be before clock-in."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review changes" }),
    ).toBeDisabled();
  });

  it("submits against the version the manager loaded and reports success with history", async () => {
    mocks.correctAttendanceSessionAction.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        idempotent: false,
        sessionId: "s",
        eventId: 9,
        correctionSeq: 3,
        version: 5,
      },
    });
    const out = await openDialog();
    await userEvent.clear(out);
    await userEvent.type(out, "2026-11-09T17:30");
    await userEvent.type(
      screen.getByLabelText("Reason (required)"),
      "Closed late by mistake",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Review changes" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm correction" }),
    );

    await waitFor(() =>
      expect(mocks.correctAttendanceSessionAction).toHaveBeenCalledTimes(1),
    );
    expect(mocks.correctAttendanceSessionAction).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantSlug: "monks-ale-house",
        sessionId: "00000000-0000-0000-0000-00000000aaaa",
        expectedVersion: 4,
        reason: "Closed late by mistake",
        clockOutAt: "2026-11-09T23:30:00.000Z",
        void: false,
      }),
    );
    expect(
      await screen.findByText(/Correction saved \(#3\)/),
    ).toBeInTheDocument();
  });

  it("offers a reload when someone else changed the record (stale version)", async () => {
    mocks.correctAttendanceSessionAction.mockResolvedValue({
      ok: false,
      code: "stale",
      error:
        "This record was changed by someone else. Reload it and try again.",
    });
    const out = await openDialog();
    await userEvent.clear(out);
    await userEvent.type(out, "2026-11-09T17:30");
    await userEvent.type(
      screen.getByLabelText("Reason (required)"),
      "Closed late by mistake",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Review changes" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm correction" }),
    );
    expect(
      await screen.findByText(/changed by someone else/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload the record" }),
    ).toBeInTheDocument();
  });

  it("shows the original events in the history alongside corrections", async () => {
    await openDialog();
    const history = screen
      .getByRole("heading", { name: "History" })
      .closest("section")!;
    expect(within(history).getByText(/clock in/)).toBeInTheDocument();
  });
});
