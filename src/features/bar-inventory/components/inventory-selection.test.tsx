import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "../domain/demo-catalog";
import type { CatalogSnapshot } from "../domain/inventory-types";
import { InventoryView } from "./inventory-view";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  try {
    window.localStorage.clear();
  } catch {
    // storage may be unavailable; the view must render without it
  }
});
afterEach(cleanup);

function snapshot(archiveName?: string): CatalogSnapshot {
  const demo = buildDemoCatalog();
  return {
    ...demo,
    products: demo.products.map((p) =>
      archiveName && p.name === archiveName ? { ...p, active: false } : p,
    ),
    loadedAt: new Date().toISOString(),
  };
}

function view(
  snap: CatalogSnapshot,
  run = vi.fn(),
  locationId: string | null = "loc-a",
) {
  const props = {
    profileId: "profile-1",
    snapshot: snap,
    locationId,
    run,
    restaurantSlug: "webster",
    timeZone: "America/Chicago",
    loadHistory: vi.fn(),
    onOpenHistory: vi.fn(),
    runExport: vi.fn(),
  };
  return { props, ui: <InventoryView {...props} /> };
}

const selectedText = () =>
  screen
    .getAllByRole("status")
    .find((n) => /selected/.test(n.textContent ?? ""))!.textContent;

describe("Inventory individual selection + Select All together", () => {
  it("selects and deselects ONE product, and selecting never changes stock", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(view(snapshot(), run).ui);
    expect(selectedText()).toBe("0 selected");

    const box = screen.getAllByRole("checkbox", {
      name: "Select Tito's Handmade Vodka",
    })[0];
    await user.click(box);
    expect(selectedText()).toBe("1 selected");
    expect(box).toBeChecked();
    await user.click(box);
    expect(selectedText()).toBe("0 selected");
    expect(run).not.toHaveBeenCalled();
  });

  it("the header checkbox selects every visible product, is indeterminate when partial, and clears them", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const snap = snapshot();
    const eligible = snap.products.filter((p) => p.active).length;
    render(view(snap, run).ui);

    const header = screen.getByRole("checkbox", {
      name: "Select all visible products",
    }) as HTMLInputElement;
    expect(header.indeterminate).toBe(false);

    // One individual selection makes the header indeterminate (not checked).
    await user.click(
      screen.getAllByRole("checkbox", {
        name: "Select Tito's Handmade Vodka",
      })[0],
    );
    expect(header.indeterminate).toBe(true);
    expect(header.checked).toBe(false);

    // Header = select all visible (unions with the existing selection: no duplicates).
    await user.click(header);
    expect(selectedText()).toBe(`${eligible} selected`);
    expect(header.checked).toBe(true);
    expect(header.indeterminate).toBe(false);

    await user.click(header);
    expect(selectedText()).toBe("0 selected");
    expect(run).not.toHaveBeenCalled();
  });

  it("Select filtered results follows the search; Select all eligible ignores it", async () => {
    const user = userEvent.setup();
    const snap = snapshot();
    const eligible = snap.products.filter((p) => p.active).length;
    render(view(snap).ui);

    await user.type(
      screen.getByRole("searchbox", { name: "Search Inventory" }),
      "Tito",
    );
    await user.click(
      screen.getByRole("button", { name: "Select filtered results" }),
    );
    const filteredCount = Number(selectedText()!.split(" ")[0]);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(eligible);

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`Select all eligible \\(${eligible}\\)`),
      }),
    );
    expect(selectedText()).toBe(`${eligible} selected`);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(selectedText()).toBe("0 selected");
  });

  it("archived products are never selectable and never counted", async () => {
    const user = userEvent.setup();
    const snap = snapshot("House Rail Gin");
    const eligible = snap.products.filter((p) => p.active).length;
    render(view(snap).ui);

    await user.click(screen.getByRole("checkbox", { name: /show archived/i }));
    const archivedBox = screen.getAllByRole("checkbox", {
      name: "Select House Rail Gin",
    })[0];
    expect(archivedBox).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: "Select all visible products" }),
    );
    expect(selectedText()).toBe(`${eligible} selected`);
  });

  it("Bulk Edit needs a selection and only opens a review (selecting is not editing)", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(view(snapshot(), run).ui);
    const bulk = screen.getByRole("button", { name: "Bulk Edit" });
    expect(bulk).toBeDisabled();
    await user.click(
      screen.getAllByRole("checkbox", {
        name: "Select Tito's Handmade Vodka",
      })[0],
    );
    expect(bulk).toBeEnabled();
    await user.click(bulk);
    expect(run).not.toHaveBeenCalled();
  });

  it("switching branch drops the selection (no hidden cross-location selection)", async () => {
    const user = userEvent.setup();
    const snap = snapshot();
    const a = view(snap, vi.fn(), "loc-a");
    const { rerender } = render(a.ui);
    await user.click(
      screen.getByRole("checkbox", { name: "Select all visible products" }),
    );
    expect(Number(selectedText()!.split(" ")[0])).toBeGreaterThan(0);

    rerender(<InventoryView {...a.props} locationId="loc-b" />);
    expect(selectedText()).toBe("0 selected");
  });
});
