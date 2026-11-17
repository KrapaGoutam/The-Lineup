import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { SignedInUser } from "@/components/login-screen";
import { team } from "@/lib/demo-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/features/allocation/actions/allocation-actions", () => ({
  executeBoardActionRemote: vi.fn(),
  getAllocationContextForDateAction: vi.fn(),
  redoBoardAction: vi.fn(),
  undoBoardAction: vi.fn(),
}));
vi.mock("@/features/allocation/hooks/use-board-realtime", () => ({
  useBoardRealtime: () => undefined,
}));

import { AllocationWorkspace } from "@/features/allocation/components/allocation-workspace";

// jsdom has no <dialog>.showModal(); an open attribute is what visibility
// and role queries read.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});
afterEach(() => window.localStorage.clear());

const owner: SignedInUser = {
  profileId: "owner",
  name: "Owner",
  role: "owner",
  designation: "owner",
  organizationId: "demo-org",
};

/**
 * Demo mode seeds Mia (12, 15), Leo (8, 10), Ava (21 + 22) and Noah (4) with
 * free-text (off-map) tables, so "Dine-in today" starts at 7 physical
 * seatings and Ava is the canonical next server. T1..T19 / B1..B8 are free.
 */
async function openCombined() {
  const user = userEvent.setup();
  render(
    <AllocationWorkspace
      user={owner}
      team={team}
      boardLocked={false}
      onReopenTips={vi.fn()}
      tipsAuditLog={[]}
      demoMode
      restaurantSlug="demo"
      onSessionInvalid={vi.fn()}
    />,
  );
  return user;
}

const metric = (label: string) => {
  const section = screen.getByRole("region", { name: "Allocation metrics" });
  return within(section).getByText(label).nextElementSibling?.textContent;
};
const dialog = () => document.querySelector("dialog[open]") as HTMLElement;
const records = () =>
  within(screen.getByRole("region", { name: "Active service records" }));

describe("Combined view: registration and modes", () => {
  it("renders Combined directly on mount as the sole workspace view without outer tablist", async () => {
    render(
      <AllocationWorkspace
        user={owner}
        team={team}
        boardLocked={false}
        onReopenTips={vi.fn()}
        tipsAuditLog={[]}
        demoMode
        restaurantSlug="demo"
        onSessionInvalid={vi.fn()}
      />,
    );
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Demo · Combined View")).toBeVisible();
    expect(screen.getByRole("group", { name: "Floor map" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Rotation history" }),
    ).toBeVisible();
  });

  it("shows the compact header, the five metrics and no guest-count control", async () => {
    await openCombined();
    expect(
      screen.getByRole("heading", { name: "Table Allocation", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("Demo · Combined View")).toBeVisible();
    expect(metric("Dine-in today")).toBe("7");
    expect(metric("Servers")).toBe("4");
    expect(metric("Next")).toBe("Ava");
    expect(screen.queryByText(/guest|party size|covers/i)).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("switches Split / Floor / Rotation without losing the board and remembers the choice", async () => {
    const user = await openCombined();
    const before = records().getAllByRole("button").length;
    expect(before).toBe(7 - 1); // seven tables held as six active assignments
    // Split shows both panels.
    expect(screen.getByRole("group", { name: "Floor map" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Rotation history" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Floor Focus" }));
    expect(screen.getByRole("group", { name: "Floor map" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Rotation history" }),
    ).toBeNull();
    expect(
      window.localStorage.getItem("lineup.allocation.combined-mode.demo"),
    ).toBe("floor");

    await user.click(screen.getByRole("button", { name: "Rotation Focus" }));
    expect(screen.queryByRole("group", { name: "Floor map" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Rotation history" }),
    ).toBeVisible();
    expect(records().getAllByRole("button")).toHaveLength(before);
    expect(metric("Dine-in today")).toBe("7");
  });
});

describe("Combined view: expand", () => {
  it("Expand opens Rotation Focus and keeps the selected record", async () => {
    const user = await openCombined();
    await user.click(
      records().getByRole("button", { name: "Table 4, Noah Diaz, active" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Expand to Rotation Focus" }),
    );
    expect(screen.queryByRole("group", { name: "Floor map" })).toBeNull();
    // The same record is still selected and its actions are still available.
    expect(
      records().getByRole("button", { name: "Table 4, Noah Diaz, active" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "End table" })).toBeVisible();
    // No Expand control once already in Rotation Focus.
    expect(
      screen.queryByRole("button", { name: "Expand to Rotation Focus" }),
    ).toBeNull();
  });
});

describe("Combined view: quick table assignment", () => {
  it("assigns from a NEXT cell with that server preselected, closes on success, updates records and metrics", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: "Assign next table to Noah Diaz" }),
    );
    const picker = within(dialog());
    expect(picker.getByText("Quick Table Assignment")).toBeVisible();
    expect(picker.getByRole("combobox", { name: "Server" })).toHaveValue(
      "noah",
    );

    await user.click(picker.getByRole("button", { name: "Table T3, free" }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(
      records().getByRole("button", { name: "Table T3, Noah Diaz, active" }),
    ).toBeVisible();
    expect(metric("Dine-in today")).toBe("8");
    expect(metric("Active")).toBe("8");
  });

  it("keeps occupied tables visible but not assignable, and Plan mirrors Quick Grid", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: "Assign next table to Ava Brooks" }),
    );
    const picker = within(dialog());
    // "12" is held by Mia (an off-map free-text table).
    const busy = picker.getByRole("button", {
      name: "Table 12, busy, assigned to Mia Chen, off-map",
    });
    expect(busy).toBeDisabled();
    await user.click(picker.getByRole("button", { name: "Floor Plan" }));
    const plan = picker.getByRole("group", { name: "Floor map" });
    expect(
      within(plan).getByRole("button", { name: "Table T1, available" }),
    ).toBeEnabled();
    // The picker never offers a second claim on a held table.
    expect(
      picker.queryByRole("button", { name: /^Table 12, available/ }),
    ).toBeNull();
  });

  it("does not offer assignment to a paused server", async () => {
    const user = await openCombined();
    await user.click(screen.getByRole("button", { name: /^Mia Chen, active/ }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      screen.queryByRole("button", { name: "Assign next table to Mia Chen" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Mia Chen is paused and cannot be assigned"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(
      screen.getByRole("button", { name: "Assign next table to Mia Chen" }),
    ).toBeVisible();
  });
});

describe("Combined view: selected table actions", () => {
  it("assigns a free table to the next server by default, with an override", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: "Table T5, available" }),
    );
    const panel = within(
      screen.getByRole("region", { name: "Selected table actions" }),
    );
    expect(panel.getByText("Available", { exact: false })).toBeVisible();
    expect(
      panel.getByRole("combobox", { name: "Server for this table" }),
    ).toHaveValue("ava");
    await user.selectOptions(
      panel.getByRole("combobox", { name: "Server for this table" }),
      "noah",
    );
    await user.click(panel.getByRole("button", { name: "Assign" }));
    expect(
      records().getByRole("button", { name: "Table T5, Noah Diaz, active" }),
    ).toBeVisible();
  });

  it("transfers without a new seating, then ends the table (active record gone, cycle completed)", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: "Table T6, available" }),
    );
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(metric("Dine-in today")).toBe("8");

    await user.click(
      records().getByRole("button", { name: "Table T6, Ava Brooks, active" }),
    );
    const panel = () =>
      within(screen.getByRole("region", { name: "Selected table actions" }));
    expect(panel().getByText(/T6/)).toBeVisible();
    await user.click(panel().getByRole("button", { name: "Transfer" }));
    await user.click(panel().getByRole("button", { name: "Leo Park" }));
    expect(
      records().getByRole("button", { name: "Table T6, Leo Park, active" }),
    ).toBeVisible();
    expect(metric("Dine-in today")).toBe("8"); // transfer is not a new seating

    await user.click(
      records().getByRole("button", { name: "Table T6, Leo Park, active" }),
    );
    await user.click(panel().getByRole("button", { name: "End table" }));
    expect(records().queryByRole("button", { name: /Table T6/ })).toBeNull();
    expect(metric("Dine-in today")).toBe("8");
    expect(metric("Completed")).toBe("1");
  });

  it("clears an entry as a correction and undo restores it", async () => {
    const user = await openCombined();
    await user.click(
      records().getByRole("button", { name: "Table 4, Noah Diaz, active" }),
    );
    await user.click(screen.getByRole("button", { name: "Clear entry" }));
    expect(records().queryByRole("button", { name: /Table 4,/ })).toBeNull();
    expect(metric("Dine-in today")).toBe("6");

    await user.click(screen.getByRole("button", { name: "Tools" }));
    await user.click(within(dialog()).getByRole("button", { name: "Undo" }));
    expect(
      records().getByRole("button", { name: "Table 4, Noah Diaz, active" }),
    ).toBeVisible();
    expect(metric("Dine-in today")).toBe("7");
  });
});

describe("Combined view: rotation controls", () => {
  it("lists turns newest first, keyed by turn number", async () => {
    await openCombined();
    const history = within(
      screen.getByRole("region", { name: "Rotation history" }),
    );
    const turns = history
      .getAllByRole("button", { name: /^Turn \d+, Mia Chen/ })
      .map((button) => button.getAttribute("aria-label"));
    expect(turns[0]).toMatch(/^Turn 2, Mia Chen: 15, active/);
    expect(turns[1]).toMatch(/^Turn 1, Mia Chen: 12, active/);
  });

  it("reorders, and moves the canonical next server only through the engine", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: /^Noah Diaz, active/ }),
    );
    await user.click(screen.getByRole("button", { name: "Move Noah Diaz up" }));
    const heads = within(
      screen.getByRole("region", { name: "Rotation history" }),
    )
      .getAllByRole("button", { pressed: true })
      .map((button) => button.textContent);
    expect(heads.length).toBeGreaterThan(0);
    expect(metric("Next")).toBe("Noah"); // Noah now precedes Ava with no turn recorded
  });

  it("skips a turn without counting it as a table served", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: /^Ava Brooks, active/ }),
    );
    await user.click(screen.getByRole("button", { name: "Skip turn" }));
    expect(metric("Dine-in today")).toBe("7");
    expect(metric("Next")).toBe("Noah");
  });
});

describe("Combined view: correcting a skipped turn", () => {
  it("offers the same Clear entry in Tools as in the selection panel", async () => {
    const user = await openCombined();
    await user.click(
      screen.getByRole("button", { name: /^Ava Brooks, active/ }),
    );
    await user.click(screen.getByRole("button", { name: "Skip turn" }));
    // Ava's skipped turn is recorded in her own next open turn (turn 2).
    await user.click(
      screen.getByRole("button", {
        name: "Turn 2, Ava Brooks: skipped turn",
      }),
    );
    const panel = within(
      screen.getByRole("region", { name: "Selected table actions" }),
    );
    expect(panel.getByText(/Skipped turn/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const clear = within(dialog()).getByRole("button", {
      name: /^Clear entry Skipped turn/,
    });
    expect(clear).toBeEnabled();
    await user.click(clear);
    await user.click(
      within(dialog()).getByRole("button", { name: "Clear entry" }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Turn 2, Ava Brooks: skipped turn",
      }),
    ).toBeNull();
  });
});

describe("Combined view: add server", () => {
  it("searches the branch roster, blocks duplicates and adds an existing employee", async () => {
    const user = await openCombined();
    await user.click(screen.getByRole("button", { name: "Server" }));
    const picker = within(dialog());
    expect(picker.getByText("Add server")).toBeVisible();
    // Mia is already on the rotation: no Add action, status shown.
    const mia = picker.getByText("Mia Chen").closest("li")!;
    expect(within(mia).getByText("Already added")).toBeVisible();
    expect(within(mia).queryByRole("button")).toBeNull();

    await user.type(picker.getByRole("searchbox"), "zar");
    expect(picker.queryByText("Mia Chen")).toBeNull();
    await user.click(picker.getByRole("button", { name: "Add Zara Reed" }));
    const zara = picker.getByText("Zara Reed").closest("li")!;
    expect(within(zara).getByText("Already added")).toBeVisible();
    expect(metric("Servers")).toBe("5");
  });
});

describe("Combined view: tools", () => {
  it("never clears the board on one tap", async () => {
    const user = await openCombined();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    await user.click(
      within(dialog()).getByRole("button", { name: "Clear board" }),
    );
    expect(within(dialog()).getByText("Clear the whole board?")).toBeVisible();
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(records().getAllByRole("button").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Tools" }));
    await user.click(
      within(dialog()).getByRole("button", { name: "Clear board" }),
    );
    await user.click(
      within(dialog()).getByRole("button", { name: "Clear board" }),
    );
    expect(
      records().getByText("No tables are being served right now."),
    ).toBeVisible();
  });

  it("provides 7-day history navigation in ToolsMenu", async () => {
    const user = await openCombined();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const toolDialog = dialog();
    expect(within(toolDialog).getByLabelText("Service date")).toBeVisible();
    expect(
      within(toolDialog).getByRole("button", { name: "Previous day" }),
    ).toBeVisible();
    expect(
      within(toolDialog).getByRole("button", { name: "Next day" }),
    ).toBeVisible();
  });
});

describe("Dashboard", () => {
  it("shows the same Dine-in today figure as Combined", async () => {
    render(
      <AllocationWorkspace
        user={owner}
        team={team}
        boardLocked={false}
        onReopenTips={vi.fn()}
        tipsAuditLog={[]}
        demoMode
        restaurantSlug="demo"
        onSessionInvalid={vi.fn()}
        initialView="dashboard"
      />,
    );
    const section = screen.getByRole("region", { name: "Floor dashboard" });
    const card = within(section).getByText("Dine-in today");
    expect(card.nextElementSibling?.textContent).toBe("7");
  });
});
