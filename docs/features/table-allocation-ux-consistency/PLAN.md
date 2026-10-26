# Table Allocation UX Consistency Follow-up (#109)

Follow-up to Table Rotation V2 Part 1 (merged, PR #131) and the #134 Realtime fix
(merged, PR #147). Part 1 architecture is NOT reopened. Five residual items remain;
everything else in the original #109 text was satisfied by Part 1
(see `../table-rotation-multi-view/PART1_TEST_MATRIX.md`).

- Branch: `fix/table-allocation-ux-consistency` (from `development` @ `e2bbd4e`)
- Flow: branch -> targeted validation -> PR -> `development` -> CI -> merge commit
- No migration. No DB change. DEV only if a hosted check is needed. Never PROD / `main`.
- PR #135 stays parked and untouched.

## Items

| ID  | Finding         | Item                                                               |
| --- | --------------- | ------------------------------------------------------------------ |
| U1  | FRONT-005       | Picker: inner cell buttons must not also open the map              |
| U2  | FRONT-008       | Recent activity rendered from the complete supported event model   |
| U3  | (copy)          | Explain whole-assignment behavior for combined tables where chosen |
| U4  | FRONT-007 resid | Servers-card counts include authoritative off-map claims           |
| U5  | DOC-001         | Stale current comments / status text                               |

Non-goals: partial release of a combined assignment, any schema change, Realtime changes,
Tasks changes, navigation changes.

## U1 -- Picker nested click

Root cause: in Picker view the Grid cell `<div>` owns `onClick` (open the map). The shared
`TableEntry` controls (Skip turn, Add/Save, Edit, Unassign, Cancel edit) are native buttons
inside it, so every click bubbled and also opened the map.

Decision: the cell stays the owner of navigation; one guard on the parent
(`picker-cell-click.ts`, `openPickerUnlessInnerAction`) ignores clicks whose target is inside a
`button` / `a[href]` / `[role=button]` within the cell. Not `stopPropagation()` on every child
(would hide the click from legitimate listeners above, and must be repeated per control).
The text field is deliberately NOT an inner action: clicking an empty cell's input opens the map
(existing, tested behavior). Native buttons deliver Enter/Space as clicks, so keyboard, pointer
and touch share one rule. No new markup, so no invalid nested interactive HTML.

Known, pre-existing, out of scope: the cell body itself has no keyboard route to open the map
(only pointer). Recorded in the implementation report as a follow-up candidate.

## U2 -- Recent activity (decisions filled in as built)

See IMPLEMENTATION_REPORT.md.

## U3 / U4 / U5

See IMPLEMENTATION_REPORT.md.
