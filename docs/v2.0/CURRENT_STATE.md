# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-002 — Organizations & Locations
Current Subfeature:       V2-002.004 — Staff Assignment Management (COMPLETE)
Environment:              Codex Local (Windows)
Branch:                   feature/v2.0-002.004-staff-assignment-management
Starting dev SHA:         4d78eba63ec846198bd3cd654d99221f3f8b7c71
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #250
Subfeature Issue:         #279
PR:                       #280 (merged into development)
Head SHA:                 242ba18e78201ca299fb55554db96e7ec7de2e5f
Merge / development SHA:  b08efeee933507dcd4d7e475f2ebab957d47453e
Migration:                20261104010000_staff_roster_reader.sql (additive, read-only RPC)
DEV Migration Status:     APPLIED and synchronized on opmujepkemwcdxxorhfd
CI Status:                green on exact head 242ba18 (application, browser-smoke, Database, Vercel)
Status:                   V2-002.004 COMPLETE / V2-002 IN PROGRESS
Blockers:                 NONE
Next Expected Subfeature: V2-002.005 — Location Lifecycle Integrity
Production Changes:       NONE
Main Branch Merge:        NONE (main remains 5e5b7747693b6e81014eafdf299b87e56c3f033d)
```

---

## Operational Summary

1. **Safety Baseline**: `origin/development` `4d78eba63ec846198bd3cd654d99221f3f8b7c71`, `origin/main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`. V2-002.003 (PR #278) confirmed merged.
2. **V2-002.004 Implementation (Cloud)**: staff roster reader, assignment server actions, location-centric Staff tab, employee-centric multi-location editor, demo-isolated source. Reuses the atomic RPC; no schema change.
3. **Exact-head CI**: application, desktop browser-smoke, Database (including `0058_staff_roster_reader.test.sql`) and Vercel passed on `242ba18e78201ca299fb55554db96e7ec7de2e5f`.
4. **Codex Local gates**: DEV migration applied and synchronized; six targeted transactional suites passed 149 assertions; Overall Owner/Manager non-member roster access, inactive/creator denial, cross-tenant denial and mixed-batch zero-partial-write atomicity verified; real WebKit `host-tablet` 12/12 passed serially.
5. **Merge closeout**: PR #280 merged with merge commit `b08efeee933507dcd4d7e475f2ebab957d47453e`; `origin/development` matches it, `origin/main` is unchanged at `5e5b7747693b6e81014eafdf299b87e56c3f033d`, and Production was untouched. V2-002.005 is next but not started.
