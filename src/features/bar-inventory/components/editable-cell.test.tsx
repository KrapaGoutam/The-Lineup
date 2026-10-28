import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableCell, type CellSave } from "./editable-cell";

afterEach(cleanup);

const base = {
  label: "On hand",
  itemName: "Tito's",
  mode: "quantity" as const,
  defaultReason: "stock_count" as const,
};

describe("EditableCell", () => {
  it("saves a level silently with the version the edit started from, even if a refresh bumps it mid-edit", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<CellSave>().mockResolvedValue({ ok: true });
    const { rerender } = render(
      <EditableCell
        {...base}
        label="Cutoff"
        mode="level"
        value={4}
        expectedVersion={3}
        onSave={onSave}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Edit Cutoff for Tito's, currently 4/,
      }),
    );
    // a background refresh brings in someone else's change (version 4, value 9)
    rerender(
      <EditableCell
        {...base}
        label="Cutoff"
        mode="level"
        value={9}
        expectedVersion={4}
        onSave={onSave}
      />,
    );
    const input = screen.getByLabelText("Cutoff for Tito's");
    await user.clear(input);
    await user.type(input, "6{Enter}");
    expect(onSave).toHaveBeenCalledWith(6, null, 3);
  });

  it("quantity edits go through the reason step, with the last reason as the default", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<CellSave>().mockResolvedValue({ ok: true });
    render(
      <EditableCell
        {...base}
        defaultReason="usage"
        value={5}
        expectedVersion={1}
        onSave={onSave}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Edit On hand for Tito's, currently 5/,
      }),
    );
    const input = screen.getByLabelText("On hand for Tito's");
    await user.clear(input);
    await user.type(input, "4{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    const group = screen.getByRole("group", {
      name: "Reason for changing On hand",
    });
    expect((group.querySelector("select") as HTMLSelectElement).value).toBe(
      "usage",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(4, { reason: "usage", note: null }, 1);
  });

  it("Escape reverts, an unchanged value saves nothing, invalid input is explained", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<CellSave>().mockResolvedValue({ ok: true });
    render(
      <EditableCell {...base} value={5} expectedVersion={1} onSave={onSave} />,
    );
    await user.click(screen.getByRole("button", { name: /currently 5/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /currently 5/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /currently 5/ }));
    await user.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /currently 5/ }));
    const input = screen.getByLabelText("On hand for Tito's");
    await user.clear(input);
    await user.type(input, "1.234{Enter}");
    expect(screen.getByText(/two decimal/)).toBeTruthy();
  });

  it("a stale conflict is never applied silently: keep theirs, or apply mine over the newer version", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<CellSave>()
      .mockResolvedValueOnce({
        ok: false,
        error: "stale",
        conflict: {
          kind: "stale",
          entity: "stock",
          id: "p",
          currentVersion: 7,
          updatedBy: "Mia",
          updatedAt: null,
        },
      })
      .mockResolvedValue({ ok: true });
    render(
      <EditableCell
        {...base}
        label="Cutoff"
        mode="level"
        value={4}
        expectedVersion={3}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /currently 4/ }));
    const input = screen.getByLabelText("Cutoff for Tito's");
    await user.clear(input);
    await user.type(input, "6{Enter}");
    expect(screen.getByRole("alert").textContent).toContain("Mia changed this");
    await user.click(screen.getByRole("button", { name: /Apply mine \(6\)/ }));
    expect(onSave).toHaveBeenLastCalledWith(6, null, 7);
  });

  it("a held or double-tapped Enter in the reason step sends one write, not two", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const onSave = vi
      .fn<CellSave>()
      .mockImplementation(
        () => new Promise((resolve) => (finish = () => resolve({ ok: true }))),
      );
    render(
      <EditableCell {...base} value={5} expectedVersion={1} onSave={onSave} />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Edit On hand for Tito's, currently 5/,
      }),
    );
    const input = screen.getByLabelText("On hand for Tito's");
    await user.clear(input);
    await user.type(input, "4{Enter}");
    const select = screen
      .getByRole("group", { name: "Reason for changing On hand" })
      .querySelector("select") as HTMLSelectElement;
    select.focus();
    // Enter twice while the first request is still in flight.
    await user.keyboard("{Enter}{Enter}{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    finish();
  });
});
