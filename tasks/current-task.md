# Pre-V2-007 Operational Enhancements — IN PROGRESS

Branch `feature/pre-v2-007-operational-enhancements`; worktree `.tmp/pre-v2-007-operational-enhancements`; base `origin/development` `9b6e8d5ca82edac1bb8ce1b27112ccaab6c4aa2f`.
Attendance checkpoint `2713f1c` preserved untouched in `.tmp/attendance-manual-entry`. Root checkout preserved.
Documentation: `docs/v2.0/pre-007-operational-enhancements/`.

## Batch A — Attendance Manual Entry

- [x] Verify checkpoint `2713f1c` in `.tmp/attendance-manual-entry` and cherry-pick the 4 reviewed commits cleanly onto `feature/pre-v2-007-operational-enhancements`.
- [x] Review migration `20261110203355_attendance_manual_entry.sql` and verify SHA-256 hash `99C8BCB14A12D46745B2B80F5CBB44183A10C5A340290EC483B4E02D76977854`.
- [x] Run focused local pgTAP database tests: `0076_attendance_manual_entry.test.sql` (53/53 pass), `0074` (66/66 pass), `0075` (55/55 pass), `0073` pass.
- [x] Run focused Vitest attendance tests: 28 test files / 356 tests pass.
- [x] Prepare hosted DEV migration approval package (approval boundary held: no hosted database writes without owner authorization).

## Batch B — Visual Cooler Layout Refinement

- [x] Inspect existing Bar Inventory storage placement schema, commands, and components.
- [x] Confirm quantity invariance contract (placements are organization-only metadata; zero changes to stock counts, levels, or adjustments).
- [x] Refine Cooler Layout view to physically represent commercial cooler racks (top-to-bottom shelf orientation, cooler header, metallic shelf styling).
- [x] Implement explicit physical slot grid: occupied slots with product card & empty slots with slot numbers.
- [x] Add touch/click direct placement on empty slots + drag-and-drop between slots/shelves with collision feedback.
- [x] Provide accessible keyboard alternatives (Move Placement dialog with slot preselection, shelf reordering buttons).
- [x] Verify unified Item Sheet integration (`Counts | Levels | Dates | History`).
- [x] Add targeted component and invariant tests covering all 18 requirements.
- [x] Pass full Playwright E2E cooler layout suite across desktop, tablet, and mobile (21/21 tests pass).

## Batch C — Consolidated Validation & Integration

- [x] Complete CI verification (`npm run check`, full Vitest [3886 tests pass], `npx next build --webpack` pass).
- [ ] Document test matrix, evidence, and final handoff artifacts.
- [ ] Prepare single consolidated PR to `development`.
- [ ] Confirm post-merge stability and provide clean handoff for V2-007.

Native financial activation OFF; backend module enforcement STAGED. No Production, main, Neon, or premature V2-007 work.
