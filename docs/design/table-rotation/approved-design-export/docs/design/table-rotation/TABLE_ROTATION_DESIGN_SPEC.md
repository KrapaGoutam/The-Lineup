# Table Rotation — Design Spec

## Shared page shell
- Header row: brand/title, "Module 2" + "Live board" badges, page title "Table allocation rotation", subcopy.
- Right side: Next-turn pill, global Undo/Redo, Floor Team button (shows live count), + Quick Add button, Light/Dark toggle.
- View switcher: 5 tabs (Grid / Floor / Picker / Servers / Dashboard), bottom-accent underline on the active tab, horizontally scrollable on narrow screens.
- All overlays (Floor Team drawer, Quick Add dialog, table assignment sheet, table picker) are shared across every view.

## Toolbar (Grid & Picker only)
Date filter (prev/next + date), + Add row, Clear board. Kept out of Floor/Servers/Dashboard to avoid clutter — those views have no "rows" concept.

## Grid (View 1)
- Foundation: the existing production Table Allocation grid, evolved, not replaced.
- Layout: sticky Turn column (left) + sticky server header row (top); server columns ~118–150px, two-line name wrap; scrolls both directions.
- 3 stat cards: Servers on floor / Next turn / Recorded events.
- "Floor team changed?" banner: one-tap add buttons for clocked-in candidates not yet on the floor.
- Cell states: empty (input + add button), editing (input + confirm/cancel), assigned (badge + edit/clear), paused-column (locked, dash).
- Column header: name, status label, reorder (↑↓), overflow menu (⋯ → Pause/Resume, Clear column, Remove column).
- Row (Turn cell): sequence number, Clear-row icon (always visible), overflow menu (⋯ → Delete row).

## Floor Map (View 2)
- Schematic (not photorealistic) floor plan preserving the reference photo's spatial layout: wall booths (T5–T1) and bar seats (B1–B8) as a left-hand vertical strip, main floor to the right holding top booths (T15–T19), two-tops (T14–T9), lower booths (T6–T8).
- Available table: label only. Assigned table: label + server name + elapsed minutes, left/bottom accent bar in the server's color.
- Tap available → quick-assign sheet. Tap assigned → detail sheet (transfer/unassign/close).

## Picker (View 3)
- Same grid as View 1, but empty cells open the Floor Map (as a modal) instead of a text field. Assigned cells show a badge + clear only (no manual edit — re-pick after clearing).
- Retains Add row / Clear board / row and column controls.

## Servers (View 4)
- One card per server, ordered by rotation position. Shows turn number, name, status, active-table chips, "+ Table" (opens the same visual picker, assigns directly), reorder (↑↓), overflow (⋯ → Pause/Resume, Clear assignments, Remove from rotation).

## Dashboard (View 5)
- 5 stat cards: Servers on floor, Active tables, Available tables, Next turn, Recorded events.
- Current table load (bar chart by server) + Recent activity feed.
- **Master Rotation**: read-only mirror of the Grid (sticky Turn column, same server order) with no inputs/buttons — observation only. "Open Grid" button routes to the editable Grid view.

## Dark / Light
Both themes pull directly from `globals.css` custom properties — no new colors. Server accent colors use the same 7-hue set (`--server-one` … `--server-seven`) already reserved for this purpose, swapped to the light-mode set defined in the same file.
