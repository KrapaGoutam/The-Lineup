import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const print = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("@/lib/print-utils", () => ({
  triggerPrintWithFilename: print.trigger,
}));

import { TipsModule } from "@/features/tips/components/tips-module";
import {
  createDemoTipsApi,
  createDemoTipsStore,
  type DemoTipsStore,
} from "@/features/tips/domain/tips-demo-api";
import type { TipsApi } from "@/features/tips/domain/tips-api";
import type { TipsRange } from "@/features/tips/domain/tips-range-model";
import type { TeamMember } from "@/lib/demo-data";

const TODAY = "2026-11-18";
const TZ = "America/Chicago";

const member = (id: string, name: string): TeamMember => ({
  id,
  name,
  shortName: name.split(" ")[0],
  role: "server",
  designation: "staff",
  color: "var(--server-one)",
  active: true,
});
const team = [
  member("mia", "Mia Chen"),
  member("noah", "Noah Diaz"),
  member("ava", "Ava Park"),
];

function apiFor(
  store: DemoTipsStore,
  viewerId: string,
  isManager: boolean,
): TipsApi {
  return createDemoTipsApi({
    store,
    timeZone: TZ,
    viewerId,
    isManager,
    pullClockedIn: async () => ["mia", "noah"],
  });
}

function renderManager(
  store = createDemoTipsStore(),
  initialRange: TipsRange | null = null,
) {
  return render(
    <TipsModule
      team={team}
      initialRange={initialRange}
      today={TODAY}
      timeZone={TZ}
      branchName="The Monks Webster"
      isManager
      api={apiFor(store, "boss", true)}
    />,
  );
}

async function saveFirstInterval(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Cash tips"), "100.00");
  await user.type(screen.getByLabelText("Card tips"), "50.00");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved.");
}

beforeEach(() => print.trigger.mockClear());

describe("Tips module — manager workflow: Save → Update → Recalculate → Review → Print", () => {
  it("shows a live, explicitly unsaved preview that splits cash and card", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.type(screen.getByLabelText("Cash tips"), "10.01");
    await user.type(screen.getByLabelText("Card tips"), "5.00");
    const preview = screen.getByRole("region", { name: "Preview, not saved" });
    // Three default people; $15.01 → $5.01 / $5.00 / $5.00, cash and card both shown.
    expect(within(preview).getAllByText(/cash \+/)).toHaveLength(3);
    expect(
      within(preview).getByText(/could not be divided evenly/),
    ).toBeVisible();
    // The service-date rule is explained where the times are entered.
    expect(
      screen.getByText(/Times belong to the service date shown/),
    ).toBeVisible();
  });

  it("Save persists, reconciles, and offers no Finalize / Unlock anywhere", async () => {
    const user = userEvent.setup();
    renderManager();
    await saveFirstInterval(user);

    expect(await screen.findByText("Reconciled total")).toBeVisible();
    expect(screen.getAllByText("$150.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/matches the allocations/)).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: /finali[sz]e|unlock|unfinali[sz]e|reopen/i,
      }),
    ).not.toBeInTheDocument();
    // The form is ready for the next entry (cash cleared), and Save is still labelled Save.
    expect(screen.getByLabelText("Cash tips")).toHaveValue("");
  });

  it("Edit → Update requires a reason, applies the change, and records before/after", async () => {
    const user = userEvent.setup();
    renderManager();
    await saveFirstInterval(user);

    await user.click(
      screen.getByRole("button", { name: "Edit 11:00 to 13:00" }),
    );
    expect(
      screen.getByRole("heading", { name: /Edit 11:00–13:00/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Update" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    const cash = screen.getByLabelText("Cash tips");
    await user.clear(cash);
    await user.type(cash, "120.00");

    // Too-short reason is refused with a clear message and nothing is saved.
    await user.type(screen.getByLabelText("Reason for change"), "x");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 3 characters",
    );

    await user.clear(screen.getByLabelText("Reason for change"));
    await user.type(
      screen.getByLabelText("Reason for change"),
      "Counted again",
    );
    await user.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText(
      /Updated\. The previous values are in the change history\./,
    );

    expect(screen.getAllByText("$170.00").length).toBeGreaterThan(0);
    const history = screen.getByTestId("tip-change-history");
    await user.click(within(history).getByText(/Change history \(2\)/));
    expect(
      within(history).getByText(/cash \$100\.00 → \$120\.00/),
    ).toBeVisible();
    expect(within(history).getByText("Reason: Counted again")).toBeVisible();
  });

  it("Recalculate re-derives the saved distribution and says so", async () => {
    const user = userEvent.setup();
    renderManager();
    await saveFirstInterval(user);
    await user.click(screen.getByRole("button", { name: /Recalculate/ }));
    expect(
      await screen.findByText("Allocations are already up to date."),
    ).toBeVisible();
  });

  it("Void needs a reason, keeps the entry on record and removes its money", async () => {
    const user = userEvent.setup();
    renderManager();
    await saveFirstInterval(user);
    await user.click(
      screen.getByRole("button", { name: "Void 11:00 to 13:00" }),
    );
    await user.type(screen.getByLabelText("Reason for voiding"), "Wrong day");
    await user.click(screen.getByRole("button", { name: "Void entry" }));
    await screen.findByText(/Entry voided\./);
    expect(screen.getAllByText("Voided").length).toBeGreaterThan(0);
    expect(screen.getByText("Wrong day")).toBeVisible();
    expect(screen.queryByTestId("tip-interval-row")).not.toBeInTheDocument();
  });

  it("Pull clocked-in team only SUGGESTS people; the manager still approves", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(
      screen.getByRole("button", { name: "Pull clocked-in team" }),
    );
    expect(screen.getByRole("checkbox", { name: "Mia" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Noah" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ava" })).not.toBeChecked();
    // Nothing was saved by pulling.
    expect(screen.getByText(/Nothing saved for this day yet/)).toBeVisible();
  });

  it("History shows summaries for the period and prints with a named file", async () => {
    const user = userEvent.setup();
    const store = createDemoTipsStore();
    // Seed one saved day so the history has something to show.
    const seed = apiFor(store, "boss", true);
    await seed.saveInterval({
      serviceDate: TODAY,
      start: "11:00",
      end: "13:00",
      cashCents: 10001,
      cardCents: 5000,
      participantIds: ["mia", "noah"],
    });
    renderManager(store);
    await user.click(screen.getByRole("button", { name: /View history/ }));
    const report = await screen.findByTestId("tips-report");
    expect(within(report).getByText("Tips Distribution Report")).toBeVisible();
    expect(within(report).getByText("The Monks Webster")).toBeVisible();
    expect(within(report).getByText("Totals by employee")).toBeVisible();
    expect(within(report).getAllByText("$150.01").length).toBeGreaterThan(0);

    // Period presets are all there.
    for (const label of [
      "Today",
      "Yesterday",
      "This week",
      "This month",
      "Previous month",
      "Custom range",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(
      await screen.findByText("No tips were saved for this period."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "This week" }));
    await screen.findByText("Tips Distribution Report");

    await user.click(screen.getByRole("button", { name: /Print \/ Save PDF/ }));
    expect(print.trigger).toHaveBeenCalledWith(
      expect.stringMatching(/^Tips Report /),
    );
  });
});

describe("Tips module — concurrent edit", () => {
  it("shows the conflict message OUTSIDE the editor, loads the latest version and keeps the user informed", async () => {
    const user = userEvent.setup();
    const store = createDemoTipsStore();
    const real = apiFor(store, "boss", true);
    const seeded = await real.saveInterval({
      serviceDate: TODAY,
      start: "11:00",
      end: "13:00",
      cashCents: 10000,
      cardCents: 0,
      participantIds: ["mia", "noah"],
    });
    if (!seeded.ok) throw new Error("seed");
    // Another manager changes the interval first, so this tab's revision is stale.
    await real.saveInterval({
      serviceDate: TODAY,
      intervalId: String(seeded.data.intervalId),
      expectedRevision: 1,
      start: "11:00",
      end: "13:00",
      cashCents: 12000,
      cardCents: 0,
      participantIds: ["mia", "noah"],
      reason: "Other manager",
    });
    let served = 0;
    const staleApi: TipsApi = {
      ...real,
      // The first load (tab entry) returns the OLD revision, as a stale tab would have it.
      loadRange: async (input) => {
        const loaded = await real.loadRange(input);
        if (!loaded.ok || served++ > 0) return loaded;
        const range = structuredClone(loaded.data.range);
        for (const day of range.days) {
          for (const interval of day.intervals) {
            interval.revision = 1;
            interval.cashCents = 10000;
            interval.amountCents = 10000;
          }
        }
        return { ok: true, data: { range } };
      },
    };
    render(
      <TipsModule
        team={team}
        initialRange={null}
        today={TODAY}
        timeZone={TZ}
        branchName="The Monks Webster"
        isManager
        api={staleApi}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Edit 11:00 to 13:00" }),
    );
    await user.type(
      screen.getByLabelText("Reason for change"),
      "Counted again",
    );
    await user.click(screen.getByRole("button", { name: "Update" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("changed by someone else");
    expect(notice).toHaveTextContent("Your edits were not saved");
    // The latest saved version (revision 2, $120.00) is what is now shown.
    expect(await screen.findAllByText("$120.00")).not.toHaveLength(0);
  });
});

describe("Tips module — locked legacy days", () => {
  it("is read-only and offers only the reasoned, audited correction (no Finalize/Unlock wording)", async () => {
    const user = userEvent.setup();
    const reopen = vi.fn(async () => ({ ok: true as const, data: null }));
    const lockedRange: TipsRange = {
      timeZone: TZ,
      from: TODAY,
      to: TODAY,
      isManager: true,
      days: [
        {
          poolId: 9,
          serviceDate: TODAY,
          status: "finalized",
          updatedAt: "2026-11-18T20:00:00Z",
          revisions: [],
          allocations: [
            {
              profileId: "mia",
              amountCents: 1000,
              cashCents: 0,
              cardCents: 0,
              unclassifiedCents: 1000,
            },
          ],
          intervals: [
            {
              id: "5",
              startsAt: "2026-11-18T17:00:00Z",
              endsAt: "2026-11-18T19:00:00Z",
              start: "11:00",
              end: "13:00",
              endsNextDay: false,
              amountCents: 1000,
              cashCents: 0,
              cardCents: 0,
              tenderRecorded: false,
              revision: 1,
              voided: false,
              voidReason: null,
              participantIds: ["mia"],
              participantCount: 1,
              shares: [
                {
                  profileId: "mia",
                  amountCents: 1000,
                  cashCents: 0,
                  cardCents: 0,
                  unclassifiedCents: 1000,
                },
              ],
            },
          ],
        },
      ],
    };
    const store = createDemoTipsStore();
    const api = {
      ...apiFor(store, "boss", true),
      reopenLegacy: reopen,
      // The module refreshes on mount; the backend still reports the locked day.
      loadRange: async () => ({
        ok: true as const,
        data: { range: lockedRange },
      }),
    };
    render(
      <TipsModule
        team={team}
        initialRange={lockedRange}
        today={TODAY}
        timeZone={TZ}
        branchName="The Monks Webster"
        isManager
        api={api}
      />,
    );
    expect(screen.getByText(/Locked legacy record/)).toBeVisible();
    expect(screen.getByText("Cash/card not recorded")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Void / }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Correct locked record" }),
    );
    await user.type(
      screen.getByLabelText("Reason for correcting this locked record"),
      "Late cash tip",
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(reopen).toHaveBeenCalledWith(9, "Late cash tip");
  });
});

describe("Tips module — staff see only their own tips", () => {
  it("shows own estimate and history, never a co-worker's name or amount", async () => {
    const store = createDemoTipsStore();
    await apiFor(store, "boss", true).saveInterval({
      serviceDate: TODAY,
      start: "11:00",
      end: "13:00",
      cashCents: 10001,
      cardCents: 5000,
      participantIds: ["mia", "noah", "ava"],
    });
    const staffApi = apiFor(store, "mia", false);
    const loaded = await staffApi.loadRange({
      from: TODAY,
      to: TODAY,
      includeRevisions: true,
    });
    if (!loaded.ok) throw new Error("load");
    render(
      <TipsModule
        team={[team[0]]}
        initialRange={loaded.data.range}
        today={TODAY}
        timeZone={TZ}
        branchName="The Monks Webster"
        isManager={false}
        api={staffApi}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "My tip estimate" }),
    ).toBeVisible();
    // $150.01 among three, ordered by id: Ava (first) gets the extra cent, Mia exactly $50.00.
    expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$50.01")).not.toBeInTheDocument();
    expect(screen.queryByText("$150.01")).not.toBeInTheDocument();
    expect(screen.queryByText(/Noah|Ava/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(Save|Update)$|^Void|^Edit/ }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("My tips history")).toBeVisible();
  });
});

describe("Tips module — fail-closed", () => {
  it("shows only the notice when the Tips read is unavailable", () => {
    render(
      <TipsModule
        team={[]}
        initialRange={null}
        today={TODAY}
        timeZone={TZ}
        branchName="x"
        isManager
        unavailableMessage="You don't have access to Tips for this location."
        api={apiFor(createDemoTipsStore(), "boss", true)}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("don't have access");
    expect(screen.queryByLabelText("Cash tips")).not.toBeInTheDocument();
  });
});

describe("Tips report document — print safety", () => {
  it("uses no element the shared print stylesheet hides (the PDF check found <header> dropped the title) and lets days flow", async () => {
    const user = userEvent.setup();
    const store = createDemoTipsStore();
    await apiFor(store, "boss", true).saveInterval({
      serviceDate: TODAY,
      start: "11:00",
      end: "13:00",
      cashCents: 1000,
      cardCents: 0,
      participantIds: ["mia"],
    });
    renderManager(store);
    await user.click(screen.getByRole("button", { name: /View history/ }));
    const report = await screen.findByTestId("tips-report");
    // globals.css hides header, nav and button inside @media print.
    expect(report.querySelector("header, nav, button")).toBeNull();
    expect(within(report).getByTestId("tips-report-title")).toBeVisible();
    // Only the first section forces a page; each day stays together but flows.
    expect(report.querySelectorAll(".report-section")).toHaveLength(1);
    expect(report.querySelectorAll(".report-keep").length).toBeGreaterThan(1);
  });

  it("the staff report has no People column (staff only receive their own allocation, so the count would mislead)", async () => {
    const store = createDemoTipsStore();
    await apiFor(store, "boss", true).saveInterval({
      serviceDate: TODAY,
      start: "11:00",
      end: "13:00",
      cashCents: 1000,
      cardCents: 0,
      participantIds: ["mia", "noah"],
    });
    const staffApi = apiFor(store, "mia", false);
    const loaded = await staffApi.loadRange({
      from: TODAY,
      to: TODAY,
      includeRevisions: false,
    });
    if (!loaded.ok) throw new Error("load");
    render(
      <TipsModule
        team={[team[0]]}
        initialRange={loaded.data.range}
        today={TODAY}
        timeZone={TZ}
        branchName="x"
        isManager={false}
        api={staffApi}
      />,
    );
    const report = await screen.findByTestId("tips-report");
    const daily = within(report).getByText("Daily summary").closest("table")!;
    expect(within(daily).queryByText("People")).not.toBeInTheDocument();
  });
});
