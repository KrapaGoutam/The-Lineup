# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-001 — Access & Role Foundation
Current Subfeature:       V2-001.001 — Overall Roles
Branch:                   feature/v2.0-001.001-overall-roles
Starting dev SHA:         fec8eefcc74e388313414101ed67d2eba13635c3
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-overall-roles
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #249
Subfeature Issue:         #259
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                20261102213000_overall_roles_foundation.sql
DEV Migration Status:     Pending
CI Status:                Pending
Blockers:                 None
Next Expected Subfeature: V2-001.002 — Organization Membership
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `fec8eefcc74e388313414101ed67d2eba13635c3`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-overall-roles` on branch `feature/v2.0-001.001-overall-roles`.
   - Primary working tree preserved without modifications or stashes.

2. **V2-001.001 Implementation & Local Validation**:
   - Migration `20261102213000_overall_roles_foundation.sql` creates `overall_role` enum and `overall_roles` table with `constraint overall_roles_profile_id_key unique (profile_id)`.
   - RLS enabled with `overall_roles_select_self` policy; direct client writes fail closed.
   - Generated database types updated in `src/types/database.generated.ts`.
   - Domain model and reader contract implemented in `src/features/auth/domain/overall-role.ts` and `src/features/auth/data/overall-role.ts`.
   - pgTAP test suite `0050_overall_roles.test.sql` (22 subtests) passing. Full database test suite: 50 files, 1572 tests passed.
   - Vitest unit tests: 163 files, 2143 tests passed.
   - Prettier, ESLint, and TypeScript typecheck all passed with 0 warnings/errors.
