# V2-005.005 Payroll Location Scoping — COMPLETED

Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0)
Branch: `feature/v2.0-005.005-payroll-location-scoping` | Target: `development`
Worktree: `.tmp/v2-payroll-location-scoping` | Mode: IMPLEMENT → VERIFY → CREATE ONE PR → OWNER HANDOFF

## Checklist

### STAGE 1 — IMPLEMENT

- [x] P00: Verify baseline git commit (`896c8016c6edaa110943d55aa8848ea146abae14`), initialize feature worktree & branch.
- [x] P01: Documentation suite initialization (`PLAN.md`, `ENTRY_POINT_MATRIX.md`, `FINANCIAL_INVARIANTS.md`, `TEST_MATRIX.md`, `STATUS.md`, `INTEGRATION_HANDOFF.md`, `EVIDENCE.md`).
- [x] P02: Database migration: Add optional `location_id` to `payroll_periods` with composite tenant FK, repair actor attribution FKs to `profiles(id)`, actor identity triggers, helper functions (`payroll_profile_level`, `payroll_is_org_manager`, `payroll_can_manage_location`, `payroll_can_manage_period`, `payroll_can_read_period`), public RPC `payroll_location_authorized`, update `unconfirm_payroll_payment`, RLS policies on `payroll_settings`, `payroll_rates`, `payroll_periods`, `payroll_payments`, `payroll_adjustments`, `audit_events`, backend module enforcement policy (`20261108021714_payroll_location_scoping.sql`).
- [x] P03: Server-side authorization & actor resolution: Implement `src/features/payroll/data/payroll-actor.ts`, update `payroll-actions.ts` and `statement-actions.ts` with V2 active-context resolution, workspace expectation assertions (`checkWorkspace`), multi-location double-count safeguards, and location-scoped filtering.
- [x] P04: Data layer updates: Update `src/features/payroll/data/payroll-data.ts` to support optional `location_id` on periods, location-scoped period listing, and actor attribution.
- [x] P05: UI updates: Thread `expectedContext` into `PayrollWorkspace`, display location scope indicators, multi-location generation guards, rate override disablement for non-org managers, and preserve export/print parity.

### STAGE 2 — VERIFY

- [x] P06: Vitest unit tests: 9 payroll test files passing, 121/121 tests pass. Full repository vitest suite passes (247 files, 3,336 tests). Registered `guardPayrollModule` in `enforcement-coverage.test.ts`.
- [x] P07: pgTAP & real-JWT database tests: Created `0021_payroll_location_scoping.test.sql` (65/65 tests pass). Full payroll suite (0010, 0011, 0018, 0021): 151/151 tests pass.
- [x] P08: Migration replay & populated data rehearsal: `supabase db reset` rehearsed cleanly; all 80 migrations applied from scratch; pgTAP verified against fresh database.
- [x] P09: Full quality gates: `npm run check` (prettier, eslint with 0 warnings, typecheck) and `npm run build` (`next build --webpack`) cleanly pass.

### STAGE 3 — DELIVER

- [x] P10: Independent review: verified security, tenant isolation, location scoping, financial invariants, and RLS policies.
- [x] P11: Evidence documentation: finalized `EVIDENCE.md`, `STATUS.md`, `INTEGRATION_HANDOFF.md`.
- [x] P12: Commit, push branch, open PR targeting `development` with full evidence, stop for owner handoff.

## Current State & Next Step

- All implementation and verification stages complete.
- Quality gates: check (clean), test (3,336 passed), build (clean), db test (151 passed).
- Ready for final commit and pull request creation targeting `development`.
