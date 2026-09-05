# Feature 010 — Reorder servers in the rotation

Status: discovery

**Implementation note**: same division-of-labor change as Feature 005 — Claude implements this batch directly, Codex is not in this loop. See 005 for the full note.

**Build note**: implemented together with Feature 009 in one session (both touch `rotation-board.ts` and its undo/redo logic), committed separately.

## User outcome

A manager can move a server earlier or later in the rotation order after the board is already live — without losing anything already recorded.

## What reordering does to rounds already assigned — stated precisely, not deferred

The board's data model does not store a frozen per-round order: each `RotationRound` holds `cells: RotationCell[]` keyed by `columnId`, and turn order is always _derived fresh_ from `column.position` at render/compute time (`visibleColumns.sort((a,b) => a.position - b.position)`, and `nextColumn` walks that same sorted order looking for the first active column with no filled cell in the _current_ round). Reordering changes exactly one thing: the `position` value on the two swapped columns. It changes nothing else.

Concretely:

- **Already-recorded cells are untouched.** A round where Leo already has "Table 8" recorded keeps that cell exactly as-is, regardless of where Leo's column later moves — the cell is keyed by `columnId`, not by position.
- **The visual left-to-right column order changes immediately**, for every round, past and present — the board doesn't keep a historical "as it looked then" snapshot of column order; it's a live layout, not a ledger of layouts.
- **"Who's next" is recomputed immediately against the new order**, including for the _current, still-in-progress_ round. Example: round 4 has Mia and Leo filled, Ava and Noah not, in position order Mia→Leo→Ava→Noah. Today's "next" is Ava. If the manager reorders Noah to sit between Leo and Ava (new order Mia→Leo→Noah→Ava), "next" becomes Noah — reordering is precisely the tool for correcting whose turn is next, and it takes effect immediately, not "starting next round." This is the intended mechanic, not a side effect to work around.
- **A completed round stays completed** — reordering never un-fills a cell, so it can't turn a finished round into an incomplete one or retroactively spawn/remove a trailing round.

## Scope

**In**

- New pure `BoardAction`: `{ type: "move-column"; columnId: string; direction: "up" | "down" }`, swapping `position` with the adjacent _visible_ (non-removed) column in that direction. No-op (returns the same state, per the existing `applyBoardAction` convention) at either boundary.
- Manager-only up/down controls per column header, sized for touch (44×44 CSS px minimum), disabled at the boundaries. Native `<button>` elements — keyboard-operable without any new library, consistent with `docs/TECH_STACK.md`'s "no generic drag/drop dependency" stance.
- Works with undo/redo through the existing `executeBoardAction`/`undoBoard`/`redoBoard` machinery — a move is just another action on the same history stack, no special-casing needed.
- Present in both the current (grid) allocation layout and Feature 007's not-yet-built narrow-screen chip strip once that lands — cross-referenced there so the control has a designed home in both layouts before either is built against the other.

**Out**

- Drag-and-drop reordering — out per `AGENTS.md`/`TECH_STACK.md`'s existing dependency discipline; up/down step controls satisfy the touch requirement without one.
- Reordering across a "removed" column — removed columns aren't part of the visible order and aren't targets for this action.
- Any change to fairness/workload weighting logic (`recommend-next-server.ts`'s retained engine is unaffected — it's a separate, unused-by-the-demo-board module).

## Acceptance criteria

- [ ] Moving a column up or down swaps its position with the adjacent visible column; columns beyond it are unaffected.
- [ ] Moving the first column up, or the last column down, is a no-op — no board mutation, no history entry.
- [ ] All previously recorded cell data is byte-for-byte unchanged after a reorder — only `columns[].position` differs.
- [ ] "Next up" is recomputed against the new order immediately, including mid-round.
- [ ] The move is undoable/redoable like any other board action.
- [ ] The up/down controls meet the 44×44 CSS px touch-target minimum and are keyboard-operable (native buttons, no pointer-only interaction).
- [ ] Servers cannot reorder columns — manager/owner only, matching the existing pause/remove/clear capability gating.

## UX contract

- Entry point: a small up/down chevron pair next to each column header, visible only to managers/owners, alongside the existing pause/clear/remove controls.
- Desktop/tablet: inline in the grid column header, unchanged layout otherwise.
- Server mobile (post-Feature 007): inline in the chip strip's per-server chip or its "Manage [selected server]" affordance — specified here so 007's build has a defined slot, not left to be improvised later.
- Loading/Empty/Error: n/a — synchronous, always succeeds or no-ops.
- Success: no confirmation needed (non-destructive, reversible via undo); the visual reorder itself is the feedback.
- Keyboard/screen reader: native buttons with `aria-label` naming the direction and the server ("Move Mia up"), disabled state exposed natively via the `disabled` attribute at boundaries.

## Data and authorization

None — demo-mode-only, no schema, RLS, or migration. (Real-mode note: whenever this reaches a real backend, `rotation_members.position` is already the persisted column for this — reordering would be an update to that column, unique-per-session, already indexed; no new table needed then either.)

## Implementation map

- `src/features/allocation/domain/rotation-board.ts`: new `"move-column"` case in `applyBoardAction`.
- `src/features/allocation/components/allocation-workspace.tsx`: up/down icon buttons per column header, manager-gated.
- Cross-reference note added to `docs/features/007-mobile-tablet-responsive.md`'s chip-strip section for where this control lives on narrow screens.

## Test plan

- Unit: `rotation-board.test.ts` — swap with adjacent column; no-op at each boundary; cell data unchanged after a move; "next up" recomputes correctly mid-round after a move (the exact example above); undo restores prior order, redo reapplies it.
- Component/Playwright: manager sees and can use the up/down controls; a server does not see them; touch-target size assertion (reusing the pattern from Feature 007's planned viewport tests).

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (demo-mode only).

## Decisions and risks

- **Decision**: reordering is immediate and affects the current round's "next" computation, not deferred to "next round only" — stated explicitly per the request, since a silent deferral would be a surprising, undocumented behavior.
- **Decision**: up/down step controls, not drag-and-drop, per existing dependency discipline and to guarantee keyboard/touch parity for free.
- Open questions: none remaining.
