# The Lineup V2.0 — V2-005 Stage C7 Final Smoke Correction & Owner Closeout Gate

Parent issue: #253 | Related: #252, #304 | Program: #248 | Milestone: #8 (OPEN)
Branch: `docs/v2-005-c6-hosted-pilot-acceptance` | Target: `development` | Worktree: `.tmp/v2-005-c6-pilot`
Status: IN PROGRESS — READY FOR PR #318 UPDATE & MERGE

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
- [x] Stage C7-A: Smoke Evidence Correction & Strengthened Assertions (Playwright 4/4 PASS in 16.3s)
  - C1: Navigation & Availability: Bar Inventory visible, active location DEV Location, unconfigured modules hidden, Settings accessible (PASS 983ms).
  - C2: Inventory Table: Search presence, matching display, exclusion on nonmatching queries, and restoration on clear; Name column descending (header toggle) and ascending (Sort order preset) sorting verified against visible table values with `Intl.Collator`; non-mutating row selection (individual, selection status counter, indeterminate header checkbox, select all visible, clear selection) verified (PASS 1.9s).
  - C3: Cooler Layout: View toggle, branch selector "DEV Location", storage filter, Unassigned Storage, empty state guidance ("No storage areas defined"), Manage Unassigned view & read-only ItemSheet inspection verified without saving data (PASS 798ms).
  - C4: Responsive Viewports: Desktop (1280×800), Tablet (820×1180), Mobile (390×844) zero overflow in Chromium test browser; native WebKit & Android deferred (PASS 435ms).
- [x] Stage C7-B: Documentation Correction
  - Qualified data preservation claims: "All relevant table counts unchanged across all 10 tables; no stock-changing actions performed."
  - Formally recorded three accepted P2 items (P2-4 Realtime, P2-5 CSV import fraction parsing, P2-6 Item sheet branch scope labeling).
  - Clarified that closing Issue #253 does NOT close Milestone #8 (Milestone #8 contains V2-006, V2-007, V2-008, V2-009).
  - Formally marked multi-branch hosted acceptance and write-dependent hosted acceptance as DEFERRED.
- [ ] Stage C7-C: Commit and push corrected head to PR #318.
- [ ] Stage C7-D: Verify required GitHub CI checks pass on PR #318.
- [ ] Stage C7-E: Merge PR #318 to `development`.
- [ ] Stage C7-F: Prepare Issue #253 Owner Sign-off summary.

## Current State & Next Step

Evidence corrections and Playwright assertions complete (4/4 PASS). Ready to run formatting/lint, push corrected commit to PR #318, await CI, and merge to `development`.
