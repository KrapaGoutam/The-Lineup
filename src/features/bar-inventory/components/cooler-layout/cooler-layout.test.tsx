import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "../../domain/demo-catalog";
import type { CatalogSnapshot } from "../../domain/inventory-types";
import { CoolerLayoutView } from "./cooler-layout-view";

afterEach(cleanup);

function getTestSnapshot(): CatalogSnapshot {
  const demo = buildDemoCatalog();
  return {
    ...demo,
    loadedAt: new Date().toISOString(),
  };
}

describe("CoolerLayoutView", () => {
  it("renders All Storage Areas overview with area cards and unassigned storage", () => {
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true, state: snapshot });
    const onSelectProduct = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={onSelectProduct}
      />,
    );

    // Verify overview cards
    expect(
      screen.getByRole("heading", { name: "Cooler 1 (Main)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cooler 2 (Draft & Cans)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Back Bar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dry Storage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Unassigned Storage" }),
    ).toBeInTheDocument();
  });

  it("switches to a specific storage area and renders 2D shelf rack with placed items", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true, state: snapshot });
    const onSelectProduct = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={onSelectProduct}
      />,
    );

    // Click "View Rack" on Cooler 1 card
    const viewButtons = screen.getAllByRole("button", { name: /View Rack/i });
    await user.click(viewButtons[0]);

    // Cooler 1 shelves should now be visible
    expect(screen.getByText("Top Shelf - Spirits")).toBeInTheDocument();
    expect(screen.getByText("Middle Shelf - Mixers")).toBeInTheDocument();
    expect(screen.getByText("Bottom Shelf - Heavy Jugs")).toBeInTheDocument();

    // Placed products on Top Shelf
    expect(screen.getByText("Tito's Handmade Vodka")).toBeInTheDocument();
    expect(screen.getByText("Casamigos Blanco")).toBeInTheDocument();

    // Slot badges
    expect(screen.getByText("L1")).toBeInTheDocument();
    expect(screen.getByText("L2")).toBeInTheDocument();
  });

  it("calls onSelectProduct when a product card is clicked in the cooler rack", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true, state: snapshot });
    const onSelectProduct = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={onSelectProduct}
      />,
    );

    // Zoom into Cooler 1
    const viewButtons = screen.getAllByRole("button", { name: /View Rack/i });
    await user.click(viewButtons[0]);

    // Click Tito's card
    const titosBtn = screen.getByRole("button", {
      name: /Tito's Handmade Vodka/i,
    });
    await user.click(titosBtn);

    const titosProduct = snapshot.products.find(
      (p) => p.name === "Tito's Handmade Vodka",
    )!;
    expect(onSelectProduct).toHaveBeenCalledWith(titosProduct.id);
  });

  it("renders unassigned products when Unassigned Storage view is selected", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true, state: snapshot });
    const onSelectProduct = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={onSelectProduct}
      />,
    );

    // Click "Manage Unassigned" on Unassigned Storage card
    const unassignedBtn = screen.getByRole("button", {
      name: /Manage Unassigned/i,
    });
    await user.click(unassignedBtn);

    // House Rail Gin should be listed as unassigned
    expect(screen.getByText("House Rail Gin")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Place on Shelf/i }),
    ).toBeInTheDocument();
  });

  it("opens Add Storage Area dialog when Add Area button is clicked", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true, state: snapshot });
    const onSelectProduct = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={onSelectProduct}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Add Area/i }));
    expect(
      screen.getByRole("heading", { name: "New Storage Area" }),
    ).toBeInTheDocument();
  });
});
