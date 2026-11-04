# V2-002.005 — Location Lifecycle Integrity

Canonical docs: `docs/v2.0/features/002-organizations-locations/005-location-lifecycle-integrity/`
Parent Feature: Issue #250 · Program: Issue #248 · Subfeature Issue: #281 · Milestone #8
Branch: `feature/v2.0-002.005-location-lifecycle-integrity` (from `origin/development` `6aa61760ca8bbe8a643fae8ca8c27958dbd31a69`)
Environment: Codex Local closeout (2026-11-04); hosted DEV only

## Implementation Checklist

- [x] Pre-flight: SHAs recorded; PR #280 verified merged
- [x] Audit of location FKs, grants, write paths (PLAN §7–8)
- [x] Migration `20261104020000_location_lifecycle_integrity.sql`
- [x] pgTAP `0059_location_lifecycle_integrity.test.sql` (96 assertions; local PG16 run + prior suites unaffected)
- [x] Real two-session race verification (local PG16)
- [x] Domain `location-lifecycle.ts`, data wrappers, server actions
- [x] UI: badges, per-state actions, archived section, confirmation + history dialogs, demo source
- [x] Vitest (192 files / 2,617 passed), Playwright desktop + mobile
- [x] format:check, lint, typecheck, `next build --webpack`, check:local-paths
- [x] Docs: PLAN / STATUS / TEST_MATRIX / EVIDENCE, CURRENT_STATE
- [x] Issue #281 created under #250 (milestone #8)
- [ ] Commit, push, open PR into `development`; exact-head CI green
- [ ] **Codex Local**: hosted DEV migration + real-DB verification + WebKit tablet + `supabase gen types` diff check
- [ ] Merge commit into `development` (only after hosted DEV verification)

## Current State & Next Step

### Local closeout checklist

- [x] Fetch Cloud branch first; isolated worktree HEAD = PR #282 = `db56889ff7a5f791d14201e8ebd143c2e5dc9d8c`; unrelated main-checkout work preserved.
- [x] Confirm publication gap: `publishScheduleAction` updates an existing draft; original lifecycle migration guards INSERT only.
- [x] Add narrow forward publication trigger and dedicated pgTAP regression.
- [x] Verify DEV identity, ledger and exact approved pending set; dry run then apply.
- [x] Hosted transactional authorization, lifecycle, audit, preservation and operational guard tests.
- [x] Independent-session concurrency races A–D.
- [x] Generate canonical DEV types to temporary file and reconcile.
- [x] Actual WebKit `host-tablet`: lifecycle, location administration, staff assignments and settings.
- [x] Check, unit tests, builds/environment checks and security/scope review.
- [ ] Push same branch; all required CI green on final exact head.
- [ ] Merge PR #282 with merge commit into development; verify main unchanged.
- [ ] Close #281/#250 and update #248, milestone #8 and roadmap/current state.

Data/authorization: reuse trusted `schedule_periods.location_id`, existing RLS/grants and `private.guard_location_operational_write` with FOR SHARE. No history/schema model rewrite or client permission changes. UI unchanged; verify existing lifecycle states on WebKit. Risks: concurrent deactivation, direct-update bypass and generated-type drift. Tests: focused pgTAP, hosted synthetic rolled-back suites, true independent sessions, WebKit and exact-head CI. No Production access.

Local verification complete: hosted DEV 72/72 migrations, 362 pgTAP assertions, actual JWT role matrix, races A–D, canonical types, WebKit 16/16, check/unit/build gates pass. Next: commit/push correction on same PR branch, verify required checks on exact final HEAD, then merge #282 by merge commit and close tracking. Main/Production untouched. Do not start V2-003.
