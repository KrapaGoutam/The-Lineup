# V2-004.004 — Backend Module Enforcement — Status

```text
Status:            IMPLEMENTED — ACTIVATION BLOCKED   (not COMPLETE)
GitHub Issue:      #304   (parent #252, program #248, milestone #8)
Pull Request:      #305   (open, base development; NOT merged)
Target Branch:     development
Feature Branch:    feature/v2.0-004.004-backend-module-enforcement
Baseline:          origin/development 53ad8397dd8712b70846b13b067d9c3c1ef0c06a (PR #303 included)
Main (unchanged):  5e5b7747693b6e81014eafdf299b87e56c3f033d
Production:        not contacted
```

| Aspect                       | State                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation               | **Done and tested** — guard, 3 RPC seams, 36 restrictive policies, activation gate, readiness report, completeness tests                                                           |
| Server Actions               | 98 audited: **78 guarded**, 20 exempt system actions, 0 unclassified (enforced by a test)                                                                                          |
| HTTP routes                  | 9 audited, all exempt (identity / credential / security); none handles module data                                                                                                 |
| SQL RPCs                     | 80 public functions: 62 reach a patched seam (verified transitively) + 1 via RLS; 6 system; 2 triggers; 9 org-level **BLOCKED on V2-005** (7 recipes, 1 payroll, 1 own-read-state) |
| Database layer               | Covers everything with a `location_id`. Org-level tables (payroll, recipes, team, attendance links, availability/time-off) are server-guard only — recorded, not hidden            |
| **Environment activation**   | **NOT ACTIVATED anywhere.** Switch is `staged` by default; hosted DEV not migrated by this PR                                                                                      |
| Hosted DEV readiness (fresh) | **NOT READY** — 44 active locations, 0 with module rows (read-only GET, 2026-11-06)                                                                                                |
| Owner-approved backfill      | **None recorded** — blocker **R1**                                                                                                                                                 |
| Merge to `development`       | **Held** — see [ROLLOUT_READINESS.md](ROLLOUT_READINESS.md) and the PR for the exact gate; main untouched                                                                          |

Next phase (not authorized, not started): **V2-005 — Existing Module Location Scoping.**

## Residual risks

1. **Unreconciled DEV locations (44).** Activation is refused by the database until the owner approves values (R1).
2. **Org-level data has no DB-level module check** until V2-005 (payroll, recipes, team, attendance links, availability/time-off). Server Actions are complete; direct PostgREST by an already-authorized org member is the documented gap.
3. **`task_notifications_mark_read`** (own read-state) is unguarded at the DB.
4. **New locations after activation** start fully Missing (Q1).
5. **Production** reconciliation is V2-008.004; release gate V2-009.
6. Hosted DEV real-JWT active-mode tests cannot run (BE-48/49 on DEV) until DEV is reconciled — they pass on the local stack with real sessions.

Q1–Q4 from V2-004.001 remain open; new R1, R2 added in [PLAN.md](PLAN.md) §7.
