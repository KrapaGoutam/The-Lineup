# Table Rotation — Interactions

## Quick Add Staff
- Available to Staff, Assistant Manager, Manager, and Owner (not manager-only).
- Candidates grouped: "Clocked in — floor/servers" and "Clocked in — other staff" (one-tap add), then "Other members" (search + checkbox multi-select + "Add N to Rotation").
- Clocked-in is a prioritization signal only — never auto-added.
- A member already on the floor never appears in these lists again (no duplicate-add path).

## Server lifecycle
- **Add**: via Quick Add or the Grid's "Floor team changed?" banner. Appends to the end of the rotation order.
- **Remove from rotation**: clears their assignments and removes their column/card everywhere. This is NOT employee account deletion — no account/auth state is touched.
- **Pause / Resume**: paused servers stay visible everywhere (Grid column, Floor Team, Server Board) dimmed, labeled "Paused", with existing assignments frozen (no new ones, cells locked). Resume restores full interaction instantly.
- **Reorder**: ↑/↓ buttons in the Floor Team drawer, Grid column header, and Server Board card all mutate the same single ordered `servers` list — reordering anywhere updates the Grid columns, Server Board order, and Next/Upcoming indicators everywhere else.

## Assignment
- **Floor Map**: tap an available table → quick-assign sheet → tap a server name → done (2 taps total). "Advance rotation" toggle (default on) controls whether assigning rotates that server to the back of the order.
- **Transfer**: from an assigned table's detail sheet, pick a different active server.
- **Unassign**: clears the table, keeps it available; does not touch rotation order.
- **Close/Release**: same effect as Unassign in this design (no separate "closing" sub-state was added — flag if the real workflow needs one).

## Clear vs Delete (must stay visually distinct)
- **Clear cell / Clear row / Clear column / Clear board**: Eraser icon, non-destructive-styled (neutral/secondary) — removes *contents*, keeps the structure (the row/column/board still exists, just empty).
- **Delete row / Remove server (column or card)**: Trash icon, destructive-styled (red/border-destructive) — removes the *structural item* itself.
- Clear Board is visually the same eraser family as Clear Row/Column but should get a stronger confirmation (it affects every server at once) — this design does not add a confirm dialog yet; flag for implementation.

## Undo / Redo
- Global, available from the header regardless of active view.
- Covers: assign, clear cell/row/column, delete row, add row, clear board, pause/resume, remove server, reorder, quick-add, transfer, unassign — i.e. every mutation to `servers`, `tables`, or `rounds`.
- Does not cover: which view is active, dialog/drawer open state, in-progress text being typed (purely cosmetic UI state).

## + Table (Server Board)
- Opens the same visual TablePicker used by Floor/Picker.
- Selecting an available table assigns it directly to that server (no round/turn is consumed — this is a direct floor assignment, separate from the Grid's turn log).

## Rotation advancement
- "Advance rotation" (Floor Map quick-assign sheet) — when on, the assigned server moves to the back of the order after assignment, so "Next" always reflects who has waited longest.

## Auto-row rule — see below (exact spec)
Grid and Picker always try to keep ~2 empty trailing rows so nobody ever manually adds a row mid-service. See the dedicated section in `STATE_MATRIX.md`'s ROW states and the note below:

> If any cell in the **last row** or **second-to-last row** receives a value (typed, picked, or otherwise assigned), enough empty rows are appended so that ~2 empty rows exist again after the last row with any value. This applies identically whether the value came from typing in Grid, picking a table in Picker, or any other supported assignment path. Manual "+ Add Row" still exists and composes with this — it never gets removed by the automatic behavior.
