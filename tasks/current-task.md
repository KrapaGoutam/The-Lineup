# V2-004.001 — Per-Location Module Configuration Contract

Canonical docs: `docs/v2.0/features/004-location-module-configuration/001-module-configuration-contract/`
Parent Feature: Issue #252 · Program: Issue #248 · Subfeature Issue: #298 · Milestone #8
Branch: `feature/v2.0-004.001-module-configuration-contract` (from `origin/development` `fcc661df96b5af1c01ebb8f2f00ff42078e02979`)
Environment: Claude Code Cloud (isolated disposable local PostgreSQL only; no hosted DEV, no Production)

## Implementation Checklist

- [x] Pre-flight: `development`/`main` SHAs verified against the remote; Issue #298 created and linked to #252 (no duplicate existed)
- [x] Investigation: schema, authority helpers (`can_manage_location_lifecycle`, `has_org_role`), migration/test conventions, `AppTab` ids, earlier DATA_MODEL/MIGRATION_STRATEGY sketches reconciled
- [x] Decisions documented (PLAN.md): enum key, derived organization, no default for `is_enabled`, system-required Settings, read/write matrix, archived-location freeze, metadata envelope
- [x] Migration `20261105210000_location_module_configs.sql` applies from scratch (73/73)
- [x] pgTAP `0062` 92/92; 61 pre-existing files re-run (58 pass; 3 environment-limited identically at baseline); 5 migration mutants caught
- [x] Registry + contract + reader (`src/features/modules/`), Vitest +58, mutation checks, compile-time exhaustiveness verified
- [x] Generated types patched from a before/after generator diff (NOT CLI-verified — Local step)
- [x] format:check, lint, typecheck, check:local-paths, `npm test` (3078 passed), `next build --webpack`
- [x] Docs: PLAN / TEST_MATRIX / EVIDENCE / STATUS; ROADMAP, CURRENT_STATE, V2-004 README/STATUS, DATA_MODEL §2.4, MIGRATION_STRATEGY §2.3
- [x] Local-only real-JWT test written (`tests/real/module-config.db.real.test.ts`), typechecked, **not executed**
- [ ] Commit, push, open Draft PR into `development`
- [ ] **Local**: real Supabase stack `supabase test db`, `supabase gen types --local` diff, hosted DEV migration (single file), real-JWT 10/10, exact-head CI
- [ ] Regular merge into `development` only after every Local gate passes; then docs closeout

## Current State & Next Step

Implemented in Cloud; hosted DEV validation pending. Next: Draft PR, then Local validation per `EVIDENCE.md §5`. Do NOT start V2-004.002 (settings UI), V2-004.003, V2-004.004, V2-005 or V2-008. Do not merge before the Local gates pass.
