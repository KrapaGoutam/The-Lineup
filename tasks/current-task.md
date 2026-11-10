# The Lineup V2.0 — V2-006 Attendance V2 (Batch A: Foundation)

Parent issue: #254 | Program: #248 | Milestone: #8 (OPEN)
Branch: `feature/v2-006-attendance-v2` | Base: `origin/development` (`e796eee3`) | Worktree: `.tmp/v2-006-attendance`
Status: BATCH A COMPLETE — READY FOR BATCH B

## Scope — Batch A Only

- **V2-006.001**: Per-Location Attendance Mode Configuration (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`)
- **V2-006.002**: Native Internal Attendance Data Model (`attendance_sessions`, `attendance_events`, `attendance_breaks`)
- **V2-006.003**: Clock Integrity Rules (Duplicate prevention, state transitions, concurrency safety, idempotency, timezone rules)

Batch B (.004, .005) and Batch C (.006, .007) are NOT in scope for this batch.

## Invariants & Guardrails

- `main` remains untouched.
- `development` remains untouched until consolidated PR after all batches.
- Production: NO CONTACT / NO WRITE.
- Hosted DEV: No unapproved migration application or backfill.
- Existing Neon attendance: Preserved 100%.
- Single feature branch across all three batches: `feature/v2-006-attendance-v2`.

## Checkpoints

- [x] Preflight: Verify Git baseline, worktrees, issue status, and create `.tmp/v2-006-attendance`.
- [x] Documentation discrepancy review: Confirm V2-005 closeout commit `b4056738` exists locally at `.tmp/v2-005-c6-pilot` and is preserved.
- [x] Subfeature 1: Per-Location Attendance Mode Configuration (V2-006.001)
  - [x] Migration: `public.attendance_mode` enum, add column to `public.locations` (nullable, no silent default).
  - [x] Authority helper (`private.attendance_can_manage_location`) and audit logging on mode changes.
  - [x] Optimistic concurrency control for mode updates (`p_expected_updated_at` / `P0004`).
  - [x] Domain types, reader, and validation (`attendance-mode.ts`).
  - [x] Server actions for location attendance mode (`attendance-mode-actions.ts`).
- [x] Subfeature 2: Native Attendance Data Model (V2-006.002)
  - [x] Migration: `attendance_sessions`, `attendance_events`, `attendance_breaks` tables.
  - [x] Composite tenant foreign keys `(location_id, organization_id) references locations(id, organization_id)`.
  - [x] Actor attribution to `memberships` (`(organization_id, profile_id)`).
  - [x] Append-only immutability trigger for `attendance_events` (`attendance_events_immutable_trigger`).
  - [x] Partial unique indexes for atomic concurrency (one open session per employee, one active break per session).
  - [x] RLS policies and grants (fail-closed, no direct client table write).
  - [x] Local typegen update (`src/types/database.generated.ts`).
- [x] Subfeature 3: Clock Integrity Rules (V2-006.003)
  - [x] Atomic database functions (`attendance_clock_in`, `attendance_clock_out`, `attendance_break_start`, `attendance_break_end`).
  - [x] Strict state machine enforcement:
    - [x] Reject duplicate clock-in for open session (`23505`).
    - [x] Reject clock-out without open session (`P0002`).
    - [x] Reject invalid break transitions (`break_start` when already on break or not clocked in; `break_end` when not on break).
    - [x] Auto-close break on clock-out if still open.
  - [x] Location assignment & membership verification.
  - [x] Idempotency key tracking on events (`attendance_events_idempotency_idx`).
  - [x] Timezone integrity: UTC storage (`timestamptz`), location-local `service_date` assignment, elapsed duration arithmetic.
  - [x] Server actions and domain layer for native clock operations (`native-clock-actions.ts`, `native-attendance-data.ts`, `clock-integrity.ts`).
- [x] Verification & Tests
  - [x] pgTAP tests in `supabase/tests/database/0073_attendance_v2_foundation.test.sql` (41/41 PASS).
  - [x] Vitest unit tests for domain, actions, clock integrity, and timezone handling (12 suites, 94 tests PASS).
  - [x] Location regression tests (17 suites, 245 tests PASS).
  - [x] Quality gates: `npm run check` (Prettier, ESLint, TypeScript all PASS), `next build --webpack` (PASS).
- [x] Documentation & Batch B Handoff
  - [x] Update `docs/v2.0/features/006-attendance-v2/README.md` and `STATUS.md`.
  - [x] Update `tasks/current-task.md`.
  - [x] Halt without implementing Batch B or merging. Ready for Batch B execution.
