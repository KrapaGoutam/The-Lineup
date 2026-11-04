# V2-002.005 — Location Lifecycle Integrity

Canonical docs: `docs/v2.0/features/002-organizations-locations/005-location-lifecycle-integrity/`
Parent Feature: Issue #250 · Program: Issue #248 · Subfeature Issue: #281 · Milestone #8
Branch: `feature/v2.0-002.005-location-lifecycle-integrity` (from `origin/development` `6aa61760ca8bbe8a643fae8ca8c27958dbd31a69`)
Environment: Claude Code Cloud (no Supabase credentials)

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

Cloud implementation is complete; status `READY_FOR_CODEX_LOCAL_VALIDATION`. Next step belongs to Codex Local: follow the "Hosted DEV checklist" in the subfeature `STATUS.md`. Do not merge in Cloud. Do not start V2-003.
