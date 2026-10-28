import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildBoardReadModel } from "@/features/allocation/domain/board-read-model";
import type {
  FloorLayoutEntry,
  RegistryTable,
} from "@/features/allocation/domain/floor-layout";
import type { RotationBoard } from "@/features/allocation/domain/rotation-board";
import type { TableConflictInfo } from "@/features/allocation/domain/table-conflict";
import type { TeamMember } from "@/lib/demo-data";

import { FloorView } from "./floor-view";
import { OffMapTables } from "./off-map-tables";
import { ServerBoardView } from "./server-board-view";
import { useTableClaim } from "./table-claim";

// X1 / X2 / X3 component contracts: off-map representation, the shared
// occupied-table dialog, and Servers session history.

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
const layout: FloorLayoutEntry[] = [
  { diningTableId: 19, label: "T1", x: 10, y: 30, resourceType: "table" },
  { diningTableId: 12, label: "T6", x: 30, y: 30, resourceType: "table" },
];
const registry: RegistryTable[] = [
  ...layout,
  { diningTableId: 77, label: "P1", x: null, y: null, resourceType: "table" },
];

// (#157: typed "1" now resolves to the registered T1; "1" below stands for a
// legacy stored free-text label, which still renders exactly as stored.)
// Ann holds the free-text "1" and T6; Bea ended T2's history entry... (T2 is
// not registered here, so it is also a free-text history label).
const board: RotationBoard = {
  columns,
  rounds: [
    {
      id: "r1",
      sequence: 1,
      cells: [
        { columnId: "a", tableLabel: "1", status: "active" },
        { columnId: "b", tableLabel: "T2", status: "ended" },
      ],
    },
    {
      id: "r2",
      sequence: 2,
      cells: [{ columnId: "a", tableLabel: "T6", status: "active" }],
    },
  ],
  nextRoundNumber: 3,
};
const model = buildBoardReadModel({ board, layout, registry, team });
const noop = vi.fn();

describe("OffMapTables (X1)", () => {
  it("lists a held free-text table with its owner and an available registered one, separately from the map", () => {
    render(
      <OffMapTables
        tables={model.offMapTables}
        onSelectTable={noop}
        heading="Off-map / unpositioned tables"
      />,
    );
    const region = screen.getByRole("region", {
      name: "Off-map / unpositioned tables",
    });
    expect(
      within(region).getByRole("button", {
        name: "Table 1, assigned to Ann, off-map",
      }),
    ).toBeVisible();
    expect(within(region).getByText(/Active — Ann/)).toBeVisible();
    expect(
      within(region).getByRole("button", {
        name: "Table P1, available, off-map",
      }),
    ).toBeVisible();
    // "1" is not in the table list at all.
    expect(within(region).getByText("Not in the table list")).toBeVisible();
  });

  it("renders nothing when every table is on the map", () => {
    const { container } = render(
      <OffMapTables tables={[]} onSelectTable={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("selecting an off-map row reports its exact label", async () => {
    const onSelect = vi.fn();
    render(
      <OffMapTables tables={model.offMapTables} onSelectTable={onSelect} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /^Table P1,/ }));
    expect(onSelect).toHaveBeenCalledWith("P1");
  });
});

describe("Floor shows off-map tables without placing them on the map (X1)", () => {
  it("T1 stays available while the off-map table 1 is active", () => {
    render(
      <FloorView
        tables={model.tables}
        offMapTables={model.offMapTables}
        servers={model.servers}
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
    expect(
      screen.getByRole("button", { name: "Table T1, available" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Table 1, assigned to Ann, off-map" }),
    ).toBeVisible();
    // The map itself never contains a tile for "1".
    const map = screen.getByRole("group", { name: "Floor map" });
    expect(within(map).queryByRole("button", { name: /^Table 1,/ })).toBeNull();
  });

  it("an off-map owned table opens the same occupied-table panel", async () => {
    const user = userEvent.setup();
    render(
      <FloorView
        tables={model.tables}
        offMapTables={model.offMapTables}
        servers={model.servers}
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
    await user.click(
      screen.getByRole("button", { name: "Table 1, assigned to Ann, off-map" }),
    );
    expect(screen.getByText("Assigned to")).toBeVisible();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Assign to another server…" }),
    ).toBeVisible();
  });
});

describe("Servers keeps ended history (X3)", () => {
  function renderServers() {
    render(
      <ServerBoardView
        columns={columns}
        team={team}
        tables={model.tables}
        offMapTables={model.offMapTables}
        servers={model.servers}
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

  it("Bea has no active table but her ended T2 stays visible, labelled Ended", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Bea server card" });
    expect(within(card).getByText("0 tables", { exact: false })).toBeVisible();
    expect(within(card).getByText("No tables assigned.")).toBeVisible();
    const history = within(card).getByRole("group", {
      name: "Bea session history",
    });
    expect(within(history).getByText("T2")).toHaveClass("line-through");
    expect(within(history).getByText("Ended", { exact: false })).toBeVisible();
    // Not an actionable active chip.
    expect(
      within(card).queryByRole("button", { name: /^Table T2, assigned to/ }),
    ).toBeNull();
  });

  it("a server with only active tables shows no history block", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Ann server card" });
    expect(within(card).queryByText("Session history")).toBeNull();
  });

  it("the off-map active chip says so visibly", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Ann server card" });
    const chip = within(card).getByRole("button", {
      name: /^Table 1, assigned to Ann.*not on the floor map/,
    });
    expect(within(chip).getByText("off-map")).toBeVisible();
    expect(within(card).getByText("1 not on the floor map (1)")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The shared occupied-table dialog.
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
function Harness({
  claimBoard,
  request,
  serverConflict,
  onAssign,
  onTransfer,
  onNotice,
}: {
  claimBoard: RotationBoard;
  request: {
    label: string;
    columnId: string;
    roundId?: string;
    endPrevious?: boolean;
  };
  /** A database-reported conflict (stale client), presented on "stale". */
  serverConflict?: TableConflictInfo;
  onAssign: (input: any) => void;
  onTransfer: (input: any) => void;
  onNotice: (message: string) => void;
}) {
  const claim = useTableClaim({
    board: claimBoard,
    disabled: false,
    onAssign,
    onTransfer,
    onNotice,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!claim.intercept(request)) onAssign({ free: true });
        }}
      >
        go
      </button>
      <button
        type="button"
        onClick={() => {
          if (serverConflict)
            claim.presentServerConflict(request, serverConflict);
        }}
      >
        stale
      </button>
      {claim.dialog}
    </>
  );
}

function boardHolding(label: string): RotationBoard {
  return {
    columns,
    rounds: [
      {
        id: "r1",
        sequence: 1,
        cells: [{ columnId: "a", tableLabel: label, status: "active" }],
      },
      { id: "r2", sequence: 2, cells: [] },
    ],
    nextRoundNumber: 3,
  };
}

describe("shared occupied-table dialog (X2)", () => {
  it("Transfer moves the holder's whole assignment to the requester", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onTransfer = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T6", columnId: "b" }}
        onAssign={onAssign}
        onTransfer={onTransfer}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(
      screen.getByText(
        "T6 is currently assigned to Ann. What do you want to do?",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Transfer to Bea" }));
    expect(onTransfer).toHaveBeenCalledWith({
      sourceRoundId: "r1",
      sourceColumnId: "a",
      destColumnId: "b",
    });
    expect(onAssign).not.toHaveBeenCalled();
  });

  it("End + Assign is ONE atomic assign with confirmTransfer + endWholeAssignment", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T6", columnId: "b" }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    await user.click(
      screen.getByRole("button", {
        name: "End Ann's assignment and assign T6 to Bea",
      }),
    );
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith({
      label: "T6",
      columnId: "b",
      roundId: "r1", // Bea has no cell in round 1: her earliest empty round
      confirmTransfer: true,
      endWholeAssignment: true,
      endPrevious: false,
    });
  });

  it("Cancel does nothing", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onTransfer = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T6", columnId: "b" }}
        onAssign={onAssign}
        onTransfer={onTransfer}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAssign).not.toHaveBeenCalled();
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it("a combined holder is named as a whole in the copy and both actions", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        claimBoard={boardHolding("T6 + T7")}
        request={{ label: "T6", columnId: "b" }}
        onAssign={vi.fn()}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(
      screen.getByText(/T6 belongs to the combined assignment T6 \+ T7/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Transfer entire T6 + T7 assignment to Bea",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "End the entire T6 + T7 assignment, then assign T6 to Bea",
      }),
    ).toBeVisible();
  });

  it("a table the same server holds in a LATER turn is a message and no dialog", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    const onAssign = vi.fn();
    const later: RotationBoard = {
      columns,
      rounds: [
        { id: "r1", sequence: 1, cells: [] },
        {
          id: "r2",
          sequence: 2,
          cells: [{ columnId: "a", tableLabel: "T6", status: "active" }],
        },
      ],
      nextRoundNumber: 3,
    };
    render(
      <Harness
        claimBoard={later}
        request={{ label: "T6", columnId: "a", roundId: "r1" }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={onNotice}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onNotice).toHaveBeenCalledWith("T6 is already assigned to Ann.");
    expect(onAssign).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Transfer/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "End Previous + Assign" }),
    ).toBeNull();
  });

  it("the same server on a LATER turn: End Previous + Assign / Cancel, no Transfer", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onNotice = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T6", columnId: "a", roundId: "r2" }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={onNotice}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onNotice).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "T6 is already assigned to Ann. End Ann's previous T6 assignment and assign T6 to Ann for this turn?",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Transfer/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "End Previous + Assign" }),
    );
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith({
      label: "T6",
      columnId: "a",
      roundId: "r2",
      confirmTransfer: false,
      endWholeAssignment: false,
      endPrevious: true,
    });
  });

  it("the repeat dialog's Cancel makes no assignment", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onTransfer = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T6", columnId: "a", roundId: "r2" }}
        onAssign={onAssign}
        onTransfer={onTransfer}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAssign).not.toHaveBeenCalled();
    expect(onTransfer).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "End Previous + Assign" }),
    ).toBeNull();
  });

  it("a combined previous assignment is named as a whole in the repeat dialog", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        claimBoard={boardHolding("T6 + T7")}
        request={{ label: "T6", columnId: "a", roundId: "r2" }}
        onAssign={vi.fn()}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByText(/combined assignment T6 \+ T7/)).toBeVisible();
    expect(
      screen.getByText(
        /ends the entire T6 \+ T7 assignment \(T7 will be released too\)/,
      ),
    ).toBeVisible();
  });

  it("a database-reported same_server_repeat (stale client) opens the same dialog", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <Harness
        claimBoard={{ columns, rounds: [], nextRoundNumber: 1 }}
        request={{ label: "T6", columnId: "a", roundId: "r2" }}
        serverConflict={{
          kind: "same_server_repeat",
          label: "T6",
          holders: [{ columnId: "a", roundId: "7", assignmentLabel: "T6" }],
        }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "stale" }));
    await user.click(
      screen.getByRole("button", { name: "End Previous + Assign" }),
    );
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ endPrevious: true, roundId: "r2" }),
    );
  });

  it("a confirmed repeat that the database still holds for ANOTHER server keeps ending the previous one (no Transfer)", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{
          label: "T6 + T8",
          columnId: "a",
          roundId: "r2",
          endPrevious: true,
        }}
        serverConflict={{
          kind: "held",
          label: "T6 + T8",
          holders: [
            { columnId: "b", roundId: "9", assignmentLabel: "T6 + T8" },
          ],
        }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "stale" }));
    expect(screen.queryByRole("button", { name: /^Transfer/ })).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "End the entire T6 + T8 assignment, then assign T6 + T8 to Ann",
      }),
    );
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmTransfer: true,
        endWholeAssignment: true,
        endPrevious: true,
      }),
    );
  });

  it("a free table is not intercepted", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <Harness
        claimBoard={boardHolding("T6")}
        request={{ label: "T9", columnId: "b" }}
        onAssign={onAssign}
        onTransfer={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onAssign).toHaveBeenCalledWith({ free: true });
  });
});
