# Subfeature V2-001.004: Per-Location Roles — Status

```text
Status:               IN_PROGRESS
Branch:               feature/v2.0-001.004-per-location-roles
GitHub Issue:         #265
PR:                   (Pending)
Milestone:            The Lineup V2.0 (Milestone #8)
Parent Feature:       #249 ([V2-001] Access & Role Foundation)
Parent Milestone:     #248 (The Lineup V2.0)
Starting Dev SHA:     1ae02516a1d7aa6df606d1672d27f9c9a006db55
Starting Main SHA:    5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree:             .tmp/v2-location-roles
Target Branch:        development
Outcome:              Outcome A — Additive Column on location_memberships
Migration:            20261103010000_location_roles_foundation.sql
Hosted DEV Status:    PENDING
CI Status:            Pending
Blockers:             NONE
Next Subfeature:      V2-001.005 — Multi-Location / Multi-Role Assignment
Production Touched:   NO
Main Touched:         NO
```

---

## Subfeature Progress

- [x] Pre-flight checks: baseline SHAs recorded, worktree created, branch tracking `origin/development`
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `location_memberships` present on `opmujepkemwcdxxorhfd`)
- [x] Subfeature issue created: #265
- [x] Architecture plan & test matrix documented
- [ ] Forward migration `20261103010000_location_roles_foundation.sql` authored
- [ ] Local DB reset and migration verification
- [ ] Generated types updated (`src/types/database.generated.ts`)
- [ ] Domain model and pure helpers (`src/features/auth/domain/location-role.ts`)
- [ ] Server-authoritative data readers (`src/features/auth/data/location-role.ts`)
- [ ] Unit tests for domain (`src/features/auth/domain/location-role.test.ts`)
- [ ] Unit tests for data readers (`src/features/auth/data/location-role.test.ts`)
- [ ] pgTAP database test suite (`0053_location_roles.test.sql`, DB-001 through DB-020)
- [ ] Full pgTAP test suite passing
- [ ] Full Vitest unit test suite passing
- [ ] Prettier, ESLint, TypeScript typecheck passing (0 warnings/errors)
- [ ] Next.js production build passing
- [ ] Hosted DEV migration dry run & push to `opmujepkemwcdxxorhfd`
- [ ] Hosted DEV verification
- [ ] Pull request opened and exact-head CI passing
- [ ] Merge commit into `development`
