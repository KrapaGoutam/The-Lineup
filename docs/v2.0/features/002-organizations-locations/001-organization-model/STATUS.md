# Subfeature V2-002.001: Organization Model — Status

```text
Status:               READY_FOR_MERGE
Branch:               feature/v2.0-002.001-organization-model
GitHub Issue:         #273
Milestone:            The Lineup V2.0 (Milestone #8)
Parent Feature:       #250 ([V2-002] Organizations & Locations)
Parent Milestone:     #248 (The Lineup V2.0)
Starting Dev SHA:     c152d9d6b48ab8cec5fee6d999b99705748c2a4d
Starting Main SHA:    5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree:             .tmp/v2-organization-model
Target Branch:        development
Outcome:              Canonical Organization Model, RLS Hardening, Atomic Provisioning & Owner Bootstrap
Migration:            supabase/migrations/20261103040000_organization_model_foundation.sql
Hosted DEV Status:    Applied & Verified (opmujepkemwcdxxorhfd)
CI Status:            Pending PR
Blockers:             NONE
Next Phase:           V2-002.002 — Location Model
Production Touched:   NO
Main Touched:         NO
```

---

## Subfeature Progress

- [x] Pre-flight checks: baseline SHAs recorded (`c152d9d6` dev, `5e5b7747` main), isolated worktree created (`.tmp/v2-organization-model`)
- [x] Subfeature issue created: #273
- [x] Hosted DEV baseline verified (`opmujepkemwcdxxorhfd`, 30 organizations audited)
- [x] Full baseline regression tests verified (173 Vitest files, 55 pgTAP files passing)
- [x] Canonical documentation initialized (`PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md`)
- [x] Forward-only migration written (`supabase/migrations/20261103040000_organization_model_foundation.sql`)
- [x] Dedicated pgTAP security acceptance test suite written (`supabase/tests/database/0056_organization_model.test.sql`)
- [x] Local database reset and migration execution (`npx supabase db reset`)
- [x] TypeScript types updated (`npm run db:types`)
- [x] Organization domain models, validators, and tests written (15 tests passing)
- [x] Organization data readers, mutations, and tests written (30 tests passing)
- [x] Focused pgTAP tests passing (31 assertions passing)
- [x] Full pgTAP regression passing (all 56 files, 1,727 assertions)
- [x] Full Vitest suite passing (176 files, 2,384 tests)
- [x] Quality gates passing (`format:check`, `lint`, `typecheck`, `next build --webpack`, `check:local-paths`, `check:env`)
- [x] Hosted DEV migration dry-run and apply (`20261103040000` applied to `opmujepkemwcdxxorhfd`)
- [x] Hosted DEV live database validation
- [ ] Pull request opened targeting `development`, exact-head CI passed
- [ ] Merge commit into `development` and closeout tracking
