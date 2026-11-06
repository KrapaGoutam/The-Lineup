# V2-005.001 — Overall actor contract repair / PR #306

Owner-authorized targeted repair, 2026-11-06. Starting SHA
`292e00186963626359687460e0710ca4fb9db439`. Existing feature worktree only;
parent checkout changes preserved. PR #305 stays staged and untouched. No merge,
hosted migration, hosted configuration change, Production access or Tasks work.

- [x] Verify GitHub PRs, baseline refs, clean worktree and local Docker targets
- [x] Reproduce exact 23503 chain and inspect all actor/history consumers
- [x] Document bounded identity, authorization, audit and regression design
- [x] Implement Allocation actor hydration and forward-only audit repair
- [x] Verify real JWT OA-01–OA-22 and previous security corrections
- [x] Replay standalone migrations and run full pgTAP
- [x] Compose disposable #305/#306 integration and verify staged enforcement
- [x] Verify authenticated Chromium, WebKit iPad and mobile browser flows
- [x] Run full format/lint/typecheck/path/unit/build gates and diff review
- [x] Verify fixture cleanup; update all five feature documents
- [x] Commit explicit paths, push PR #306 only and verify exact-head CI
- [x] Publish final GO/BLOCKED evidence to PR #306 and issue #307

## Closeout

Repair implemented. Standalone JWT 45/45; pgTAP 64 files / 2,104 assertions;
unit 3,176 passed / 7 existing skipped; authenticated browser 15/15 across all
three devices, including all three Overall role writes and visible actor names.
Legacy-data upgrade preserved event, entry and session records byte-for-byte.
Combined #305/#306 replay (65 files / 2,163 assertions), JWT 45/45, module JWT
18/18, full units 3,250 passed / 7 skipped, database lint and build pass. Final
authenticated combined browser 15/15 and independent zero-residue cleanup verified. Demo initial
156/159; all three failures pass serial retests (tablet 2/2, mobile 1/1).
Verified local stack: restaurant-roster API 54321 / DB 54322. JobQuest2.0 uses
55321/55322 and is outside scope. The final local database contains the combined PR migrations plus repair, staged
enforcement and zero fixture organizations/profiles/Auth users/module rows/events.

Repair implementation `ee1d1971a54e8eab8d06ab78699ac5b75ed7e377` pushed to
PR #306. Its exact-head application, browser, migration-policy and Vercel checks
PASS; deploy-migrations SKIPPED. GO-for-owner-review evidence is published on
PR #306 and issue #307, both OPEN. Documentation-only final delivery receipts
are reconciled externally on that same PR after this snapshot. No further feature
work remains; do not begin Tasks or merge/deploy/activate without owner approval.
