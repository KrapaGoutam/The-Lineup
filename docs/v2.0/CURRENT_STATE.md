# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-001 — Access & Role Foundation
Current Subfeature:       V2-001.006 — Canonical Authorization Resolver
Branch:                   feature/v2.0-001.006-authorization-resolver
Starting dev SHA:         773ac7e8ee28fd0d99422f7a561709338a8a2755
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-auth-resolver
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #249
Subfeature Issue:         #269
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                NO NEW SCHEMA MIGRATION REQUIRED
DEV Migration Status:     VERIFIED BASELINE (opmujepkemwcdxxorhfd)
CI Status:                Pending
Blockers:                 NONE
Next Expected Subfeature: V2-001.007 — RLS / Server Security Hardening
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `773ac7e8ee28fd0d99422f7a561709338a8a2755`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-auth-resolver` on branch `feature/v2.0-001.006-authorization-resolver`.
   - Primary working tree preserved without modifications or stashes.

2. **Hosted DEV Verification**:
   - Verified read-only that hosted DEV (`opmujepkemwcdxxorhfd`) contains `overall_roles`, `memberships`, `locations`, `location_memberships`, `location_role`, and `apply_location_assignment_changes` through migration `20261103020000`.

3. **V2-001.006 Scope & Plan**:
   - Issue #269 created under Milestone 8.
   - Pure domain resolver `src/features/auth/domain/access-resolver.ts` and server data loader `src/features/auth/data/access-resolver.ts`.
   - No schema changes needed. No broad RLS rewrites or UI components.
