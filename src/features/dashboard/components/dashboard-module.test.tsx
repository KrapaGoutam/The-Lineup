import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppTab } from "@/lib/app-tab";

import type { DashboardActionResult } from "../actions/dashboard-actions";
import type { DashboardData } from "../domain/dashboard-model";
import { DashboardModule } from "./dashboard-module";

const ALL_TABS: AppTab[] = [
  "attendance",
  "payroll",
  "tips",
  "barInventory",
  "tasks",
  "allocation",
];
const hrefFor = (tab: AppTab) => `/r/monks?location=loc&tab=${tab}`;

function data(over: Partial<DashboardData> = {}): DashboardData {
  return {
    organizationName: "The Monk's",
    locationName: "River Oaks",
    timeZone: "America/Chicago",
    serviceDate: "2026-11-19",
    generatedAt: "2026-11-19T18:42:00Z",
    isManagement: true,
    cards: {
      attendance: {
        status: "ok",
        data: { clockedIn: 4, onBreak: 1, sourceLabel: "TheLineup Internal" },
      },
      payroll: {
        status: "ok",
        data: {
          draftPeriods: 2,
          periodMonth: "2026-11-01",
          outstandingBalanceCents: 123_456,
          periodsCounted: 6,
        },
      },
      tips: {
        status: "ok",
        data: {
          view: "manager",
          serviceDate: "2026-11-19",
          totalCents: 14_001,
          cashCents: 10_001,
          cardCents: 3_000,
          notSplitCents: 1_000,
          intervalCount: 2,
          lastUpdatedAt: "2026-11-19T18:30:00Z",
        },
      },
      lowStock: {
        status: "ok",
        data: { needsOrdering: 5, critical: 2, low: 3 },
      },
    },
    quickActions: [
      {
        id: "tasks",
        label: "Tasks",
        description: "Open Management Today",
        target: { kind: "tab", tab: "tasks" },
      },
      {
        id: "reporting",
        label: "Reporting Center",
        description: "Open reports",
        target: { kind: "href", href: "/reporting" },
      },
    ],
    ...over,
  };
}

const ok = (d: DashboardData): DashboardActionResult => ({ ok: true, data: d });

function mount(
  loader: () => Promise<DashboardActionResult>,
  handlers: {
    onOpenTab?: (tab: AppTab) => void;
    onSessionInvalid?: () => void;
    onContextStale?: () => void;
    availableTabs?: AppTab[];
  } = {},
) {
  return render(
    <DashboardModule
      loader={loader}
      hrefFor={hrefFor}
      onOpenTab={handlers.onOpenTab ?? vi.fn()}
      availableTabs={handlers.availableTabs ?? ALL_TABS}
      onSessionInvalid={handlers.onSessionInvalid ?? vi.fn()}
      onContextStale={handlers.onContextStale ?? vi.fn()}
    />,
  );
}

describe("DashboardModule", () => {
  it("shows the branch, the local date and all four KPI figures from one read", async () => {
    const loader = vi.fn(async () => ok(data()));
    mount(loader);
    expect(
      await screen.findByText("The Monk's · River Oaks"),
    ).toBeInTheDocument();
    expect(screen.getByText("Thursday, November 19")).toBeInTheDocument();
    expect(
      screen.getByTestId("dashboard-card-attendance-value"),
    ).toHaveTextContent("4");
    expect(
      screen.getByTestId("dashboard-card-payroll-value"),
    ).toHaveTextContent("2");
    expect(
      screen.getByText("Outstanding balance $1,234.56"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("November 2026 · not yet locked"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-card-tips-value")).toHaveTextContent(
      "$140.01",
    );
    expect(screen.getByText("Cash $100.01 · Card $30.00")).toBeInTheDocument();
    // Legacy money with no cash/card classification stays visible and identifiable.
    expect(screen.getByText("Not split $10.00")).toBeInTheDocument();
    expect(
      screen.getByTestId("dashboard-card-lowStock-value"),
    ).toHaveTextContent("5");
    expect(screen.getByText("2 critical · 3 low")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1); // no polling, no second read on mount
  });

  it("a valid zero is a real zero, never Unavailable", async () => {
    mount(async () =>
      ok(
        data({
          cards: {
            attendance: {
              status: "ok",
              data: {
                clockedIn: 0,
                onBreak: 0,
                sourceLabel: "TheLineup Internal",
              },
            },
            lowStock: {
              status: "ok",
              data: { needsOrdering: 0, critical: 0, low: 0 },
            },
          },
        }),
      ),
    );
    expect(
      await screen.findByTestId("dashboard-card-attendance-value"),
    ).toHaveTextContent("0");
    expect(
      screen.getByText("Nobody is clocked in right now"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing is low right now")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("an unavailable source says Unavailable with its reason, never 0 or $0.00", async () => {
    mount(async () =>
      ok(
        data({
          cards: {
            attendance: {
              status: "unavailable",
              reason:
                "This branch uses an external time clock that doesn't report by branch.",
            },
            payroll: {
              status: "unavailable",
              reason: "Couldn't load payroll right now.",
            },
          },
        }),
      ),
    );
    const attendance = await screen.findByTestId(
      "dashboard-card-attendance-value",
    );
    expect(attendance).toHaveTextContent("Unavailable");
    expect(
      screen.getByTestId("dashboard-card-payroll-value"),
    ).toHaveTextContent("Unavailable");
    expect(screen.getByText(/external time clock/)).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("a module that is turned off is explained and not linked", async () => {
    mount(async () =>
      ok(data({ cards: { tips: { status: "module_off" } }, quickActions: [] })),
    );
    const card = await screen.findByTestId("dashboard-card-tips");
    expect(card).toHaveTextContent("Turned off");
    expect(card.querySelector("a")).toBeNull();
  });

  it("a staff payload renders only the cards it contains (no payroll, no stock)", async () => {
    mount(async () =>
      ok(
        data({
          isManagement: false,
          cards: {
            tips: {
              status: "ok",
              data: {
                view: "staff",
                serviceDate: "2026-11-19",
                totalCents: 4_500,
                cashCents: 2_500,
                cardCents: 2_000,
                notSplitCents: 0,
              },
            },
          },
        }),
      ),
    );
    expect(await screen.findByText("My tips today")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-card-tips-value")).toHaveTextContent(
      "$45.00",
    );
    expect(screen.queryByTestId("dashboard-card-payroll")).toBeNull();
    expect(screen.queryByTestId("dashboard-card-lowStock")).toBeNull();
    expect(screen.queryByTestId("dashboard-card-attendance")).toBeNull();
  });

  it("a plain click opens the module in-app; a modified click keeps the browser's own behavior", async () => {
    const onOpenTab = vi.fn();
    mount(async () => ok(data()), { onOpenTab });
    const link = (
      await screen.findByTestId("dashboard-card-payroll")
    ).querySelector("a")!;
    expect(link).toHaveAttribute("href", "/r/monks?location=loc&tab=payroll");
    fireEvent.click(link);
    expect(onOpenTab).toHaveBeenCalledWith("payroll");
    onOpenTab.mockClear();
    fireEvent.click(link, { ctrlKey: true });
    expect(onOpenTab).not.toHaveBeenCalled();
  });

  it("each card and shortcut points at the right destination", async () => {
    mount(async () => ok(data()));
    await screen.findByTestId("dashboard-card-attendance");
    const href = (id: string) =>
      screen.getByTestId(id).closest("a")?.getAttribute("href") ??
      screen.getByTestId(id).querySelector("a")?.getAttribute("href");
    expect(href("dashboard-card-attendance")).toContain("tab=attendance");
    expect(href("dashboard-card-payroll")).toContain("tab=payroll");
    expect(href("dashboard-card-tips")).toContain("tab=tips");
    expect(href("dashboard-card-lowStock")).toContain("tab=barInventory");
    expect(href("dashboard-action-tasks")).toContain("tab=tasks");
    // Reporting is a real route, not a tab.
    expect(screen.getByTestId("dashboard-action-reporting")).toHaveAttribute(
      "href",
      "/reporting",
    );
  });

  it("a failed read shows an alert and Try again recovers", async () => {
    const loader = vi
      .fn<() => Promise<DashboardActionResult>>()
      .mockResolvedValueOnce({
        ok: false,
        error: "The dashboard couldn't be loaded. Try again shortly.",
      })
      .mockResolvedValueOnce(ok(data()));
    mount(loader);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't be loaded",
    );
    expect(screen.queryByTestId("dashboard-card-attendance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByTestId("dashboard-card-attendance"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a thrown loader is handled as a failed read", async () => {
    mount(async () => {
      throw new Error("network");
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("a dead session is handed to the shell and nothing is rendered", async () => {
    const onSessionInvalid = vi.fn();
    mount(async () => ({ ok: false, error: "gone", sessionInvalid: true }), {
      onSessionInvalid,
    });
    await waitFor(() => expect(onSessionInvalid).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("dashboard-card-attendance")).toBeNull();
  });

  it("Refresh is disabled while a read is in flight, then reads again", async () => {
    let release!: (value: DashboardActionResult) => void;
    const pending = new Promise<DashboardActionResult>((resolve) => {
      release = resolve;
    });
    const loader = vi
      .fn<() => Promise<DashboardActionResult>>()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(ok(data()));
    mount(loader);
    const refresh = screen.getByRole("button", { name: /Refresh/ });
    expect(refresh).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(refresh); // ignored while a read is in flight
    expect(loader).toHaveBeenCalledTimes(1);
    release(ok(data()));
    await screen.findByTestId("dashboard-card-attendance");
    await waitFor(() =>
      expect(refresh).toHaveAttribute("aria-disabled", "false"),
    );
    fireEvent.click(refresh);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it("a slow response for an older loader (another branch) never overwrites the current one", async () => {
    let resolveOld!: (value: DashboardActionResult) => void;
    const oldLoader = () =>
      new Promise<DashboardActionResult>((resolve) => {
        resolveOld = resolve;
      });
    const current = data({
      locationName: "League City",
      cards: {
        lowStock: {
          status: "ok",
          data: { needsOrdering: 9, critical: 9, low: 0 },
        },
      },
    });
    const view = mount(oldLoader);
    view.rerender(
      <DashboardModule
        loader={async () => ok(current)}
        hrefFor={hrefFor}
        onOpenTab={vi.fn()}
        availableTabs={ALL_TABS}
        onSessionInvalid={vi.fn()}
        onContextStale={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("The Monk's · League City"),
    ).toBeInTheDocument();
    resolveOld(ok(data()));
    await Promise.resolve();
    expect(screen.getByText("The Monk's · League City")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-card-attendance")).toBeNull();
  });

  it("labels demo data as sample data", async () => {
    mount(async () => ok(data({ demo: true })));
    expect(await screen.findByText(/Sample data/)).toBeInTheDocument();
  });

  it("a role with no cards says so and still offers its shortcuts", async () => {
    mount(async () => ok(data({ cards: {} })));
    expect(await screen.findByTestId("dashboard-no-cards")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-action-tasks")).toBeInTheDocument();
  });

  it("a parent re-render with new callback identities does NOT start another read", async () => {
    const loader = vi.fn(async () => ok(data()));
    const view = mount(loader);
    await screen.findByTestId("dashboard-card-attendance");
    for (let i = 0; i < 3; i++) {
      view.rerender(
        <DashboardModule
          loader={loader}
          hrefFor={hrefFor}
          onOpenTab={() => {}}
          availableTabs={ALL_TABS}
          onSessionInvalid={() => {}}
          onContextStale={() => {}}
        />,
      );
    }
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("a stale workspace offers Reload workspace, not a Try again that would fail the same way", async () => {
    const onContextStale = vi.fn();
    mount(
      async () => ({
        ok: false,
        error: "Refresh your workspace.",
        contextStale: true,
      }),
      { onContextStale },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh your workspace.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload workspace" }));
    expect(onContextStale).toHaveBeenCalledTimes(1);
  });

  it("a card or shortcut whose module the shell will not open is shown off and never linked", async () => {
    mount(async () => ok(data()), {
      availableTabs: ["attendance", "tips"], // no payroll, stock, tasks
    });
    const payroll = await screen.findByTestId("dashboard-card-payroll");
    expect(payroll).toHaveTextContent("Turned off");
    expect(payroll.querySelector("a")).toBeNull();
    expect(screen.queryByText("$1,234.56")).toBeNull();
    expect(screen.getByTestId("dashboard-card-lowStock")).toHaveTextContent(
      "Turned off",
    );
    expect(
      screen.getByTestId("dashboard-card-tips").querySelector("a"),
    ).not.toBeNull();
    expect(screen.queryByTestId("dashboard-action-tasks")).toBeNull();
    // The Reporting route is not a tab, so it stays.
    expect(
      screen.getByTestId("dashboard-action-reporting"),
    ).toBeInTheDocument();
  });

  it("a card link announces its figure (no aria-label overriding the content)", async () => {
    mount(async () => ok(data()));
    const link = (
      await screen.findByTestId("dashboard-card-lowStock")
    ).querySelector("a")!;
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveTextContent("Items needing ordering");
  });
});
