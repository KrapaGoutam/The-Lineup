import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "../domain/demo-catalog";
import { buildInventoryRows } from "../domain/inventory-rows";
import {
  vendorDraftTargets,
  type OrderDraftView,
} from "../domain/order-draft-view";
import { OrderSoon, type OrderDraftCta } from "./order-soon";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", "/"));

const state = buildDemoCatalog();
const rows = buildInventoryRows(state);

const draft = (vendorName: string): OrderDraftView => ({
  id: `draft-${vendorName}`,
  vendorId: state.vendors.find((v) => v.name === vendorName)!.id,
  vendorName,
  status: "draft",
  vendorNote: null,
  version: 1,
  updatedAt: "2026-10-27T16:00:00Z",
  updatedByName: "Mia",
  sentAt: null,
  sentByName: null,
  lines: [],
});

function renderSoon(
  drafts: OrderDraftView[],
  open: OrderDraftCta["open"] = vi.fn().mockResolvedValue(null),
  vendors = state.vendors,
) {
  const cta: OrderDraftCta = {
    targets: vendorDraftTargets(vendors, drafts),
    open,
  };
  render(
    <OrderSoon
      rows={rows}
      restaurantSlug="demo"
      timeZone="America/New_York"
      runExport={vi.fn()}
      draftCta={cta}
    />,
  );
  return { open };
}

const group = (vendor: string) =>
  screen
    .getAllByTestId("order-group")
    .find((g) => g.getAttribute("data-vendor") === vendor)!;

describe("Order soon: Create / Open Order Draft (VOD-101, AC-NAV-3/4)", () => {
  it("offers Create Order Draft for a vendor with no active draft and opens it", async () => {
    const user = userEvent.setup();
    const { open } = renderSoon([]);
    const faust = group("Faust");
    await user.click(
      within(faust).getByRole("button", { name: "Create Order Draft" }),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: state.vendors.find((v) => v.name === "Faust")!.id,
        draftId: null,
      }),
    );
    // Order soon itself stays the alert surface: no editable quantity here.
    expect(within(faust).queryByRole("textbox")).toBeNull();
  });

  it("offers Open Order Draft when the vendor already has one", () => {
    renderSoon([draft("Faust")]);
    expect(
      within(group("Faust")).getByRole("button", { name: "Open Order Draft" }),
    ).toBeInTheDocument();
    expect(
      within(group("Faust")).queryByRole("button", {
        name: "Create Order Draft",
      }),
    ).toBeNull();
    // Another vendor is unaffected.
    expect(
      within(group("Del Papa")).getByRole("button", {
        name: "Create Order Draft",
      }),
    ).toBeInTheDocument();
  });

  it("shows a refusal instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    renderSoon(
      [],
      vi.fn().mockResolvedValue("That vendor is inactive. Reactivate it."),
    );
    await user.click(
      within(group("Faust")).getByRole("button", {
        name: "Create Order Draft",
      }),
    );
    expect(await within(group("Faust")).findByRole("alert")).toHaveTextContent(
      /inactive/,
    );
  });

  it("never offers a working Create button for the Unassigned vendor", () => {
    // An item with no vendor falls under the stable system vendor.
    const system = state.vendors.find((v) => v.isSystem)!;
    const gin = state.products.find((p) => p.name === "House Rail Gin")!;
    const moved = buildInventoryRows({
      ...state,
      products: state.products.map((p) =>
        p.id === gin.id ? { ...p, vendorId: system.id } : p,
      ),
      stock: state.stock.map((s) =>
        s.productId === gin.id ? { ...s, cutoff: 6, par: 10 } : s,
      ),
    });
    const cta: OrderDraftCta = {
      targets: vendorDraftTargets(state.vendors, []),
      open: vi.fn(),
    };
    render(
      <OrderSoon
        rows={moved}
        restaurantSlug="demo"
        timeZone="America/New_York"
        runExport={vi.fn()}
        draftCta={cta}
      />,
    );
    const unassigned = group("Unassigned");
    expect(unassigned).toHaveTextContent(
      "Assign a vendor in Manage to draft an order.",
    );
    expect(
      within(unassigned).queryByRole("button", { name: /Order Draft/ }),
    ).toBeNull();
  });

  it("shows no draft button until the drafts have loaded", () => {
    render(
      <OrderSoon
        rows={rows}
        restaurantSlug="demo"
        timeZone="America/New_York"
        runExport={vi.fn()}
        draftCta={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /Order Draft/ })).toBeNull();
  });
});
