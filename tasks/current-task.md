# The Lineup V2.0 — V2-005 Stage C6 Limited DEV Pilot & Hosted Acceptance

Parent issue: #253 | Related: #252, #304 | Program: #248 | Milestone: #8
Branch: `docs/v2-005-c6-hosted-pilot-acceptance` | Target: `development` | Worktree: `.tmp/v2-005-c6-pilot`
Status: READY FOR OWNER CLOSEOUT SIGN-OFF

## Checkpoints

- [x] Stage C6-A: Baseline and Preflight Verification
  - GitHub: `origin/development` @ `1d5bb986`, `origin/main` @ `5e5b7747` (unchanged), PRs #316 and #317 merged.
  - Hosted Preview: `dpl_DQm4UB7vUQ3BX3CMpP3HJ7pTVohU` READY, DEV ref verified, 0 Production refs.
  - Hosted DEV: Ledger 82, enforcement STAGED, 0 configs, 44 active locations.
  - Baseline counts: 148 products, 236 stock (32 at DEV Location), 123 adjustments, 47 date lots, 32 recipes, 0 storage records.
  - Operator: TestOwner (`b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f`) authenticated with legitimate session.
- [x] Stage C6-B: Apply P-1 Pilot Configuration
  - Owner explicit P-1 approval granted.
  - Inserted `(location_id: a5d46f61-cf64-4b96-8d9f-41d6812d561c, module_key: bar_inventory, is_enabled: true)`.
  - Actor attribution verified (`updated_by: b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f`).
  - Total `location_module_configs` = 1 (other 8 modules and 43 other locations remain unconfigured).
  - Enforcement remains STAGED.
- [x] Stage C6-C: Hosted Authenticated Inventory Smoke (Playwright 4/4 PASS)
  - C1: Navigation & Visibility: Bar Inventory visible, active location DEV Location, unconfigured modules hidden, Settings accessible (PASS).
  - C2: Inventory Table: Products render, search, sort, filter, non-mutating row selection (PASS).
  - C3: Cooler Layout: View toggle, branch selector "DEV Location", storage filter, Unassigned Storage, empty state, drawer inspection (PASS).
  - C4: Responsive Viewports: Desktop (1280×800), Tablet (820×1180), Mobile (390×844) zero overflow (PASS).
- [x] Stage C6-D: Multi-branch acceptance
  - Local real-JWT suite verified; hosted execution DEFERRED (no dual-branch actor approved).
- [x] Stage C6-E: Write tests deferred
  - Option A placement mutations, stock edits, date lot imports on DEV deferred pending D4.
- [x] Stage C6-F: Security & Data Reconciliation
  - All 10 table counts verified 100% identical to baseline (0 stock drift, 0 audit drift).
  - Backend enforcement verified STAGED.
  - Production untouched.
- [x] Stage C6-G: Documentation Package
  - Updated `CONFIGURATION_APPROVAL.md`, `HOSTED_OWNER_SMOKE.md`, `OPEN_DEPENDENCIES.md`, `CLOSEOUT_DECISION.md`.
  - Created `C6_DEV_PILOT_ACCEPTANCE.md`.
  - Created Playwright spec `tests/real/ui/v2-005-c6-hosted-smoke.real.spec.ts`.
- [ ] Stage C6-H: Documentation PR merged to `development`.
- [ ] Stage C6-I: Final owner closeout sign-off on Issue #253.

## Current State & Next Step

Limited DEV pilot and hosted smoke complete with 100% data preservation and green automated test results. Issue #253 is ready for final owner closeout sign-off. Backend enforcement remains STAGED; Production untouched; V2-006 Attendance not started.
