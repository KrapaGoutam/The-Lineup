# Table Rotation Multi-View — Interactions (production-grounded)

This reconciles `docs/design/table-rotation/approved-design-export/docs/design/table-rotation/INTERACTIONS.md`
(design-only, doesn't know this repo's real RLS/RPC layer) with the actual
production architecture. Where they conflict, this document and
`IMPLEMENTATION_CONTRACT.md` win.

## Quick Add
- Available to Staff, Assistant Manager, Manager, Owner (all `AppRole`
  values) — matches the approved permission expansion (`PERMISSIONS.md`).
- Clocked-in members sourced via the existing `fetchClockedInRoster`
  pattern (Tips feature) — see contract section 12. Clocked-in is a
  prioritization/grouping signal only, never auto-added.
- A member already on the floor never appears again (no duplicate-add).

## Server lifecycle
- **Add**: Quick Add or Grid's "Floor team changed?" banner →
  `board_add_column`. Appends to the end of `position` order.
- **Remove from rotation**: `board_set_column_status(status: "removed")`
  → clears their column everywhere. Not employee-account deletion — no
  auth/account state touched.
- **Pause / Resume**: `board_set_column_status`. Paused servers stay
  visible everywhere, dimmed, labeled "Paused"; assignments frozen (no new
  ones; cells locked).
- **Reorder**: ↑/↓ in Floor Team drawer, Grid column header, Server Board
  card — all call `board_move_column`, mutating the one global `position`
  order used everywhere.

## Assignment
- **Floor Map**: tap available table → quick-assign sheet → pick server →
  `board_assign` (2 taps). "Advance rotation" toggle — see contract
  section 14 for the exact default-value caveat.
- **Picker**: same `board_assign` call as typing in Grid — identical
  behavior (occupancy, auto-row, undo) regardless of entry path.
- **Server Board `+ Table`**: opens the shared `<TableMap mode="server-picker">`;
  selecting assigns directly via `board_assign` — same RPC, not a separate
  "direct floor assignment" mechanism.
- **Transfer**: from an occupied table's detail sheet, `board_assign` again
  with `p_confirm_transfer: true` (contract section 6) — releases the
  prior holder's `table_occupancy` claim and reassigns, atomically.
- **Unassign**: `board_clear_cell` on that entry — clears the table,
  releases its `table_occupancy` claim, keeps rotation order untouched.
- **Close/Release**: same effect as Unassign (no separate sub-state).

## Clear vs Delete (must stay visually distinct)
- **Clear cell/row/column/board**: `Eraser` icon (row/board) or
  `RotateCcw` (column, per existing convention — see contract section 21
  icon table), non-destructive styling — removes contents, keeps
  structure.
- **Delete row**: `Trash2`, destructive styling — removes the round row
  itself. Only enabled when the round has zero entries (clear first, then
  delete, to preserve history for anything ever assigned).
- **Remove server**: `Trash2`, destructive styling — removes the column,
  not the employee account.
- Clear Board affects the whole session at once — Codex should add a
  confirmation dialog (the design export explicitly flags this as
  missing).

## Undo / Redo
- Global, header-level, available regardless of active view.
- Server-authoritative (event replay against `board_events`), not a client
  snapshot stack — see contract section 1/19.
- Covers every mutation this feature adds (occupancy claim/release,
  delete_row) in addition to the existing set (assign, clear cell/row/
  column/board, add row, pause/resume, remove server, reorder, quick-add,
  transfer, unassign).
- Does not cover: active view, dialog/drawer open state, in-progress text
  input.

## Auto-row rule
See `IMPLEMENTATION_CONTRACT.md` section 9 for the single, reconciled
exact rule (replaces the design doc's description and the current
single-trailing-round `ensure_trailing_round` behavior — implement the
contract's version, not either of those two).

## Combined tables
Existing production syntax `"12 + 13"` (confirmed in
`docs/features/003-table-allocation.md`) — new views parse this against
the `dining_tables` registry rather than inventing new syntax. See
contract section 7.
