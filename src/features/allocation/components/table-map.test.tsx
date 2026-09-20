import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableMap } from "./table-map";

// Production parity fix: a genuinely unconfigured location (zero
// dining_tables rows) must show an explicit message, not a silent blank
// panel -- see TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md section 12.
// This is shared by Floor, Picker's popup, and Server Board's popup, so
// one test here covers all three callers.
describe("TableMap empty state", () => {
  it("shows an explicit message when there are zero physical tables", () => {
    render(
      <TableMap tables={[]} selectedLabel={null} onSelectTable={vi.fn()} />,
    );
    expect(
      screen.getByText("No tables are configured for this location."),
    ).toBeVisible();
    expect(screen.queryByRole("group", { name: "Floor map" })).toBeNull();
  });

  it("renders the floor map, not the empty message, once tables exist", () => {
    render(
      <TableMap
        tables={[
          { label: "T1", x: 8, y: 72, resourceType: "table", occupiedBy: null },
        ]}
        selectedLabel={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Table T1, available" }),
    ).toBeVisible();
    expect(
      screen.queryByText("No tables are configured for this location."),
    ).toBeNull();
  });
});

// Production stability hotfix: a query FAILURE must never be presented
// as "no tables are configured" -- that reads as a data/onboarding
// problem when it's actually a transient error. loadError takes
// priority over the empty-tables message even when tables is also [].
describe("TableMap load error state", () => {
  it("shows a distinct message when the tables query itself failed", () => {
    render(
      <TableMap
        tables={[]}
        loadError
        selectedLabel={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Couldn't load the floor layout. Try refreshing the page.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("No tables are configured for this location."),
    ).toBeNull();
  });

  it("prefers the load-error message over the map even if tables happen to be non-empty", () => {
    render(
      <TableMap
        tables={[
          { label: "T1", x: 8, y: 72, resourceType: "table", occupiedBy: null },
        ]}
        loadError
        selectedLabel={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Couldn't load the floor layout. Try refreshing the page.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("group", { name: "Floor map" })).toBeNull();
  });
});
