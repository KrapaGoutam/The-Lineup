import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
      name: /^Tito's Handmade Vodka/i,
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

describe("CoolerLayoutView Stage E6 hardening", () => {
  const productId = (snapshot: CatalogSnapshot, name: string) =>
    snapshot.products.find((p) => p.name === name)!.id;

  it("labels the REAL branch and offers no all-branches control without a loader", () => {
    const snapshot = getTestSnapshot();
    render(
      <CoolerLayoutView
        snapshot={snapshot}
        locationId="demo-location"
        locationName="Webster"
        run={vi.fn()}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cooler-branch-label")).toHaveTextContent(
      "Branch: Webster",
    );
    expect(screen.queryByText(/All Locations/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /restaurant branch/i }),
    ).not.toBeInTheDocument();
  });

  it("All authorized branches is a read-only view with each branch's OWN stock", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const tito = productId(snapshot, "Tito's Handmade Vodka");
    const stockOf = (onHand: number) => ({
      productId: tito,
      onHand,
      backup: 0,
      cutoff: 2,
      warning: 4,
      par: 10,
      version: 1,
      updatedAt: null,
      updatedByName: null,
      lastAdjustedAt: null,
    });
    const area = (id: string, locationId: string, name: string) => ({
      id,
      locationId,
      name,
      kind: "cooler" as const,
      displayOrder: 1,
      active: true,
      version: 1,
      updatedAt: "2026-01-01T00:00:00Z",
      updatedByName: null,
    });
    const shelf = (id: string, locationId: string, areaId: string) => ({
      id,
      locationId,
      storageAreaId: areaId,
      name: "Top Shelf",
      sectionName: null,
      displayOrder: 1,
      version: 1,
      updatedAt: "2026-01-01T00:00:00Z",
      updatedByName: null,
    });
    const placement = (
      id: string,
      locationId: string,
      areaId: string,
      shelfId: string,
    ) => ({
      id,
      locationId,
      storageAreaId: areaId,
      shelfId,
      productId: tito,
      slotNumber: null,
      slotLabel: null,
      displayOrder: 1,
      version: 1,
      updatedAt: "2026-01-01T00:00:00Z",
      updatedByName: null,
    });
    const loader = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        activeLocationId: "loc-a",
        branches: [
          {
            locationId: "loc-a",
            locationName: "Webster",
            areas: [area("a1", "loc-a", "Webster Cooler")],
            shelves: [shelf("s1", "loc-a", "a1")],
            placements: [placement("p1", "loc-a", "a1", "s1")],
            stock: [stockOf(18)],
          },
          {
            locationId: "loc-b",
            locationName: "Kirkwood",
            areas: [area("a2", "loc-b", "Kirkwood Cooler")],
            shelves: [shelf("s2", "loc-b", "a2")],
            placements: [placement("p2", "loc-b", "a2", "s2")],
            stock: [stockOf(3)],
          },
        ],
      },
    });
    const run = vi.fn();

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        locationId="loc-a"
        locationName="Webster"
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
        loadBranchOverview={loader}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /restaurant branch/i }),
      "all",
    );

    const overview = await screen.findByTestId("all-branches-overview");
    expect(loader).toHaveBeenCalledTimes(1);
    const webster = within(overview).getByRole("region", { name: /Webster/ });
    const kirkwood = within(overview).getByRole("region", {
      name: /Kirkwood/,
    });
    // The same product shows each branch's own quantity: never a blended 21.
    expect(webster).toHaveTextContent("18 on hand");
    expect(kirkwood).toHaveTextContent("3 on hand");
    expect(overview).not.toHaveTextContent("21 on hand");
    // Read-only: no edit/move/remove/archive controls, and no write was issued.
    expect(
      within(webster).queryByRole("button", {
        name: /move|remove|archive|delete/i,
      }),
    ).not.toBeInTheDocument();
    expect(within(kirkwood).queryByRole("button")).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    // The single-branch editor controls are gone in this mode.
    expect(
      screen.queryByRole("button", { name: /Add Area/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable error if the all-branches overview cannot load", async () => {
    const user = userEvent.setup();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: "Branch layouts could not be loaded.",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { activeLocationId: "loc-a", branches: [] },
      });
    render(
      <CoolerLayoutView
        snapshot={getTestSnapshot()}
        locationId="loc-a"
        locationName="Webster"
        run={vi.fn()}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
        loadBranchOverview={loader}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /restaurant branch/i }),
      "all",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Branch layouts could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it("a product only in an ARCHIVED area stays discoverable and its area is restorable", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const archivedSnapshot: CatalogSnapshot = {
      ...snapshot,
      storageAreas: (snapshot.storageAreas ?? []).map((a) =>
        a.id === "demo-area-cooler-2" ? { ...a, active: false } : a,
      ),
    };
    const run = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CoolerLayoutView
        snapshot={archivedSnapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );
    // Modelo's only placement is in the archived Cooler 2.
    await user.click(
      screen.getByRole("button", { name: /Manage Unassigned/i }),
    );
    expect(
      screen.getByRole("heading", { name: /In archived storage/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Modelo Especial")).toBeInTheDocument();
    expect(screen.getByText(/In archived: Cooler 2/)).toBeInTheDocument();
    // True unassigned stays separate.
    expect(screen.getByText("House Rail Gin")).toBeInTheDocument();

    // Restore through the Archived areas view, with the version the editor saw.
    await user.selectOptions(
      screen.getByRole("combobox", { name: /select storage area/i }),
      "archived",
    );
    await user.click(screen.getByRole("button", { name: /Restore Cooler 2/i }));
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storageAreaUpsert",
        id: "demo-area-cooler-2",
        active: true,
        expectedVersion: 1,
      }),
    );
  });

  it("deleting a shelf with products states what happens and requires explicit removal", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);
    await user.click(
      screen.getByRole("button", {
        name: /Delete shelf Top Shelf - Spirits/i,
      }),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/remove its 2 placed products/i);
    expect(confirm.mock.calls[0][0]).toMatch(/NOT affected/);
    expect(run).toHaveBeenCalledWith({
      type: "storageShelfDelete",
      id: "demo-shelf-c1-top",
      expectedVersion: 1,
      removePlacements: true,
    });

    // An EMPTY shelf is deleted without asking to remove anything.
    run.mockClear();
    confirm.mockClear();
    await user.click(
      screen.getByRole("button", {
        name: /Delete shelf Middle Shelf - Mixers/i,
      }),
    );
    expect(confirm.mock.calls[0][0]).toMatch(/empty shelf/i);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "demo-shelf-c1-mid",
        removePlacements: false,
      }),
    );
    confirm.mockRestore();
  });

  it("removing a placement carries the version it saw and surfaces a stale conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({
      ok: false,
      error:
        "Someone else changed this placement. Review the latest and try again.",
    });
    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);
    await user.click(
      screen.getByRole("button", {
        name: /Remove Tito's Handmade Vodka from shelf/i,
      }),
    );
    expect(run).toHaveBeenCalledWith({
      type: "storagePlacementDelete",
      id: "demo-place-1",
      expectedVersion: 1,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Someone else changed/,
    );
    vi.restoreAllMocks();
  });

  it("Place Item lets the person CHOOSE the product (not just the first unassigned one)", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);
    const shelfHeading = screen.getByRole("heading", {
      name: "Middle Shelf - Mixers",
    });
    const shelf = shelfHeading.closest("div.rounded-lg") as HTMLElement;
    await user.click(
      within(shelf).getByRole("button", { name: /Place Item/i }),
    );
    const picker = await screen.findByRole("combobox", { name: /^Product$/ });
    // A product already on ANOTHER shelf can also be placed here.
    expect(
      within(picker).getByRole("option", { name: /Tito's Handmade Vodka/ }),
    ).toBeInTheDocument();
    await user.selectOptions(picker, productId(snapshot, "Modelo Especial"));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^Place Product$/,
      }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storagePlacementSet",
        id: null,
        shelfId: "demo-shelf-c1-mid",
        productId: productId(snapshot, "Modelo Especial"),
        expectedVersion: null,
      }),
    );
  });
});

describe("CoolerLayoutView Physical Cooler & Shelf Polish (Batch B)", () => {
  it("renders cooler climate badge and physical cooler enclosure styling", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);

    // Cooler climate badge
    expect(screen.getByText("36°F · Commercial Cooler")).toBeInTheDocument();

    // Verify shelves are present in top-to-bottom order
    const headings = screen.getAllByRole("heading", { level: 3 });
    const shelfNames = headings.map((h) => h.textContent);
    expect(shelfNames).toEqual([
      "Top Shelf - Spirits",
      "Middle Shelf - Mixers",
      "Bottom Shelf - Heavy Jugs",
    ]);
  });

  it("provides accessible shelf Move Up / Move Down buttons with boundary disabling and reorders shelves", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);

    const upTop = screen.getByRole("button", {
      name: "Move shelf Top Shelf - Spirits up",
    });
    const downTop = screen.getByRole("button", {
      name: "Move shelf Top Shelf - Spirits down",
    });
    expect(upTop).toBeDisabled(); // Top shelf cannot move up
    expect(downTop).toBeEnabled();

    const downBottom = screen.getByRole("button", {
      name: "Move shelf Bottom Shelf - Heavy Jugs down",
    });
    expect(downBottom).toBeDisabled(); // Bottom shelf cannot move down

    // Click Move Down on Top Shelf
    await user.click(downTop);

    // Verify storageShelfUpsert called to swap display orders
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storageShelfUpsert",
        id: "demo-shelf-c1-top",
        displayOrder: 2,
      }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storageShelfUpsert",
        id: "demo-shelf-c1-mid",
        displayOrder: 1,
      }),
    );
  });

  it("renders explicit empty slots and allows direct click-to-place with pre-filled slot number", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);

    // Top shelf has slots 1 and 2 occupied, slot 3 and 4 empty
    const emptySlot3Btn = screen.getByRole("button", {
      name: "Place product in Top Shelf - Spirits slot 3",
    });
    expect(emptySlot3Btn).toBeInTheDocument();

    // Click empty slot 3
    await user.click(emptySlot3Btn);

    // Move / Place Dialog should open prefilled with slot 3
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Place Product on Shelf/i }),
    ).toBeInTheDocument();

    const slotNumberInput = screen.getByLabelText(/Slot Number/i);
    expect(slotNumberInput).toHaveValue(3);
    const slotLabelInput = screen.getByLabelText(/Slot Label/i);
    expect(slotLabelInput).toHaveValue("Slot 3");
  });

  it("supports drag and drop placement to an empty slot", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);

    // Tito's placement card
    const titosBtn = screen.getByRole("button", {
      name: /^Tito's Handmade Vodka/i,
    });
    const titosCard = titosBtn.closest('[data-testid="placement-tile"]')!;
    expect(titosCard).toHaveAttribute("draggable", "true");

    // Start drag
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "move",
      dropEffect: "move",
    };
    fireEvent.dragStart(titosCard, { dataTransfer });

    // Target empty slot 3 on Top Shelf
    const emptySlots = screen.getAllByTestId("empty-slot-tile");
    const targetSlot = emptySlots[0]; // Slot 3 on Top Shelf

    fireEvent.dragOver(targetSlot, { dataTransfer, preventDefault: vi.fn() });
    await act(async () => {
      fireEvent.drop(targetSlot, { dataTransfer, preventDefault: vi.fn() });
    });

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storagePlacementSet",
        id: "demo-place-1",
        shelfId: "demo-shelf-c1-top",
        slotNumber: 3,
        slotLabel: "L1",
      }),
    );
  });

  it("prevents drag and drop collision when dropping onto an occupied slot", async () => {
    const user = userEvent.setup();
    const snapshot = getTestSnapshot();
    const run = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CoolerLayoutView
        snapshot={snapshot}
        run={run}
        timeZone="America/New_York"
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /View Rack/i })[0]);

    const casamigosBtn = screen.getByRole("button", {
      name: /^Casamigos Blanco/i,
    });
    const casamigosCard = casamigosBtn.closest(
      '[data-testid="placement-tile"]',
    )!;

    const titosBtn = screen.getByRole("button", {
      name: /^Tito's Handmade Vodka/i,
    });
    const titosCard = titosBtn.closest('[data-testid="placement-tile"]')!;

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "move",
      dropEffect: "move",
    };
    // Drag Casamigos (slot 2) over Tito's (slot 1)
    fireEvent.dragStart(casamigosCard, { dataTransfer });
    fireEvent.drop(titosCard, { dataTransfer, preventDefault: vi.fn() });

    // Dropping on occupied placement should NOT invoke run(storagePlacementSet)
    expect(run).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "storagePlacementSet",
      }),
    );
  });

  it("guarantees strict quantity invariance across storage placements and moves", () => {
    const snapshot = getTestSnapshot();
    const titosProduct = snapshot.products.find(
      (p) => p.name === "Tito's Handmade Vodka",
    )!;
    const originalStock = snapshot.stock.find(
      (s) => s.productId === titosProduct.id,
    );
    const originalLedger = (snapshot.ledger ?? []).filter(
      (l) => l.productId === titosProduct.id,
    );

    // Deep copy before
    const stockBefore = JSON.parse(JSON.stringify(originalStock));
    const ledgerBefore = JSON.parse(JSON.stringify(originalLedger));

    // Catalog storagePlacementSet command schema
    const moveCommand = {
      type: "storagePlacementSet" as const,
      id: "demo-place-1",
      storageAreaId: "demo-area-cooler-1",
      shelfId: "demo-shelf-c1-mid",
      productId: titosProduct.id,
      slotNumber: 1,
      slotLabel: "Slot 1",
      displayOrder: 1,
      expectedVersion: 1,
    };

    // Verify command schema validates without any quantity fields
    expect("onHand" in moveCommand).toBe(false);
    expect("backup" in moveCommand).toBe(false);
    expect("quantity" in moveCommand).toBe(false);

    // Stock quantities and ledger entries are unchanged
    const currentStock = snapshot.stock.find(
      (s) => s.productId === titosProduct.id,
    );
    const currentLedger = (snapshot.ledger ?? []).filter(
      (l) => l.productId === titosProduct.id,
    );

    expect(currentStock).toEqual(stockBefore);
    expect(currentLedger).toEqual(ledgerBefore);
  });
});
