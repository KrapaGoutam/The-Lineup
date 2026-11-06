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
- [ ] Commit explicit paths, push PR #306 only and verify exact-head CI
- [ ] Publish final GO/BLOCKED evidence to PR #306 and issue #307

## In flight

Repair implemented. Standalone JWT 45/45; pgTAP 64 files / 2,104 assertions;
unit 3,176 passed / 7 existing skipped; authenticated browser 15/15 across all
three devices, including all three Overall role writes and visible actor names.
Legacy-data upgrade preserved event, entry and session records byte-for-byte.
Combined #305/#306 replay (65 files / 2,163 assertions), JWT 45/45, module JWT
18/18, full units 3,250 passed / 7 skipped, database lint and build pass. Final
authenticated combined browser 15/15 and independent zero-residue cleanup verified. Demo initial
156/159; all three failures pass serial retests (tablet 2/2, mobile 1/1).
Verified local stack: restaurant-roster API 54321 / DB 54322. JobQuest2.0 uses
55321/55322 and is outside scope. Initial local database contains no organizations
or Auth users, and currently has both staged PR migrations from the prior audit.

Local acceptance complete. Delivery to existing PR #306 and exact-head CI are next.
