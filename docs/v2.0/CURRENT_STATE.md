# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-001 — Access & Role Foundation
Current Subfeature:       V2-001.002 — Organization Membership
Branch:                   feature/v2.0-001.002-organization-membership
Starting dev SHA:         5367581300cbfec18b3146c7c96b6e81012163c2
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-organization-membership
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #249
Subfeature Issue:         #261
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                None (Outcome A — Reused public.memberships)
DEV Migration Status:     V2-001.001 hosted DEV migration pending closeout repair
CI Status:                Pending
Blockers:                 V2-001.001 hosted DEV overall_roles repair blocker
Next Expected Subfeature: V2-001.003 — Location Access
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `5367581300cbfec18b3146c7c96b6e81012163c2`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-organization-membership` on branch `feature/v2.0-001.002-organization-membership`.
   - Primary working tree preserved without modifications or stashes.

2. **V2-001.002 Implementation & Local Validation**:
   - Schema audit confirmed `public.memberships` already enforces `unique (organization_id, profile_id)`, supporting 1 person &rarr; N organizations without duplicate rows.
   - Outcome A selected: No database schema migration required.
   - Domain model and pure helpers implemented in `src/features/auth/domain/organization-membership.ts`.
   - Server-authoritative data readers implemented in `src/features/auth/data/organization-membership.ts`.
   - pgTAP test suite `0051_organization_membership.test.sql` (22 subtests) passing. Full database test suite: 51 files, 1594 tests passed.
   - Vitest unit tests: 165 files, 2169 tests passed (including 10 domain and 16 data reader tests).
   - Prettier, ESLint, TypeScript typecheck, local paths, and nonprod env checks all passed with 0 warnings/errors.
