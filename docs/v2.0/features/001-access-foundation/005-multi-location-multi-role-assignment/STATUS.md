# Subfeature V2-001.005: Multi-Location / Multi-Role Assignment — Status

```text
Status:               IN_PROGRESS
Branch:               feature/v2.0-001.005-multi-location-multi-role
GitHub Issue:         #267
PR:                   (Pending)
Milestone:            The Lineup V2.0 (Milestone #8)
Parent Feature:       #249 ([V2-001] Access & Role Foundation)
Parent Milestone:     #248 (The Lineup V2.0)
Starting Dev SHA:     7065d397fd52e923a1f40913fec6b9d9d5d6b6cc
Starting Main SHA:    5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree:             .tmp/v2-multi-location-roles
Target Branch:        development
Outcome:              Narrow RPC `public.apply_location_assignment_changes`
Migration:            20261103020000_multi_location_assignment_workflow.sql
Hosted DEV Status:    PENDING (opmujepkemwcdxxorhfd)
CI Status:            Pending
Blockers:             NONE
Next Subfeature:      V2-001.006 — Canonical Authorization Resolver
Production Touched:   NO
Main Touched:         NO
```

---

## Subfeature Progress

- [x] Pre-flight checks: baseline SHAs recorded, worktree created, branch tracking `origin/development`
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `location_memberships`, `location_role` present on `opmujepkemwcdxxorhfd`)
- [x] Subfeature issue created: #267
- [x] Architecture plan & test matrix documented
- [ ] Forward migration `20261103020000_multi_location_assignment_workflow.sql` authored
- [ ] Local DB reset and migration verification
- [ ] Generated types updated (`src/types/database.generated.ts`)
- [ ] Domain model and pure helpers (`src/features/auth/domain/location-assignment.ts`)
- [ ] Server-authoritative data readers & mutation contract (`src/features/auth/data/location-assignment.ts`)
- [ ] Unit tests for domain (`src/features/auth/domain/location-assignment.test.ts`)
- [ ] Unit tests for data layer (`src/features/auth/data/location-assignment.test.ts`)
- [ ] pgTAP database test suite (`0054_location_assignment.test.sql`, DB-001 through DB-024)
- [ ] Full pgTAP test suite passing
- [ ] Full Vitest unit test suite passing
- [ ] Prettier, ESLint, TypeScript typecheck passing (0 warnings/errors)
- [ ] Next.js production build passing
- [ ] Hosted DEV migration dry run & push to `opmujepkemwcdxxorhfd`
- [ ] Hosted DEV verification
- [ ] Pull request opened and exact-head CI passing
- [ ] Merge commit into `development`
