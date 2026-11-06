# V2-005.001 Table Allocation / Rotation Location Scoping — Status

## Current Status

**READY FOR REVIEW** (Checkpoints A, B, C, D complete; all gates pass)

## Progress Checklist

- [x] **Checkpoint A — Audit and Architecture Review**
  - [x] Application files audited (`allocation-data.ts`, `allocation-actions.ts`, `allocation-workspace.tsx`, `page-data.ts`, `restaurant-operations-app.tsx`).
  - [x] Shared location and context files inspected (`primary-location.ts`, `active-context.ts`, `workspace-expectation.ts`, `location-access.ts`, `access-resolver.ts`).
  - [x] Database objects, RPCs, and RLS policies audited (`service_sessions`, `dining_tables`, `dining_areas`, `section_assignments`, `rotation_members`, `rotation_rounds`, `table_rotation_entries`, `board_events`, `can_operate_board`, `begin_board_write`, `assign_table`, `board_add_column`).
  - [x] Entry-Point Matrix documented (`ENTRY_POINT_MATRIX.md`).
  - [x] Implementation Plan created (`PLAN.md`).
  - [x] Comprehensive Test Matrix defined (`TEST_MATRIX.md`).
- [x] **Checkpoint B — Implementation**
  - [x] Migration: update `private.can_operate_board(p_organization_id, p_location_id)` to enforce location scoping.
  - [x] Migration: update `public.board_add_column` to verify server location assignment.
  - [x] Migration: update RLS policies on allocation tables (`service_sessions`, `dining_tables`, `dining_areas`, `section_assignments`, `rotation_members`, `rotation_rounds`, `table_rotation_entries`, `board_events`).
  - [x] Server Actions: enforce `assertWorkspaceExpectation` and session ownership in `executeBoardActionRemote`, `undoBoardAction`, `redoBoardAction`, `getAllocationContextForDateAction`.
  - [x] Data loader: update `getAllocationContext` to require verified location scope and eliminate unverified fallback.
  - [x] UI / Component: ensure `expectedContext` is passed from `restaurant-operations-app.tsx` &rarr; `AllocationWorkspace` &rarr; actions.
- [x] **Checkpoint C — Security and Regression Testing**
  - [x] Unit tests for location-scoped actions and loaders (`allocation-actions.test.ts`: 12 tests passing).
  - [x] Real-mode / JWT tests for positive cases (AL-01 to AL-08) (`table-allocation-location-scoping.real.test.ts`).
  - [x] Real-mode / JWT tests for security denials (AL-09 to AL-22).
  - [x] pgTAP tests for direct database access & RLS boundaries (AL-23 to AL-28) (`0063_allocation_location_scoping.test.sql`: 53/53 assertions passing; 63 total files, 2,065 assertions passing).
  - [x] Full regression suite: format, lint, typecheck, vitest (233 test files, 3,160 tests passing, 0 failed).
- [x] **Checkpoint D — Evidence & PR**
  - [x] Record final execution evidence in `EVIDENCE.md`.
  - [x] GitHub issue / PR against `development`.

## Open Risks & Dependencies

- Predecessor dependency: PR #305 (V2-004.004) remains open and unmerged on GitHub. V2-005.001 is authored independently against `origin/development`.
- Reconciliation plan documented in `PLAN.md`.
