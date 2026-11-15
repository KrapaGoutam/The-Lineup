import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "../domain/demo-catalog";
import type { CatalogSnapshot } from "../domain/inventory-types";
import { ManageView } from "./manage-view";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", "/"));

const state = buildDemoCatalog();

function renderManage(canManageCatalog: boolean | undefined) {
  const snapshot: CatalogSnapshot = {
    ...state,
    loadedAt: "2026-11-13T12:00:00Z",
    ...(canManageCatalog === undefined ? {} : { canManageCatalog }),
  };
  render(
    <ManageView
      snapshot={snapshot}
      run={vi.fn()}
      restaurantSlug="demo"
      timeZone="America/New_York"
      imports={
        {
          loadBatches: async () => ({ ok: true, batches: [] }),
        } as never
      }
      onImported={vi.fn()}
    />,
  );
}

// E-1 / D-10: vendors, categories, subcategories and products are shared by every location of
// the organization. The database decision (catalog_authorized) rides on the snapshot; the
// screen must never offer a command the database will refuse. Reads stay available.
describe("Manage view: shared-catalog authority (E-1)", () => {
  it("offers add and row actions when the database allows catalog changes", () => {
    renderManage(true);
    expect(
      screen.getByRole("button", { name: "Add product" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Edit / }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/shared by every location/i),
    ).not.toBeInTheDocument();
  });

  it("keeps demo and test data (no decision) editable", () => {
    renderManage(undefined);
    expect(
      screen.getByRole("button", { name: "Add product" }),
    ).toBeInTheDocument();
  });

  it("is read-only, and says why, when the database refuses catalog changes", () => {
    renderManage(false);
    expect(
      screen.queryByRole("button", { name: "Add product" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(Archive|Reactivate) / }),
    ).not.toBeInTheDocument();
    const notice = screen.getByText(/shared by every location/i);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(/manage stock at your own location/i);
    // The shared rows are still shown (reads are unchanged).
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });
});

describe("Manage view: import tab (E-1, review P3)", () => {
  it("warns before a preview that catalog-changing rows will be refused, without blocking the tab", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderManage(false);
    await userEvent.click(screen.getByRole("tab", { name: "Import" }));
    expect(
      screen.getByText(/needs an organization manager/i),
    ).toBeInTheDocument();
  });

  it("shows no warning to someone who may change the catalog", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderManage(true);
    await userEvent.click(screen.getByRole("tab", { name: "Import" }));
    expect(
      screen.queryByText(/needs an organization manager/i),
    ).not.toBeInTheDocument();
  });
});
