import type { MouseEvent } from "react";

/**
 * #109 U1 (FRONT-005) -- the Picker's navigation boundary.
 *
 * In Picker view a Grid cell is a click target that opens the table map. The
 * cell also hosts the shared `TableEntry` controls (Skip turn, Add/Save,
 * Edit, Unassign, Cancel edit), and a click on any of those bubbles to the
 * cell. Those buttons own their own action; they must not also open the map.
 *
 * The cell stays the owner of navigation, so this is a single guard on the
 * parent rather than `stopPropagation()` on every child: stopping bubbling
 * in children would also hide the click from anything else that legitimately
 * listens above the cell (analytics, focus management, dialog light-dismiss).
 *
 * Only buttons and links count as inner actions. Clicking the text field in
 * an empty cell still opens the map -- that is the existing, intended way to
 * start a Picker assignment.
 *
 * Keyboard: Enter/Space on a native <button> is delivered as a click whose
 * `target` is that button, so this one rule covers pointer, touch and
 * keyboard alike.
 */
const INNER_ACTION_SELECTOR = "button, a[href], [role='button']";

export function isInnerActionClick(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const action = target.closest(INNER_ACTION_SELECTOR);
  // The cell itself is never an "inner" action, and a match outside the
  // cell (an ancestor button) is not this cell's concern.
  return (
    action !== null &&
    action !== event.currentTarget &&
    event.currentTarget.contains(action)
  );
}

/** Wrap a cell's "open the map" handler so inner actions never trigger it. */
export function openPickerUnlessInnerAction(
  open: () => void,
): (event: MouseEvent<HTMLElement>) => void {
  return (event) => {
    if (isInnerActionClick(event)) return;
    open();
  };
}
