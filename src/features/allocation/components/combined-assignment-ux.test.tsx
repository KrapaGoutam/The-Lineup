import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { RotationBoard } from "@/features/allocation/domain/rotation-board";
import { buildBoardReadModel } from "@/features/allocation/domain/board-read-model";
import type { FloorLayoutEntry } from "@/features/allocation/domain/floor-layout";
import type { TeamMember } from "@/lib/demo-data";

import { FloorView } from "./floor-view";
import { ServerBoardView } from "./server-board-view";
import { TableMap } from "./table-map";

// #109 U3 (109-020..023). Behavior is unchanged -- these tests pin the COPY:
// a combined assignment is identified and explains that Transfer / End /
// Unassign act on the whole assignment; a single table stays concise.

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

const columns = [
  { id: "a", name: "Ann", position: 0, status: "active" as const },
  { id: "b", name: "Bea", position: 1, status: "active" as const },
];
const team = [
  { id: "a", name: "Ann", shortName: "Ann", color: "red" },
  { id: "b", name: "Bea", shortName: "Bea", color: "green" },
] as unknown as TeamMember[];
const layout: FloorLayoutEntry[] = ["T1", "T2", "T3"].map((label, index) => ({
  label,
  x: 10 + index * 10,
  y: 30,
  resourceType: "table" as const,
}));

// Ann holds the combined T1 + T2; Bea holds the single table T3.
const board: RotationBoard = {
  columns,
  rounds: [
    {
      id: "r1",
      sequence: 1,
      cells: [
        { columnId: "a", tableLabel: "T1 + T2", status: "active" },
        { columnId: "b", tableLabel: "T3", status: "active" },
      ],
    },
  ],
  nextRoundNumber: 2,
};
const readModel = buildBoardReadModel({ board, layout, team });
const tables = readModel.tables;

const noop = vi.fn();

function renderFloor() {
  render(
    <FloorView
      tables={tables}
      servers={readModel.servers}
      activeColumns={columns}
      team={team}
      board={board}
      disabled={false}
      onAssign={noop}
      onUnassign={noop}
      onTransfer={noop}
      onEndTable={noop}
      onEndAndAssign={noop}
    />,
  );
}

describe("Floor: whole-assignment copy", () => {
  it("109-021/022/023 a combined table is identified and each action says it affects the whole assignment", async () => {
    const user = userEvent.setup();
    renderFloor();
    await user.click(
      screen.getByRole("button", { name: /^Table T1, assigned to Ann/ }),
    );

    expect(screen.getByText("Combined")).toBeVisible();
    expect(screen.getByText("T1 + T2 are one assignment.")).toBeVisible();
    expect(
      screen.getByText("Ending this assignment releases both tables."),
    ).toBeVisible();

    // The scope is tied to the action, so assistive tech announces it with
    // the button, and the button's own name is unchanged.
    const end = screen.getByRole("button", { name: "End table" });
    expect(end).toHaveAccessibleDescription(
      "Ending this assignment releases both tables.",
    );
    expect(
      screen.getByRole("button", { name: "Transfer" }),
    ).toHaveAccessibleDescription(
      "Transfer moves the entire assignment (T1 + T2).",
    );
    expect(
      screen.getByRole("button", { name: "Unassign" }),
    ).toHaveAccessibleDescription(
      "Unassign removes the entire assignment (T1 + T2).",
    );

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(screen.getByText("Give T1 + T2 to:")).toBeVisible();
    expect(
      screen.getByText("Transfer moves the entire assignment (T1 + T2)."),
    ).toBeVisible();
  });

  it("109-020 tapping the other half of the same assignment shows the same scope", async () => {
    const user = userEvent.setup();
    renderFloor();
    await user.click(
      screen.getByRole("button", { name: /^Table T2, assigned to Ann/ }),
    );
    expect(screen.getByText("T1 + T2 are one assignment.")).toBeVisible();
  });

  it("109-020 a single table keeps the ordinary concise panel", async () => {
    const user = userEvent.setup();
    renderFloor();
    await user.click(
      screen.getByRole("button", { name: /^Table T3, assigned to Bea/ }),
    );
    expect(screen.queryByText("Combined")).toBeNull();
    expect(screen.queryByText(/one assignment/)).toBeNull();
    expect(screen.queryByText(/releases both tables/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "End table" }),
    ).not.toHaveAccessibleDescription();
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(screen.getByText("Give this table to:")).toBeVisible();
  });
});

describe("Picker / Servers map labels", () => {
  it("109-021 each part of a combined assignment announces its partner(s)", () => {
    render(
      <TableMap tables={tables} selectedLabel={null} onSelectTable={noop} />,
    );
    expect(
      screen.getByRole("button", {
        name: "Table T1, assigned to Ann, combined with T2",
      }),
    ).toBeVisible();
    // Leading text unchanged for single tables.
    expect(
      screen.getByRole("button", { name: "Table T3, assigned to Bea" }),
    ).toBeVisible();
  });
});

describe("Servers: whole-assignment copy", () => {
  function renderServers() {
    render(
      <ServerBoardView
        columns={columns}
        team={team}
        tables={tables}
        servers={readModel.servers}
        board={board}
        disabled={false}
        onAssign={noop}
        onMove={noop}
        onSetStatus={noop}
        onClearColumn={noop}
        onTransfer={noop}
        onEndTable={noop}
        onEndAndAssign={noop}
        onUnassign={noop}
      />,
    );
  }

  it("109-021 a combined assignment is labelled on its server card", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Ann server card" });
    expect(within(card).getByText("T1 + T2")).toBeVisible();
    expect(within(card).getByText(/one assignment/)).toBeVisible();
    const other = screen.getByRole("group", { name: "Bea server card" });
    expect(within(other).queryByText(/one assignment/)).toBeNull();
  });

  it("109-022/023 the table dialog explains End and Transfer scope for a combined assignment", async () => {
    const user = userEvent.setup();
    renderServers();
    await user.click(
      screen.getByRole("button", {
        name: /^Table T2, assigned to Ann, combined with T1/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("T1 + T2 are one assignment."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "End table" }),
    ).toHaveAccessibleDescription(
      "Ending this assignment releases both tables.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Transfer" }));
    expect(within(dialog).getByText("Give T1 + T2 to:")).toBeVisible();
    expect(
      within(dialog).getByText(
        "Transfer moves the entire assignment (T1 + T2).",
      ),
    ).toBeVisible();
  });

  it("109-020 a single table's dialog has no extra scope copy", async () => {
    const user = userEvent.setup();
    renderServers();
    await user.click(
      screen.getByRole("button", { name: /^Table T3, assigned to Bea/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByText(/one assignment|releases both/),
    ).toBeNull();
  });
});
