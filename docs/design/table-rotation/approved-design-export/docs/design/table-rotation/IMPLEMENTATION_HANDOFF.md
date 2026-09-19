# Table Rotation — Implementation Handoff

## A. Approved requirements
Five views (Grid, Floor, Picker, Servers, Dashboard) over one shared rotation, using existing The Lineup tokens/components. Grid is an evolution of the current `allocation-workspace.tsx`, not a replacement. See `TABLE_ROTATION_DESIGN_SPEC.md`.

## B. Shared state expectations
Three entities drive every view:
- **servers**: ordered list (id, name, status: active|paused). Order IS the rotation order — a single source of truth read by Grid columns, Server Board, Floor Team drawer, and Next/Upcoming indicators.
- **tables**: the fixed physical table set (T1–T19, B1–B8) with assignedTo (server id | null) and elapsed time. Drives Floor Map, Table Picker, Server Board's active-table chips, and Dashboard's active/available counts.
- **rounds**: the turn-by-turn log (existing `RotationBoard`/`RotationRound` shape) — Grid, Picker, and the Dashboard's read-only Master Rotation table all render this.

These map directly to the existing `rotation-board.ts` domain model (columns/rounds) plus a new lightweight `tables` concept for the Floor Map — the design does not require replacing the existing board model, only extending it.

## C. View-specific requirements
See `TABLE_ROTATION_DESIGN_SPEC.md` per view. Floor Map and Picker MUST reuse the same table-rendering component (no second, divergent floor map).

## D. Access/permission expectations
Quick Add and floor-rotation edits (add/remove/pause/resume/reorder/assign/clear) are available to Staff, Assistant Manager, Manager, and Owner alike — matching the existing app's "anyone signed in may write to any column" model (Feature 011) extended to roster management, not manager-only. This does not extend to employee account administration (that stays wherever it already lives).

## E. Auto-row rule (exact)
Maintain ~2 empty trailing rows at all times. If any cell in the last or second-to-last row receives a value, append rows until 2 empty trailing rows exist again. Applies identically to typed Grid entries and Picker-selected entries. Manual "+ Add Row" still exists and composes with this (see `INTERACTIONS.md`).

## F. Required CRUD operations
Assign / clear cell / clear row / delete row / add row / clear column / remove server (column) / pause / resume / reorder server / clear board / transfer table / unassign table / quick-add member(s) — each independently undoable.

## G. Floor layout requirements
Physical arrangement (see `reference/floor-layout-reference.png`): top booths T15–T19, two-tops T14–T9, lower booths T6–T8, left-wall booths T5–T1, bar seats B1–B8 running vertically beside the wall booths. All 19 numbered tables + 8 bar seats must be represented. Visual styling (shapes, colors) comes from the app's own tokens, not the reference photo's materials/colors.

## H. Light/Dark requirements
Use `src/app/globals.css` custom properties directly (`--background`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--ok`, `--warn`, `--destructive`, `--server-one` … `--server-seven`, etc.) via `data-theme` the same way the rest of the app already does. Do not introduce new tokens.

## I. Responsive requirements
See `RESPONSIVE.md`. Grid/Picker rely on horizontal scroll + sticky Turn column/header at all breakpoints rather than ever compressing below usable touch/read size.

## J. Design component reuse
Prefer the app's existing `Button`, `Badge`, `Card`, `Input` primitives (`src/components/ui/`) and shadcn `Sheet`/`Dialog`/`DropdownMenu`/`Popover` patterns already documented in `docs/DESIGN_SYSTEM.md` for Floor Team (Sheet), Quick Add (Dialog/Command), table assignment (Sheet), and column/row overflow menus (DropdownMenu) rather than the prototype's hand-rolled inline popovers.

## K. Things Claude Code must investigate before implementing
- How `tables` (physical floor inventory) should be modeled/persisted — this is new; the current schema only has `rotation-board.ts`'s columns/rounds, no fixed table inventory or floor-position data.
- Whether "Advance rotation" toggle default (on) and its exact semantics match any existing product decision.
- Whether Clear Board needs a real confirmation dialog (design flags it as "should be stronger" but does not specify the exact copy/pattern — use the existing `AlertDialog` convention from `docs/DESIGN_SYSTEM.md`).
- Whether "Remove from rotation" needs a confirmation step, and how it interacts with the existing Undo/Redo/RPC history model (`board_events`, Realtime).
- Icon set: the prototype uses hand-inlined Lucide-equivalent glyphs for Pause/Resume/Clear (Eraser)/Delete (Trash2)/Edit (Pencil)/Add (Plus)/reorder chevrons/Undo2/Redo2/MoreHorizontal — confirm against the installed `lucide-react` version and swap to real `<Pause/>`, `<Play/>`, `<Eraser/>`, `<Trash2/>`, `<Pencil/>`, `<Plus/>`, `<ChevronUp/>`/`<ChevronDown/>`, `<Undo2/>`, `<Redo2/>`, `<MoreHorizontal/>` components.
- True drag-and-drop reorder was intentionally left as an open question (prototype uses ↑/↓ buttons only) — decide before implementation if drag is required for tablet.

## L. Non-goals
No database schema/migrations, no RLS changes, no server actions, no persistence, no realtime sync, no auth/permission system changes, no employee-account administration. All of that belongs to a separate implementation prompt.
