import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportDocument } from "./report-document";
import {
  LEAGUE,
  MONKS,
  NASA,
  TAP,
  WEBSTER,
  build,
  nativeRow,
  period,
  slice,
} from "./report-test-data";

function doc(container: HTMLElement) {
  return container.querySelector(".report-document") as HTMLElement;
}

describe("ReportDocument structure", () => {
  it("prints the six sections of the Combined view in order, each starting a new page", () => {
    const { container } = render(
      <ReportDocument report={build()} view="combined" />,
    );
    const sections = [
      ...doc(container).querySelectorAll(":scope > .report-section"),
    ];
    // cover, summary, register, 1 statement (Ava), attendance details, ledger
    expect(sections).toHaveLength(6);
    const titles = sections.map(
      (s) => s.querySelector("h1, h2")?.textContent ?? "",
    );
    expect(titles[1]).toBe("Executive Summary");
    expect(titles[2]).toBe("All-Employee Payroll Register");
    expect(titles[4]).toBe("Attendance Details");
    expect(titles[5]).toMatch(/Adjustments & Payments Ledger/);
  });

  it("Attendance view has no payroll register or ledger; Ledger view has only cover + ledger", () => {
    const a = render(
      <ReportDocument
        report={build({
          filters: {
            content: "attendance",
            output: "combined",
            startDate: "2026-11-01",
            endDate: "2026-11-30",
          },
          payroll: null,
        })}
        view="attendance"
      />,
    );
    expect(a.queryByText("All-Employee Payroll Register")).toBeNull();
    expect(a.queryByText(/Adjustments & Payments Ledger/)).toBeNull();
    expect(a.getByText("Attendance Details")).toBeInTheDocument();
    a.unmount();

    const l = render(<ReportDocument report={build()} view="ledger" />);
    expect(l.getByText(/Adjustments & Payments Ledger/)).toBeInTheDocument();
    expect(l.queryByText("Executive Summary")).toBeNull();
  });

  it("starts each employee statement on its own page (one section per employee)", () => {
    const report = build({
      attendance: [
        slice(TAP, LEAGUE, [
          nativeRow({ sessionId: "1" }),
          nativeRow({
            sessionId: "2",
            profileId: "p-ben",
            employeeName: "Ben Ortiz",
          }),
        ]),
      ],
    });
    const { container } = render(
      <ReportDocument report={report} view="attendance" />,
    );
    expect(container.querySelectorAll(".report-statement")).toHaveLength(2);
  });

  it("uses no element the print stylesheet hides (header / nav / button)", () => {
    const { container } = render(
      <ReportDocument report={build()} view="combined" />,
    );
    const d = doc(container);
    expect(d.querySelector("header, nav, button")).toBeNull();
  });

  it("is paper: white background and black text regardless of the app theme", () => {
    const { container } = render(
      <ReportDocument report={build()} view="combined" />,
    );
    expect(doc(container).className).toMatch(/bg-white/);
    expect(doc(container).className).toMatch(/text-black/);
  });

  it("renders an honest 'No records' page instead of a blank statement", () => {
    const empty = build({ attendance: [], payroll: [] });
    render(<ReportDocument report={empty} view="combined" />);
    expect(screen.getByText("No records")).toBeInTheDocument();
    expect(screen.queryByText("All-Employee Payroll Register")).toBeNull();
  });
});

describe("branding", () => {
  it("a single-organization report prints that organization's letterhead (never Monks by accident)", () => {
    render(<ReportDocument report={build()} view="combined" />);
    expect(screen.getAllByText("Liquor Tap").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Monk/)).toBeNull();
  });

  it("a mixed-organization report gets a NEUTRAL cover, with an informational-aggregate note", () => {
    const report = build({
      organizations: [TAP, MONKS],
      branches: [LEAGUE, WEBSTER],
      attendance: [],
      payroll: [
        period({ periodId: 1 }),
        period({
          periodId: 2,
          organizationId: "org-monks",
          locationId: "loc-webster",
          profileId: "p-ben",
          grossCents: 30000,
        }),
      ],
    });
    const { container } = render(
      <ReportDocument report={report} view="combined" />,
    );
    const cover = container.querySelector(".report-cover") as HTMLElement;
    expect(within(cover).getAllByText("The Lineup").length).toBeGreaterThan(0);
    // no organization letterhead on the cover (it names the organizations in the details)
    expect(within(cover).queryByText(/Indian Fusion/)).toBeNull();
    expect(within(cover).getByText(/informational only/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/informational aggregate/i).length,
    ).toBeGreaterThan(0);
  });

  it("Monks Webster uses its own letterhead and address; a multi-branch Monks report implies no single address", () => {
    const monksReport = build({
      organizations: [MONKS],
      branches: [WEBSTER],
      attendance: [],
      payroll: [
        period({
          organizationId: "org-monks",
          locationId: "loc-webster",
          profileId: "p-ben",
        }),
      ],
    });
    const one = render(<ReportDocument report={monksReport} view="payroll" />);
    expect(one.getAllByText(/Indian Fusion - Webster/).length).toBeGreaterThan(
      0,
    );
    expect(one.getAllByText(/1416 FM 528 Rd, Suite D/).length).toBeGreaterThan(
      0,
    );
    one.unmount();

    const second = {
      ...WEBSTER,
      id: "loc-other",
      name: "Second Branch",
      address: undefined,
    };
    const multi = build({
      organizations: [MONKS],
      branches: [WEBSTER, second],
      attendance: [],
      payroll: [
        period({
          periodId: 1,
          organizationId: "org-monks",
          locationId: "loc-webster",
          profileId: "p-ben",
        }),
        period({
          periodId: 2,
          organizationId: "org-monks",
          locationId: "loc-other",
          profileId: "p-ava",
        }),
      ],
    });
    render(<ReportDocument report={multi} view="payroll" />);
    expect(screen.queryByText(/1416 FM 528 Rd/)).toBeNull();
    expect(screen.getAllByText(/2 branches/).length).toBeGreaterThan(0);
  });
});

describe("financial presentation", () => {
  it("shows base, adjustment effect, gross, payments and remaining exactly as composed", () => {
    render(<ReportDocument report={build()} view="payroll" />);
    const reg = screen
      .getByText("All-Employee Payroll Register")
      .closest("section") as HTMLElement;
    // base 12,000 ; adjustment delta −500 → effect +500 ; gross 12,500 ; paid 5,000 ; remaining 7,500
    expect(within(reg).getAllByText("$120.00").length).toBeGreaterThan(0);
    expect(within(reg).getAllByText("$5.00").length).toBeGreaterThan(0);
    expect(within(reg).getAllByText("$125.00").length).toBeGreaterThan(0);
    expect(within(reg).getAllByText("$50.00").length).toBeGreaterThan(0);
    expect(within(reg).getAllByText("$75.00").length).toBeGreaterThan(0);
    expect(
      within(reg).getByText(/Subtotal — Liquor Tap · League City/),
    ).toBeInTheDocument();
  });

  it("the register states the attendance period and the payroll accounting period separately", () => {
    render(<ReportDocument report={build()} view="payroll" />);
    expect(
      screen.getByText(/Attendance period: November 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Payroll accounting period\(s\):/),
    ).toBeInTheDocument();
  });

  it("lists ledger entries with references and the 'no transaction created' notice", () => {
    render(<ReportDocument report={build()} view="ledger" />);
    expect(screen.getByText("PAY-7")).toBeInTheDocument();
    expect(screen.getByText("ADJ-3")).toBeInTheDocument();
    expect(screen.getByText(/creates no transaction/)).toBeInTheDocument();
  });

  it("a draft payment is shown as not counted", () => {
    const report = build({
      payroll: [
        period({
          payments: [
            {
              id: 9,
              amountCents: 1000,
              paymentDate: "2026-11-20",
              status: "draft",
              comment: null,
              createdBy: null,
              confirmedBy: null,
              confirmedAt: null,
              reversesPaymentId: null,
            },
          ],
        }),
      ],
    });
    render(<ReportDocument report={report} view="ledger" />);
    expect(screen.getByText(/Draft \(not counted\)/)).toBeInTheDocument();
  });

  it("distinguishes unresolved hours from counted hours in the attendance details", () => {
    const report = build({
      attendance: [
        slice(TAP, LEAGUE, [
          nativeRow({ sessionId: "1" }),
          nativeRow({
            sessionId: "2",
            status: "active",
            clockOutAt: null,
            netPayableSeconds: null,
            grossElapsedSeconds: null,
            serviceDate: "2026-11-05",
          }),
        ]),
      ],
    });
    render(<ReportDocument report={report} view="attendance" />);
    expect(
      screen.getAllByText(/Open shift — not counted/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/1 not counted/)).toBeInTheDocument();
  });
});

describe("incomplete reports", () => {
  it("shows a screen-only 'not a valid statement' alert with the reasons", () => {
    const report = build({
      attendance: [slice(TAP, LEAGUE, [nativeRow({})], true)],
    });
    const { container } = render(
      <ReportDocument report={report} view="combined" />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not a valid statement/i);
    expect(alert.className).toMatch(/print:hidden/);
    expect(container.querySelector(".report-document")).not.toBeNull();
  });

  it("no alert when complete", () => {
    render(<ReportDocument report={build()} view="combined" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("multi-branch single employee", () => {
  it("one coherent statement across branches with separate source sections", () => {
    const report = build({
      attendance: [
        slice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })]),
        slice(TAP, NASA, [
          nativeRow({
            sessionId: "2",
            locationId: "loc-nasa",
            serviceDate: "2026-11-06",
          }),
        ]),
      ],
    });
    const { container } = render(
      <ReportDocument report={report} view="attendance" />,
    );
    const statements = container.querySelectorAll(".report-statement");
    expect(statements).toHaveLength(1);
    const text = statements[0]!.textContent ?? "";
    expect(text).toContain("League City");
    expect(text).toContain("NASA");
  });
});
