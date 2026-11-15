import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Dialog } from "./dialog";

it("restores the trigger when a conditionally rendered open dialog unmounts", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const view = render(
    <Dialog open onClose={() => {}} title="Recovery">
      <input aria-label="Reason" />
    </Dialog>,
  );
  screen.getByLabelText("Reason").focus();
  view.unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});
