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

- **Floor Map** (multi-table follow-up, see
  `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 8): tap an
  available table → a popup opens ("Assign `<table>`" / "Available.
  Select a server…" / one button per active server / Cancel — floor
  ownership visual follow-up, section 11.1; previously an always-visible
  "pick a server" section rendered inside the same side panel occupied
  tables use). Choosing a server closes that popup and picks a server. A
  server may hold zero, one, or many active tables — nothing limits
  this. If the chosen server has **zero** active tables, `board_assign`
  fires immediately, into that server's own earliest genuinely empty
  round (`findEarliestEmptyRoundForColumn`), not a single round shared
  across every server (that shared pointer was the entire cause of the
  original "assigning a second table auto-transfers the first" bug). If
  the server already has **one or more**, a decision dialog opens on top
  and asks: **Assign Also** (a plain `board_assign` at their own
  earliest empty round — additive, touches nothing else), **Transfer an
  existing table** (see below — same server, relabels one existing row
  in place), **End an existing table & assign** (`board_end_and_assign`,
  see below), or **Cancel** (zero state changes). With more than one
  existing table, Transfer and End each ask which one first — never an
  assumed oldest/newest/first/last.
- **Picker**: same `board_assign` call as typing in Grid — identical
  behavior (occupancy, auto-row, undo) regardless of entry path. Its
  target cell is always an explicit, already-selected empty cell, so
  Picker never needs Floor's decision dialog — assigning a table to a
  server who already has one elsewhere is always unambiguous (an
  additional active row). Selecting an eligible cell opens the shared
  `TableMap` as a popup (`components/ui/dialog.tsx`) immediately — no
  inline "Table picker" section and no intermediate "Choose table"
  click (Picker/Server follow-up, see
  `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 10.1). Skip Turn
  lives inside that same popup, alongside the table layout, rather than
  as a separate always-visible button.
- **Server Board `+ Table`**: opens the shared `<TableMap mode="server-picker">`
  as a popup, already scoped to the card's own server — no "choose a
  server" step, unlike Floor. Selecting an available table runs through
  the same `useTableAssignmentDecision` hook Floor uses (section 10.2):
  zero active tables for that server assigns immediately via
  `board_assign` at their own earliest empty round; one or more opens
  the identical Assign Also / Transfer / End existing table(s) & Assign
  / Cancel dialog Floor shows. Each already-assigned table on the card
  is itself a button; tapping one opens a small dialog scoped to that
  one table only (Transfer via `board_transfer`, End via
  `board_end_table`, or Unassign via `board_clear_cell`) — a server
  holding several tables and tapping one never touches the others.
- **Transfer** — two distinct entry points, two distinct mechanisms:
  - From an occupied table's detail sheet on Floor (cross-**server**,
    unchanged since Upgrade 1.1): `board_transfer` moves the _same_
    assignment to a _different_ server's earliest genuinely empty
    round — the source cell is deleted outright (no stale label left
    behind), the destination gets a fresh active row with the same
    table label. This replaced an earlier implementation that called
    `board_assign` again with `p_confirm_transfer: true` into the
    _same_ round, which left the source cell's old text in place — a
    real bug, not intended transfer semantics; see
    `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 3.
    `p_confirm_transfer` still exists on `board_assign` itself, for the
    unrelated case of forcing a fresh assignment through a stale
    occupancy conflict — that is not Transfer.
  - From Floor's decision dialog for an already-busy server
    (multi-table follow-up, **same server**): "Transfer an existing
    table" relabels the chosen existing active row _in place_, via
    plain `board_assign` targeting that row's own round — the table
    changes, the round/entry doesn't. This is a completely different
    RPC call from the cross-server case above (no `board_transfer`
    involved at all); see
    `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 8.3.
- **End Table** (Upgrade 1.1): from an occupied table's detail sheet on
  Floor, `board_end_table` marks the entry `ended` in place (never
  deleted — history stays) and releases the physical table.
- **End existing table(s) & Assign** (multi-table follow-up, expanded to
  a multi-select): from Floor's decision dialog, `board_end_and_assign`
  ends **one, several, or every one** of the server's active rows
  (history preserved, each as its own distinct entry) and creates one
  brand new active row for the same server, in one transaction —
  different from Transfer above, which keeps one continuous row/turn
  rather than recording separate historical entries. With more than one
  active table, a checkbox multi-select ("Select all"/"Clear all", a
  running "N of M selected" count, primary action disabled until at
  least one is checked) lets the operator choose exactly which ones;
  with exactly one, it acts immediately with no sub-step.
- **Transfer/End are Floor-only** (follow-up UI refinement, see
  `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 7): Grid and
  Picker intentionally do not render Transfer or End controls — both
  keep only Assign/Edit, Unassign, and Skip Turn, to stay simple. This is
  a UI-only choice: `board_transfer`/`board_end_table` and their
  domain-layer equivalents are fully implemented and tested regardless of
  which view calls them. Servers/Dashboard inherit the resulting
  availability change automatically via `resolveFloorTables`, but have no
  direct Transfer/End action of their own.
- **Unassign**: `board_clear_cell` on that entry — a hard delete, for any
  status (active, ended, or skipped), releasing occupancy where relevant.
  It is a correction: an unassigned entry is gone, never converted into a
  Skip.
- **Close/Release**: same effect as Unassign (no separate sub-state).
- **Skip Turn** (Upgrade 1.1): on an empty Grid cell or Picker's selected
  target, `board_skip_turn` records the turn as skipped (rendered `0`,
  never the literal editable label `"0"`) — occupies no physical table,
  but counts as a used cell for the auto-row rule exactly like any other
  real entry.

## Floor ownership visuals (fifth follow-up)

See `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 11 for the
full spec.

- **Assigned tile**: shows the table label plus the current server's
  initials (`getInitials`, derived from their existing display name —
  never a separate manual field), on that server's own accent color —
  color is supporting information, never the sole identifier. Rendered
  once in the shared `TableMap`, so Floor, Picker's popup, and Server
  Board's popup all show it for free.
- **Available tile**: label only, neutral styling — no initials or color
  ever survive from a table's previous owner.
- **Selected (tapped) tile**: a separate, temporary ring state layered
  on top of whichever ownership color, if any, already applies — never
  confusable with ownership itself.
- **End / Unassign**: both simply remove that table's active
  `table_rotation_entries` row exactly as they already did (see above);
  the tile's initials/accent disappear as a direct consequence of the
  next `resolveFloorTables` read no longer attributing the table to
  anyone, not through any separate "clear the ownership label" step.
- **Transfer**: the destination server's initials/accent appear and the
  source's disappear in the same render, for the same reason — one
  fresh occupancy read, not two independent updates that could
  momentarily disagree.
- **Server legend**: a compact row above the Floor map, one entry per
  currently active-on-floor server (including servers with zero active
  tables right now — the legend represents "the floor team," matching
  every other Floor Team list in this feature), each showing the same
  initials/accent plus a live active-table count. The count is a fresh
  filter over the same shared table data every render, so Ended/
  Unassigned rows never count and a Transfer's count moves from the old
  server to the new one automatically — there is no separate running
  tally to keep in sync.

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
  unassign) — and, as of Upgrade 1.1, `transfer`, `end`, and `skip` too,
  via matching `board_undo`/`board_redo` case branches. The multi-table
  follow-up added one more, `end_and_assign` (its own composite RPC —
  see `DATA_MODEL.md`); Floor's "Assign Also" and same-server "Transfer"
  are both plain `board_assign` calls underneath, so they're already
  covered by the existing `assign` branch, not new event types.
- Does not cover: active view, dialog/drawer open state (including the
  Floor decision dialog and the Picker popup), in-progress text input.

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
