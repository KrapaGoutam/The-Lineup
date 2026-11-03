# Subfeature V2-001.003: Location Access — Status

```text
Status:               READY_FOR_PR
Branch:               feature/v2.0-001.003-location-access
GitHub Issue:         #263
PR:                   (Pending)
Milestone:            The Lineup V2.0 (Milestone #8)
Parent Feature:       #249 ([V2-001] Access & Role Foundation)
Parent Milestone:     #248 (The Lineup V2.0)
Starting Dev SHA:     a23149796bcdecc66de24a522e996ca009e8da67
Starting Main SHA:    5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree:             .tmp/v2-location-access
Target Branch:        development
Outcome:              Outcome B — Additive Forward Migration
Migration:            20261103001500_location_access_foundation.sql
Hosted DEV Status:    APPLIED & VERIFIED (opmujepkemwcdxxorhfd)
CI Status:            Pending
Blockers:             NONE
Next Subfeature:      V2-001.004 — Per-Location Roles
Production Touched:   NO
Main Touched:         NO
```

---

## Subfeature Progress

- [x] Schema audit & design decision (Outcome B — Additive Forward Migration)
- [x] Hosted DEV prerequisite V2-001.001 migration `20261102213000` applied & verified
- [x] Migration `20261103001500_location_access_foundation.sql` authored
- [x] Local DB reset and migration verification
- [x] Generated types updated (`src/types/database.generated.ts`)
- [x] Domain model and pure helpers (`src/features/auth/domain/location-access.ts`)
- [x] Server-authoritative data readers & effective access evaluator (`src/features/auth/data/location-access.ts`)
- [x] Unit tests for domain (`src/features/auth/domain/location-access.test.ts`, 16 tests passing)
- [x] Unit tests for data readers (`src/features/auth/data/location-access.test.ts`, 17 tests passing)
- [x] pgTAP database test suite (`0052_location_access.test.sql`, 24 tests passing)
- [x] Hosted DEV migration `20261103001500` applied & verified on `opmujepkemwcdxxorhfd`
- [x] All 52 database test files passing (1,618 tests)
- [x] All 167 unit test files passing (2,202 tests)
- [x] Prettier, ESLint, TypeScript typecheck passing (0 warnings/errors)
- [x] Next.js production build passing
- [ ] Pull request opened and exact-head CI passing
- [ ] Merge commit into `development`
