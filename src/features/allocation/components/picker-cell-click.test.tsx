import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { openPickerUnlessInnerAction } from "./picker-cell-click";

// #109 U1 (109-001..003). The harness mirrors the Picker cell's real shape:
// a click-owning cell hosting the TableEntry controls (a text field plus
// native buttons). The cell owns navigation; its buttons own their actions.
function PickerCellHarness({
  open,
  onSkip,
  onUnassign,
}: {
  open: () => void;
  onSkip: () => void;
  onUnassign: () => void;
}) {
  return (
    <div data-testid="cell" onClick={openPickerUnlessInnerAction(open)}>
      <input aria-label="Table number or combined tables" />
      <button type="button" aria-label="Skip turn" onClick={onSkip}>
        <svg data-testid="skip-icon" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Unassign table 4" onClick={onUnassign}>
        x
      </button>
      <p>Empty cell padding</p>
    </div>
  );
}

function setup() {
  const open = vi.fn();
  const onSkip = vi.fn();
  const onUnassign = vi.fn();
  render(
    <PickerCellHarness open={open} onSkip={onSkip} onUnassign={onUnassign} />,
  );
  return { open, onSkip, onUnassign, user: userEvent.setup() };
}

describe("Picker cell navigation boundary", () => {
  it("109-001 clicking the cell body opens the map", async () => {
    const { open, user } = setup();
    await user.click(screen.getByText("Empty cell padding"));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("109-001 clicking the cell's text field still opens the map (existing behavior)", async () => {
    const { open, user } = setup();
    await user.click(screen.getByLabelText("Table number or combined tables"));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("109-002 clicking an inner button runs its action and does not open the map", async () => {
    const { open, onSkip, onUnassign, user } = setup();
    await user.click(screen.getByRole("button", { name: "Skip turn" }));
    await user.click(screen.getByRole("button", { name: "Unassign table 4" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onUnassign).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("109-002 clicking an icon nested inside a button is still the button's click", async () => {
    const { open, onSkip, user } = setup();
    await user.click(screen.getByTestId("skip-icon"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("109-003 keyboard Enter and Space on an inner button behave like a click", async () => {
    const { open, onSkip, user } = setup();
    screen.getByRole("button", { name: "Skip turn" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSkip).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
  });

  it("109-003 tab order reaches every inner control in DOM order", async () => {
    const { user } = setup();
    await user.tab();
    expect(
      screen.getByLabelText("Table number or combined tables"),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Skip turn" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Unassign table 4" }),
    ).toHaveFocus();
  });
});
