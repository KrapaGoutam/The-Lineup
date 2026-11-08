# V2-005 Batch A (Schedule/Roster .004 + Team/Settings .008 + Tips Audit Integrity) — DELIVERED

Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0). PR #313 -> development. Branch `feature/v2.0-005-batch-a-schedule-team-settings`.

- [x] BA-P00..P09 Antigravity implementation, tests and PR (see git history).
- [x] BA-F1 Focused review: publisher forgery trigger, location-only manager Schedule UI, roster-unavailable state, week-navigation fallback removed; dedicated authenticated browser acceptance added (18/18 desktop/tablet/phone).
- [x] BA-F2 Fresh encrypted ledger-78 backup, isolated restore, populated-data rehearsal, compatibility, DEV migration 78 -> 79, hosted probe 40/40, row preservation verified. Hosted UI acceptance DEFERRED (0 module configs).
- [x] BA-F3 Docs reconciled, merge into development, issue #253 updated.

## Current State & Next Step

Batch A is complete. Backend enforcement remains STAGED; no module configuration has been written to hosted DEV; main and Production untouched.
Next: V2-005.005 Payroll, V2-005.006 Bar Inventory, V2-005.007 Recipes (not started, not authorized by this batch). Follow-ups noted in Batch A evidence: Overall administrators cannot use /api/team deactivate/reactivate/passcode-reset (org-membership authority only); unify the three live-session helpers.
