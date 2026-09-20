repo: KrapaGoutam/The-Lineup
branch: main
path: (whole repo; focus: src/features/allocation, src/app/globals.css, docs/DESIGN_SYSTEM.md)

## Last sync
date: 2026-09-18T22:24:12Z

### Updated in this project
- Read the live design tokens (globals.css), Button/Badge/Card/Input primitives, and the current Table Allocation rotation grid + domain model (rotation-board.ts) to ground a design-only mockup.
- Built `Table Rotation Multi-View.dc.html`: an interactive prototype of 5 rotation views (Grid, Floor Map, Grid+Picker, Server Board, Dashboard) plus Floor Team drawer and Quick Add dialog, using the app's real dark theme, Geist type, and server accent colors.
- No production code, migrations, RLS, or APIs were touched — design/prototype only, per the brief.

## Screen map
| Project screen | Repo source read |
| --- | --- |
| Rotation Grid (View 1) | src/features/allocation/components/allocation-workspace.tsx, domain/rotation-board.ts |
| Design tokens / theme | src/app/globals.css, docs/DESIGN_SYSTEM.md |
| Button/Badge/Card/Input styling | src/components/ui/*.tsx |
