import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDemoCatalog } from "../domain/demo-catalog";
import { buildInventoryRows } from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import type { RunCatalogCommand } from "./catalog-dialogs";
import type { LoadHistory } from "./history-view";
import { ItemSheet, type ItemSheetActions } from "./item-sheet";

afterEach(cleanup);

function fixture() {
  const snapshot: CatalogSnapshot = {
    ...buildDemoCatalog(),
    loadedAt: new Date().toISOString(),
  };
  const row = buildInventoryRows(snapshot, "2026-11-11")[0];
  const run: RunCatalogCommand = vi
    .fn<RunCatalogCommand>()
    .mockResolvedValue({ ok: true, snapshot });
  const loadHistory: LoadHistory = vi
    .fn<LoadHistory>()
    .mockResolvedValue({ ok: true, entries: [], truncated: false });
  const actions: ItemSheetActions = {
    saveCounts: vi.fn().mockResolvedValue({ ok: true }),
    saveLevels: vi.fn().mockResolvedValue({ ok: true }),
  };
  const props = {
    row,
    defaultReason: "stock_count" as const,
    actions,
    dates: { snapshot, run, timeZone: "America/Chicago" },
    history: { timeZone: "America/Chicago", load: loadHistory },
    onClose: vi.fn(),
  };
  return { props, run, loadHistory };
}

describe("ItemSheet tabs", () => {
  it("shows Counts, Levels, Dates, History and supports arrow/Home/End keyboard navigation", async () => {
    const user = userEvent.setup();
    const { props, loadHistory } = fixture();
    render(<ItemSheet {...props} />);

    const tabs = within(
      screen.getByRole("tablist", { name: `${props.row.name} details` }),
    ).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Counts",
      "Levels",
      "Dates",
      "History",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("On hand");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Levels" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(loadHistory).toHaveBeenCalledWith(0, props.row.productId),
    );
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Counts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens a Dates shortcut in the same sheet and reuses dateLotSave", async () => {
    const user = userEvent.setup();
    const { props, run } = fixture();
    render(<ItemSheet {...props} initialTab="dates" />);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Dates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Dated quantity");
    await user.click(screen.getByRole("button", { name: "Add Date Entry" }));
    await user.type(screen.getByLabelText("Expires"), "12/2026");
    await user.click(screen.getByRole("button", { name: "Save date entry" }));

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "dateLotSave",
          productId: props.row.productId,
          active: true,
          expectedVersion: null,
        }),
      ),
    );
  });

  it("keeps archived items' Dates controls read-only", async () => {
    const { props } = fixture();
    render(
      <ItemSheet
        {...props}
        row={{ ...props.row, status: "archived" }}
        initialTab="dates"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add Date Entry" }),
    ).toBeDisabled();
  });

  it("closes via header and footer buttons, but blocks close while saving dates", async () => {
    const user = userEvent.setup();
    let resolveRun!: (val: unknown) => void;
    const runPromise = new Promise((resolve) => {
      resolveRun = resolve;
    });
    const { props } = fixture();
    props.dates.run = vi.fn().mockImplementation(() => runPromise);
    const { unmount } = render(<ItemSheet {...props} initialTab="dates" />);

    // Footer button closes when idle
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    await user.click(closeButtons[1]);
    expect(props.onClose).toHaveBeenCalledTimes(1);

    // Header close button closes when idle
    await user.click(screen.getByLabelText("Close"));
    expect(props.onClose).toHaveBeenCalledTimes(2);

    // Now start a date save that stays pending
    await user.click(screen.getByRole("button", { name: "Add Date Entry" }));
    await user.type(screen.getByLabelText("Expires"), "12/2026");
    await user.click(screen.getByRole("button", { name: "Save date entry" }));

    // While busy, header button and footer button do NOT call onClose
    await user.click(screen.getByLabelText("Close"));
    expect(props.onClose).toHaveBeenCalledTimes(2);

    // Finish save
    resolveRun({ ok: true, snapshot: props.dates.snapshot });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Saving…" }),
      ).not.toBeInTheDocument();
    });

    unmount();
  });
});
