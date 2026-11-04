# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-002 — Organizations & Locations
Current Subfeature:       V2-002.003 — Location Administration
Branch:                   feature/v2.0-002.003-location-administration
Starting dev SHA:         23cfa4156b07ecbfc9e17c262182fbbeb7dcc229
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree Path:            .tmp/v2-location-administration
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #250
Subfeature Issue:         #277
PR:                       (Pending)
Head SHA:                 (Pending)
Migration:                NONE (100% reuse of foundation migration 20261103050000)
DEV Migration Status:     VERIFIED (opmujepkemwcdxxorhfd)
CI Status:                Pending PR
Blockers:                 NONE
Next Expected Subfeature: V2-002.004 — Staff Assignment Management
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**:
   - Starting `origin/development` SHA: `23cfa4156b07ecbfc9e17c262182fbbeb7dcc229`.
   - Starting `origin/main` SHA: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - Isolated worktree active at `.tmp/v2-location-administration` on branch `feature/v2.0-002.003-location-administration`.
   - Primary working tree preserved without modifications.

2. **Hosted DEV Verification**:
   - Verified that hosted DEV (`opmujepkemwcdxxorhfd`) contains all 68 migrations through `20261103050000`.
   - Reused canonical tables `public.locations`, `public.operating_hours`, and RPC `public.provision_location`.
   - Zero new schema migrations required.

3. **V2-002.003 Implementation**:
   - Server Action adapters: `src/features/locations/actions/location-admin-actions.ts` with strict role and tenant verification (`verifyLocationAdminAuthority`).
   - Management UI: `LocationAdministration`, `LocationList`, `LocationForm`, `LocationOperatingHoursEditor`, and `LocationTimeZoneSelect`.
   - Navigation: Integrated into `SettingsPage` as a dedicated manager subview with quick-link card `#settings-locations`.
   - Test suites: 183 Vitest files (2,470 tests), 57 pgTAP files (1,759 assertions), Playwright E2E suites passing across desktop, tablet, and mobile.
