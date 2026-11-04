# The Lineup V2.0 — Current Operational State

```text
Program:                  The Lineup V2.0
State:                    IN_PROGRESS
Current Feature:          V2-002 — Organizations & Locations
Current Subfeature:       V2-002.004 — Staff Assignment Management
Environment:              Claude Code Cloud
Branch:                   feature/v2.0-002.004-staff-assignment-management
Starting dev SHA:         4d78eba63ec846198bd3cd654d99221f3f8b7c71
Starting main SHA:        5e5b7747693b6e81014eafdf299b87e56c3f033d
Target Branch:            development
GitHub Milestone:         The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:      #248
Feature Issue:            #250
Subfeature Issue:         #279
PR:                       #280 (open, against development)
Head SHA:                 (see PR)
Migration:                20261104010000_staff_roster_reader.sql (additive, read-only RPC)
DEV Migration Status:     NOT APPLIED to hosted DEV (PENDING_CODEX_LOCAL)
CI Status:                see PR
Status:                   IN PROGRESS / PR OPEN / AWAITING LOCAL VERIFICATION
Blockers:                 pgTAP + hosted DEV verification require Codex Local
Next Expected Subfeature: V2-002.005 — Location Lifecycle Integrity
Production Changes:       NONE
Main Branch Merge:        NONE
```

---

## Operational Summary

1. **Safety Baseline**: `origin/development` `4d78eba63ec846198bd3cd654d99221f3f8b7c71`, `origin/main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`. V2-002.003 (PR #278) confirmed merged.
2. **V2-002.004 Implementation (Cloud)**: staff roster reader, assignment server actions, location-centric Staff tab, employee-centric multi-location editor, demo-isolated source. Reuses the atomic RPC; no schema change.
3. **Cloud gates run**: format, lint, typecheck, Vitest (188 files / 2,551 passed), `next build --webpack`, local-path check, mocked Playwright (desktop + mobile; tablet viewport on Chromium).
4. **Not run in Cloud**: pgTAP (no Docker), hosted DEV verification, WebKit tablet project. Handoff in `docs/v2.0/features/002-organizations-locations/004-staff-assignment-management/EVIDENCE.md`.
5. **Do not mark COMPLETE** until Codex Local gates pass and the PR is merged with a merge commit.
