# Table Rotation — Responsive Behavior

## Desktop (~1440px+)
- Grid/Picker: full toolbar + stat cards + banner visible; server columns ~120–150px each, several visible without scrolling.
- Floor Map: full 3-column layout (wall | bar | main floor) at full scale.
- Server Board: 3–4 cards per row (auto-fill grid, min 250px).
- Dashboard: stat cards in a row; table-load + activity side by side; Master Rotation table below.

## Tablet landscape (~1024px)
- Grid/Picker: same structure, fewer columns visible per screen — horizontal scroll is expected and fine (sticky Turn column keeps orientation).
- Floor Map: scales down proportionally; touch targets (48–64px table buttons, 44px+ action buttons) held at minimum size rather than shrinking further.
- Server Board: 2–3 cards per row.
- Dashboard: stat cards wrap to 2–3 per row.

## Tablet portrait / narrow (~768px)
- Header buttons wrap; view switcher becomes horizontally scrollable (tabs don't shrink below legible size).
- Grid/Picker: horizontal scroll is the primary way to see more servers — do not compress columns below ~110px or names/inputs become unusable.
- Floor Map: wall/bar/main columns keep their proportions; the whole map scrolls if the viewport is too narrow rather than compressing tables past a usable touch size.
- Dialogs/sheets (Floor Team, Quick Add, assignment sheet, table picker) go full-width or near-full-width; the assignment sheet anchors to the bottom (thumb-reachable).
- Server Board / Dashboard stat cards: single column.

## Touch targets
- All primary actions (assign, pause/resume, add, quick-assign) are ≥44px.
- Compact icon-only actions (row/column overflow triggers, cell edit/clear) are ≥26px with an accessible label — acceptable only because they're secondary/repeated actions, never the only way to do something high-frequency.
