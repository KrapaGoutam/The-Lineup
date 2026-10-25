import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildBoardReadModel } from "@/features/allocation/domain/board-read-model";
import type { FloorLayoutEntry } from "@/features/allocation/domain/floor-layout";
import type { RotationBoard } from "@/features/allocation/domain/rotation-board";
import type { TeamMember } from "@/lib/demo-data";

import { DashboardView } from "./dashboard-view";
import { FloorView } from "./floor-view";
import { ServerBoardView } from "./server-board-view";

// #109 U4 (109-030..035). Servers' per-server counts, the Floor legend and the
// Dashboard total all read the same BoardReadModel, so they cannot disagree --
// including for a held table that has no position on the floor map.

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
  { id: "c", name: "Cy", position: 2, status: "active" as const },
  { id: "d", name: "Dee", position: 3, status: "active" as const },
];
const team = columns.map((column, index) => ({
  id: column.id,
  name: column.name,
  shortName: column.name,
  color: ["red", "green", "blue", "gold"][index],
})) as unknown as TeamMember[];

// T1, T2, T3 are on the floor map. "99", "X7", "88", "89" are not.
const layout: FloorLayoutEntry[] = ["T1", "T2", "T3"].map((label, index) => ({
  label,
  x: 10 + index * 10,
  y: 30,
  resourceType: "table" as const,
}));

function boardOf(
  cells: { columnId: string; tableLabel: string | null; status: string }[][],
): RotationBoard {
  return {
    columns,
    rounds: cells.map((roundCells, index) => ({
      id: `r${index + 1}`,
      sequence: index + 1,
      cells: roundCells.map((cell) => ({
        ...cell,
        status: cell.status as "active" | "ended" | "skipped",
      })),
    })),
    nextRoundNumber: cells.length + 1,
  };
}

const board = boardOf([
  [
    { columnId: "a", tableLabel: "T1", status: "active" },
    { columnId: "b", tableLabel: "T2 + X7", status: "active" },
    { columnId: "c", tableLabel: "88 + 89", status: "active" },
    { columnId: "d", tableLabel: "T3", status: "ended" },
  ],
  [{ columnId: "a", tableLabel: "99", status: "active" }],
]);
const model = buildBoardReadModel({ board, layout, team });
const summary = (id: string) => model.servers.find((s) => s.columnId === id)!;

describe("read model: authoritative per-server counts", () => {
  it("109-030 counts every held table, mapped or not", () => {
    expect(summary("a").activeTableLabels).toEqual(["T1", "99"]);
    expect(summary("a").unmappedTableLabels).toEqual(["99"]);
  });

  it("109-031 one off-map claim is counted and identified", () => {
    expect(summary("a").activeTableLabels).toHaveLength(2);
    expect(summary("a").unmappedTableLabels).toEqual(["99"]);
  });

  it("109-032 multiple off-map claims are all counted", () => {
    expect(summary("c").activeTableLabels).toEqual(["88", "89"]);
    expect(summary("c").unmappedTableLabels).toEqual(["88", "89"]);
  });

  it("109-033 an ended claim is excluded and releases its table", () => {
    expect(summary("d").activeTableLabels).toEqual([]);
    expect(summary("d").unmappedTableLabels).toEqual([]);
    expect(
      model.tables.find((table) => table.label === "T3")?.occupiedBy,
    ).toBeNull();
  });

  it("109-034 combined assignment counts physical tables (each part), matching the Dashboard", () => {
    // Bea's one assignment "T2 + X7" is two physical tables, one of them off-map.
    expect(summary("b").activeAssignments).toHaveLength(1);
    expect(summary("b").activeTableLabels).toEqual(["T2", "X7"]);
    expect(summary("b").unmappedTableLabels).toEqual(["X7"]);
  });

  it("109-035 the per-server counts add up to the Dashboard's total and off-map note", () => {
    const sum = model.servers.reduce(
      (total, server) => total + server.activeTableLabels.length,
      0,
    );
    expect(sum).toBe(model.stats.occupiedTables);
    expect(sum).toBe(6);
    expect(model.stats.unmappedActiveLabels.sort()).toEqual(
      model.servers.flatMap((s) => s.unmappedTableLabels).sort(),
    );
  });

  it("109-034 a fully mapped board has no off-map labels", () => {
    const mapped = buildBoardReadModel({
      board: boardOf([
        [{ columnId: "a", tableLabel: "T1 + T2", status: "active" }],
      ]),
      layout,
      team,
    });
    expect(mapped.servers[0].activeTableLabels).toEqual(["T1", "T2"]);
    expect(mapped.servers[0].unmappedTableLabels).toEqual([]);
    expect(mapped.stats.unmappedActiveLabels).toEqual([]);
  });
});

const noop = vi.fn();

function renderServers(onEndTable = noop) {
  render(
    <ServerBoardView
      columns={columns}
      team={team}
      tables={model.tables}
      servers={model.servers}
      board={board}
      disabled={false}
      onAssign={noop}
      onMove={noop}
      onSetStatus={noop}
      onClearColumn={noop}
      onTransfer={noop}
      onEndTable={onEndTable}
      onEndAndAssign={noop}
      onUnassign={noop}
    />,
  );
}

describe("Servers card: counts include off-map claims", () => {
  it("109-031 shows 2 tables and the off-map note for Ann", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Ann server card" });
    expect(card).toHaveTextContent("2 tables");
    expect(card).toHaveTextContent("1 not on the floor map (99)");
    expect(
      within(card).getByRole("button", {
        name: "Table 99, assigned to Ann, not on the floor map -- open table actions",
      }),
    ).toBeVisible();
  });

  it("109-032 shows both of Cy's off-map tables", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Cy server card" });
    expect(card).toHaveTextContent("2 tables");
    expect(card).toHaveTextContent("2 not on the floor map (88, 89)");
  });

  it("109-033 an ended assignment shows no table and no off-map note", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Dee server card" });
    expect(card).toHaveTextContent("0 tables");
    expect(card).toHaveTextContent("No tables assigned.");
    expect(card).not.toHaveTextContent("floor map");
  });

  it("109-034 a combined assignment with one off-map part counts both parts", () => {
    renderServers();
    const card = screen.getByRole("group", { name: "Bea server card" });
    expect(card).toHaveTextContent("2 tables");
    expect(card).toHaveTextContent("1 not on the floor map (X7)");
    expect(within(card).getByText("T2 + X7")).toBeVisible();
  });

  it("an off-map table is actionable from its card (it has no map tile to tap)", async () => {
    const user = userEvent.setup();
    const onEndTable = vi.fn();
    renderServers(onEndTable);
    await user.click(
      screen.getByRole("button", { name: /^Table 99, assigned to Ann/ }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "End table",
      }),
    );
    expect(onEndTable).toHaveBeenCalledWith({ roundId: "r2", columnId: "a" });
  });
});

describe("Floor legend and Dashboard agree with Servers", () => {
  it("109-035 Floor legend shows the same per-server count (off-map included)", () => {
    render(
      <FloorView
        tables={model.tables}
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
    const legend = screen.getByRole("list", { name: "Server legend" });
    const item = (name: string) =>
      within(legend)
        .getAllByRole("listitem")
        .find((entry) => entry.textContent?.includes(name))!;
    expect(item("Ann")).toHaveTextContent("2 tables");
    expect(item("Bea")).toHaveTextContent("2 tables");
    expect(item("Cy")).toHaveTextContent("2 tables");
    expect(item("Dee")).toHaveTextContent("0 tables");
  });

  it("109-035 Dashboard 'Active tables' equals the sum of the Servers cards", () => {
    render(
      <DashboardView
        columns={columns}
        board={board}
        readModel={model}
        recentActivity={[]}
        onOpenGrid={noop}
      />,
    );
    const card = screen.getByText("Active tables").closest("div")!;
    expect(card).toHaveTextContent("6");
    expect(card).toHaveTextContent("Includes 4 not on the floor map");
  });
});
