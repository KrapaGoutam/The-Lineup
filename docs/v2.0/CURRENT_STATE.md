# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-002 — Organizations & Locations
Current Subfeature:       V2-002.002 — Location Model
Branch:                   feature/v2.0-002.002-location-model
Starting dev SHA:         f078104d56f29809880d0cd584958c9fd47fbdb3
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-location-model
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #250
Subfeature Issue:         #275
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                supabase/migrations/20261103050000_location_model_foundation.sql
DEV Migration Status:     MIGRATED & VERIFIED (opmujepkemwcdxxorhfd)
CI Status:                Pending
Blockers:                 NONE
Next Expected Subfeature: V2-002.003 — Location Administration
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `f078104d56f29809880d0cd584958c9fd47fbdb3`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-location-model` on branch `feature/v2.0-002.002-location-model`.
   - Primary working tree preserved without modifications.

2. **Hosted DEV Verification**:
   - Verified that hosted DEV (`opmujepkemwcdxxorhfd`) contains all 68 migrations through `20261103050000`.
   - Reused existing canonical table `public.locations`.

3. **V2-002.002 Scope & Plan**:
   - Issue #275 created under Milestone 8.
   - Establish canonical location model, physical addresses, IANA time zones, operating metadata, server readers/mutations, and hardened RLS.
   - Forward migration: `20261103050000_location_model_foundation.sql`.
