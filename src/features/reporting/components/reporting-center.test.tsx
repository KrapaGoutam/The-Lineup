import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  print: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/features/reporting/actions/reporting-actions", () => ({
  generateCombinedReportAction: mocks.generate,
}));
vi.mock("@/lib/print-utils", () => ({
  triggerPrintWithFilename: mocks.print,
}));
vi.mock("@/lib/download-file", () => ({ downloadFile: mocks.download }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import type { ReportingOptions } from "@/features/reporting/actions/reporting-actions";

import { ReportingCenter } from "./reporting-center";
import { build, nativeRow, slice, LEAGUE, TAP } from "./report-test-data";

const ORG_TAP = "00000000-0000-0000-0000-0000000000a1";
const ORG_MONKS = "00000000-0000-0000-0000-0000000000a2";
const B_LEAGUE = "00000000-0000-0000-0000-0000000000b1";
const B_NASA = "00000000-0000-0000-0000-0000000000b2";
const B_WEBSTER = "00000000-0000-0000-0000-0000000000b3";
const ME = "00000000-0000-0000-0000-0000000000c1";

const OPTIONS: ReportingOptions = {
  organizations: [
    { id: ORG_TAP, name: "Liquor Tap", slug: "liquor-tap" },
    { id: ORG_MONKS, name: "The Monk's", slug: "monks" },
  ],
  branches: [
    {
      id: B_LEAGUE,
      organizationId: ORG_TAP,
      name: "League City",
      timeZone: "America/Chicago",
      attendance: "all",
      payroll: "all",
    },
    {
      id: B_NASA,
      organizationId: ORG_TAP,
      name: "NASA",
      timeZone: "America/Chicago",
      attendance: "all",
      payroll: "all",
    },
    {
      id: B_WEBSTER,
      organizationId: ORG_MONKS,
      name: "Webster",
      timeZone: "America/Chicago",
      attendance: "all",
      payroll: "all",
    },
  ],
  employees: [
    {
      key: `profile:${ME}`,
      displayName: "Ava Cruz",
      identity: "verified",
      organizationIds: [ORG_TAP],
      locationIds: [B_LEAGUE],
    },
    {
      key: `neon:${ORG_MONKS}:8`,
      displayName: "Una Unlinked",
      identity: "unmapped_external",
      organizationIds: [ORG_MONKS],
      locationIds: [B_WEBSTER],
    },
  ],
  canSeeAttendance: true,
  canSeePayroll: true,
  canManage: true,
  maxRangeDays: 92,
  maxEmployees: 200,
  thisMonth: { start: "2026-11-01", end: "2026-11-30" },
  lastMonth: { start: "2026-10-01", end: "2026-10-31" },
  today: "2026-11-18",
};

function ok(report = build()) {
  mocks.generate.mockResolvedValue({ ok: true, data: { reports: [report] } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("view tabs follow the caller's capabilities", () => {
  it("a manager with both capabilities sees all four views", () => {
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Combined Reports",
      "Attendance Statements",
      "Payroll Statements",
      "Payment Ledger",
    ]);
  });

  it("without payroll authority there is no Payroll or Ledger view and no payroll content option", () => {
    render(
      <ReportingCenter
        options={{ ...OPTIONS, canSeePayroll: false }}
        initial={{}}
      />,
    );
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Combined Reports",
      "Attendance Statements",
    ]);
    expect(screen.queryByRole("option", { name: "Payroll only" })).toBeNull();
    expect(
      screen.queryByRole("option", { name: "Attendance and Payroll" }),
    ).toBeNull();
  });

  it("a self-only caller is told so and is not offered an employee picker", () => {
    render(
      <ReportingCenter
        options={{ ...OPTIONS, canManage: false }}
        initial={{}}
      />,
    );
    expect(screen.getByText(/your own records only/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search employees")).toBeNull();
  });
});

describe("building the request", () => {
  it("sends 'all authorized' as null filters with the chosen content, period and output", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith({
      organizationIds: null,
      locationIds: null,
      employeeKeys: null,
      content: "both",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      output: "combined",
    });
  });

  it("filters branches by selected organization and sends explicit selections", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByLabelText("Liquor Tap"));
    // Webster belongs to The Monk's and is no longer offered
    expect(screen.queryByLabelText(/^Webster/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/League City/));
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    const sent = mocks.generate.mock.calls[0]![0];
    expect(sent.organizationIds).toEqual([ORG_TAP]);
    expect(sent.locationIds).toEqual([B_LEAGUE]);
  });

  it("view decides the content: Payroll Statements asks for payroll only", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Payroll Statements" }));
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    expect(mocks.generate.mock.calls[0]![0].content).toBe("payroll");
  });

  it("selected employees are sent by canonical key; none selected blocks generation", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByLabelText(/Selected employees/));
    const generate = screen.getByRole("button", { name: /Generate report/ });
    expect(generate).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /at least one employee/i,
    );
    fireEvent.click(screen.getByLabelText("Ava Cruz"));
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    expect(mocks.generate.mock.calls[0]![0].employeeKeys).toEqual([
      `profile:${ME}`,
    ]);
  });

  it("an external, unlinked person is labelled and selectable only as itself", () => {
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByLabelText(/Selected employees/));
    expect(screen.getByText(/external, unlinked/)).toBeInTheDocument();
  });

  it("rejects an over-long custom range before any request", () => {
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.change(screen.getByLabelText("Period"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-12-31" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/92 days or fewer/);
    expect(
      screen.getByRole("button", { name: /Generate report/ }),
    ).toBeDisabled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("shows the attendance period with its year, separately from payroll accounting periods", () => {
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    expect(screen.getByText(/Attendance period:/)).toHaveTextContent(
      /November 2026/,
    );
    expect(
      screen.getByText(/Payroll accounting periods are whole calendar months/),
    ).toBeInTheDocument();
  });
});

describe("contextual links only pre-fill — never carry authority", () => {
  it("drops organization / branch / employee ids this user was not offered", async () => {
    ok();
    render(
      <ReportingCenter
        options={OPTIONS}
        initial={{
          organizationIds: [ORG_TAP, "00000000-0000-0000-0000-00000000ffff"],
          locationIds: [B_LEAGUE, "00000000-0000-0000-0000-00000000fff1"],
          employeeKeys: [`profile:${ME}`],
          startDate: "2026-11-02",
          endDate: "2026-11-09",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    const sent = mocks.generate.mock.calls[0]![0];
    expect(sent.organizationIds).toEqual([ORG_TAP]);
    expect(sent.locationIds).toEqual([B_LEAGUE]);
    expect(sent.employeeKeys).toEqual([`profile:${ME}`]);
    expect(sent.startDate).toBe("2026-11-02");
    expect(sent.endDate).toBe("2026-11-09");
  });

  it("an unavailable linked employee never silently widens to 'all employees'", () => {
    render(
      <ReportingCenter
        options={OPTIONS}
        initial={{ employeeKeys: ["profile:someone-else"] }}
      />,
    );
    expect(screen.getByText(/isn't available to you here/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate report/ }),
    ).toBeDisabled();
  });

  it("opens on the requested view", () => {
    render(<ReportingCenter options={OPTIONS} initial={{ view: "ledger" }} />);
    expect(screen.getByRole("tab", { name: "Payment Ledger" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("ignores a view the caller is not allowed", () => {
    render(
      <ReportingCenter
        options={{ ...OPTIONS, canSeePayroll: false }}
        initial={{ view: "ledger" }}
      />,
    );
    expect(
      screen.getByRole("tab", { name: "Combined Reports" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

describe("results, print and export", () => {
  it("prints a complete report with a safe file name", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    const print = await screen.findByRole("button", {
      name: /Print \/ Save as PDF/,
    });
    expect(print).toBeEnabled();
    fireEvent.click(print);
    expect(mocks.print).toHaveBeenCalledTimes(1);
    expect(mocks.print.mock.calls[0]![0]).toMatch(
      /Liquor Tap .* November 2026/,
    );
  });

  it("an INCOMPLETE report cannot be printed or exported, and says why", async () => {
    ok(build({ attendance: [slice(TAP, LEAGUE, [nativeRow({})], true)] }));
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    const print = await screen.findByRole("button", {
      name: /Print \/ Save as PDF/,
    });
    expect(print).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
    expect(screen.getAllByText(/incomplete/i).length).toBeGreaterThan(0);
    fireEvent.click(print);
    expect(mocks.print).not.toHaveBeenCalled();
  });

  it("exports the chosen data set as CSV", async () => {
    ok();
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await screen.findByRole("button", { name: /Export CSV/ });
    fireEvent.change(screen.getByLabelText("Export data set"), {
      target: { value: "ledger" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(mocks.download).toHaveBeenCalledTimes(1);
    const [name, csv, mime] = mocks.download.mock.calls[0]!;
    expect(name).toMatch(/\.csv$/);
    expect(String(csv)).toContain("Remaining balance (USD)");
    expect(mime).toMatch(/text\/csv/);
  });

  it("shows a server refusal as an alert and renders no report", async () => {
    mocks.generate.mockResolvedValue({
      ok: false,
      error: "That selection includes something you don't have access to.",
    });
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /don't have access/,
    );
    expect(screen.queryByLabelText("Report result")).toBeNull();
  });

  it("a dead session tells the user to sign in again", async () => {
    mocks.generate.mockResolvedValue({
      ok: false,
      error: "x",
      sessionInvalid: true,
    });
    render(<ReportingCenter options={OPTIONS} initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sign in again/i,
    );
  });

  it("renders one document per report when the output is split", async () => {
    mocks.generate.mockResolvedValue({
      ok: true,
      data: {
        reports: [build(), build({ generatedAt: "2026-11-30T21:00:00.000Z" })],
      },
    });
    const { container } = render(
      <ReportingCenter options={OPTIONS} initial={{}} />,
    );
    fireEvent.change(screen.getByLabelText("Output"), {
      target: { value: "by_organization" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate report/ }));
    await screen.findByLabelText("Report result");
    expect(container.querySelectorAll(".report-bundle-item")).toHaveLength(2);
  });
});
