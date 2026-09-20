# Table Rotation — Design Handoff

**Status: APPROVED** — this design is the source of truth for the Table Allocation Rotation multi-view feature.

## What this is
A design-only prototype (no production logic, no Supabase writes) covering five views over one shared rotation: Grid, Floor Map, Picker, Server Board, Dashboard. It extends the existing production Table Allocation page rather than replacing it, and uses The Lineup's real design tokens (`src/app/globals.css`) in both light and dark mode.

## Read in this order
1. `TABLE_ROTATION_DESIGN_SPEC.md` — layout and visual spec for every view
2. `COMPONENTS.md` — reusable component list, props/states
3. `INTERACTIONS.md` — exact interaction behavior, including the auto-row rule
4. `STATE_MATRIX.md` — every entity's states
5. `RESPONSIVE.md` — desktop/tablet behavior
6. `IMPLEMENTATION_HANDOFF.md` — what Claude Code needs before writing code

## Assets
- `reference/floor-layout-reference.png` — physical floor-plan reference photo (spatial layout only; colors/materials are NOT the app's design system)
- `screenshots/dark/`, `screenshots/light/` — approved states in both themes
- `prototype/table-rotation-prototype.dc.html` — the interactive design prototype. **DESIGN REFERENCE ONLY — NOT PRODUCTION IMPLEMENTATION.** Inspect for component hierarchy, spacing, and interaction intent; do not paste it into the app.

## Design-only vs implementation
Everything here is UI/UX only: no schema, no migrations, no RLS, no server actions, no persistence, no realtime. Sample data (Saima, Conan, Bhoomi, Raj, Sidhu, T1–T19, B1–B8, etc.) is illustrative — do not hardcode it into implementation.

The approved design should be treated as the visual/interaction source of truth for the Table Allocation Rotation implementation unless implementation constraints conflict with existing production architecture or security.

## Note on delivery
This package was produced in a design tool without push access to the `KrapaGoutam/The-Lineup` repository. Copy this `table-rotation/` folder into `docs/design/` in the repo (or wherever this Claude Code session has it staged) before starting implementation.
