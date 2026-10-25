import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildBoardReadModel } from "@/features/allocation/domain/board-read-model";
import type { BoardActivityEntry } from "@/features/allocation/domain/board-activity";
import type { RotationBoard } from "@/features/allocation/domain/rotation-board";

import { DashboardView } from "./dashboard-view";

const board: RotationBoard = {
  columns: [{ id: "mia", name: "Mia Chen", position: 0, status: "active" }],
  rounds: [],
  nextRoundNumber: 1,
};

function renderDashboard(recentActivity: BoardActivityEntry[]) {
  const readModel = buildBoardReadModel({ board, layout: [], team: [] });
  render(
    <DashboardView
      columns={board.columns}
      board={board}
      readModel={readModel}
      recentActivity={recentActivity}
      timeZone="America/New_York"
      onOpenGrid={vi.fn()}
    />,
  );
}

describe("Dashboard recent activity (#109 U2)", () => {
  it("shows an empty state when nothing has happened", () => {
    renderDashboard([]);
    expect(screen.getByText("No recent activity yet.")).toBeVisible();
  });

  it("renders each entry as a list item with actor, copy, undone marker and wall-clock time", () => {
    renderDashboard([
      {
        id: "2",
        at: "2026-10-25T22:30:00.000Z",
        actorName: "Maya",
        summary: "transferred Table 21 + 22 from Mia to Leo",
        undone: false,
      },
      {
        id: "1",
        at: "2026-10-25T22:00:00.000Z",
        actorName: "Maya",
        summary: "ended Mia's table for turn 1",
        undone: true,
      },
    ]);
    const list = screen.getByRole("list", { name: "Recent board activity" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      "Maya transferred Table 21 + 22 from Mia to Leo · 6:30 PM",
    );
    expect(items[1]).toHaveTextContent(
      "Maya ended Mia's table for turn 1 (undone) · 6:00 PM",
    );
  });

  it("omits the time instead of failing when a timestamp is unreadable", () => {
    renderDashboard([
      {
        id: "1",
        at: "not-a-date",
        actorName: "Maya",
        summary: "cleared the board",
        undone: false,
      },
    ]);
    expect(screen.getByRole("listitem")).toHaveTextContent(
      /^Maya cleared the board$/,
    );
  });
});
