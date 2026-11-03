# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-001 — Access & Role Foundation
Current Subfeature:       V2-001.003 — Location Access
Branch:                   feature/v2.0-001.003-location-access
Starting dev SHA:         a23149796bcdecc66de24a522e996ca009e8da67
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-location-access
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #249
Subfeature Issue:         #263
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                20261103001500_location_access_foundation.sql (Outcome B)
DEV Migration Status:     APPLIED & VERIFIED on hosted DEV (opmujepkemwcdxxorhfd)
CI Status:                Pending
Blockers:                 NONE
Next Expected Subfeature: V2-001.004 — Per-Location Roles
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `a23149796bcdecc66de24a522e996ca009e8da67`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-location-access` on branch `feature/v2.0-001.003-location-access`.
   - Primary working tree preserved without modifications or stashes.

2. **Hosted DEV Prerequisite (V2-001.001)**:
   - Verified and pushed pending migration `20261102213000_overall_roles_foundation.sql` to hosted DEV (`opmujepkemwcdxxorhfd`).
   - Verified `public.overall_roles` and RLS policy active on hosted DEV.

3. **V2-001.003 Implementation & Hosted DEV Validation**:
   - Schema audit confirmed `public.location_memberships` did not exist.
   - Outcome B selected: Additive forward migration `20261103001500_location_access_foundation.sql` created table `public.location_memberships` with `unique (location_id, profile_id)`, active partial indexes, and 4 RLS policies.
   - Applied and verified migration on hosted DEV (`opmujepkemwcdxxorhfd`).
   - Domain model and pure predicates implemented in `src/features/auth/domain/location-access.ts`.
   - Server-authoritative data readers implemented in `src/features/auth/data/location-access.ts` enforcing effective scoped access: Active Org Membership + Active Location Assignment.
   - pgTAP test suite `0052_location_access.test.sql` (24 subtests) passing. Full database test suite: 52 files, 1,618 tests passed.
   - Vitest unit tests: 167 files, 2,202 tests passed (including 16 domain and 17 data reader tests).
   - Prettier, ESLint, TypeScript typecheck, Next.js build, local paths, and nonprod env checks all passed with 0 warnings/errors.
