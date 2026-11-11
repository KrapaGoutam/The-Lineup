# Pre-V2-007 Operational Enhancements — Plan

**Execution Cycle:** PRE-V2-007  
**Integration Target:** `development`  
**Feature Branch:** `feature/pre-v2-007-operational-enhancements`  
**Worktree:** `.tmp/pre-v2-007-operational-enhancements`  
**Parent Program:** V2.0 — GitHub Issue #248  
**Milestone:** #8 — The Lineup V2.0

---

## 1. Scope & Objectives

Deliver two operational enhancements prior to starting V2-007 (Clock In / Clock Out Kiosk):

1. **BATCH A — Attendance Manual Entry**
   - Resume and preserve the authoritative checkpoint `2713f1c` from `feature/attendance-manual-entry`.
   - Complete migration review for `20261110203355_attendance_manual_entry.sql` (SHA-256 `99C8BCB14A12D46745B2B80F5CBB44183A10C5A340290EC483B4E02D76977854`).
   - Maintain the strict hosted DEV authorization boundary (do not apply migration to hosted DEV without explicit owner approval).
   - Verify focused pgTAP (0076: 53/53 tests pass) and Vitest (356/356 tests pass).

2. **BATCH B — Visual Cooler Layout Refinement**
   - Enhance the physical representation of the cooler display rack with realistic cooler cabinet and shelf styling.
   - Organize shelves as horizontal rows from top to bottom (`displayOrder` ascending).
   - Display discrete bottle positions (slots) with both occupied slots and explicit empty slots.
   - Enable touch/click assignment directly into empty slots and drag-and-drop between slots/shelves.
   - Maintain accessible alternative controls (Move button / PlacementMoveDialog, shelf reorder buttons).
   - Verify invariant: Changing placement metadata never alters inventory quantities, cutoff/par levels, or stock ledger entries.
   - Integrate with unified Item Sheet (`Counts | Levels | Dates | History`).

3. **BATCH C — Consolidated Validation & Integration**
   - Independent security and architecture review.
   - Complete CI checks: format, lint, typecheck, unit/component tests, pgTAP database tests, webpack production build.
   - Prepare clean PR to `development`.
   - Merge into `development` upon passing gates.
   - Final handoff for V2-007.

---

## 2. Invariants & Boundaries

- `main` and Production: strictly untouched.
- Native financial activation: remains OFF.
- Backend module enforcement: remains STAGED.
- External Neon attendance: unchanged, isolated.
- Storage placement: placement metadata only, 0 quantity change.
- Original Attendance worktree (`.tmp/attendance-manual-entry`) and root checkout preserved.
