# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-001 — Access & Role Foundation
Current Subfeature:       V2-001.005 — Multi-Location / Multi-Role Assignment
Branch:                   feature/v2.0-001.005-multi-location-multi-role
Starting dev SHA:         7065d397fd52e923a1f40913fec6b9d9d5d6b6cc
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-multi-location-roles
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #249
Subfeature Issue:         #267
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                20261103020000_multi_location_assignment_workflow.sql
DEV Migration Status:     PENDING (opmujepkemwcdxxorhfd)
CI Status:                Pending
Blockers:                 NONE
Next Expected Subfeature: V2-001.006 — Canonical Authorization Resolver
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `1ae02516a1d7aa6df606d1672d27f9c9a006db55`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-location-roles` on branch `feature/v2.0-001.004-per-location-roles`.
   - Primary working tree preserved without modifications or stashes.

2. **Hosted DEV Verification**:
   - Verified read-only that hosted DEV (`opmujepkemwcdxxorhfd`) contains `overall_roles`, `memberships`, `location_memberships`, and migrations through `20261103001500`.

3. **V2-001.004 Scope & Progress**:
   - Issue #265 created under Milestone 8.
   - Outcome A chosen: Additive column `role public.location_role not null default 'staff'` on `public.location_memberships`.
   - No branch owner; strictly `manager`, `assistant_manager`, `staff`.
   - Fail-closed effective role evaluation: Active Org Membership + Active Location Assignment + Location Role.
   - Overall role separation preserved; full capability resolver deferred to V2-001.006.
