# Subfeature V2-002.004: Staff Assignment Management — Status

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: The Lineup V2.0 (#8) · Feature #250 · Program #248 · Issue #279 · PR #280  
Status: **READY_FOR_CODEX_LOCAL_VALIDATION** (PR open; not merged)  
Branch: `feature/v2.0-002.004-staff-assignment-management`  
Integration Target: `development`

## Deliverables

| Deliverable                                                             | Status                  | Notes                                                                     |
| ----------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Pre-flight baseline (dev `4d78eba…`, main `5e5b774…`)                   | Complete                | PR #278 confirmed merged                                                  |
| Pure domain module + change-set generator                               | Complete                | `domain/staff-assignment.ts`                                              |
| Server actions (roster, location view, employee view, apply)            | Complete                | reuse RPC; no service role                                                |
| Location-centric Staff tab (assign / change role / remove / reactivate) | Complete                | inside Manage Location                                                    |
| Employee-centric multi-location editor (one atomic change set)          | Complete                | Staff Assignments dialog                                                  |
| Demo isolation                                                          | Complete                | in-memory source; asserted by tests                                       |
| Vitest unit/component/action tests                                      | Complete                | 188 files / 2,551 passed (7 skipped pre-existing)                         |
| Playwright (mocked demo) desktop + mobile                               | Complete                | tablet verified on Chromium viewport only (WebKit not installed in Cloud) |
| Format / lint / typecheck / `next build --webpack` / local-path check   | Complete                | all green                                                                 |
| pgTAP (`supabase test db`)                                              | **NOT RUN**             | no Docker daemon in Cloud                                                 |
| Hosted DEV verification                                                 | **PENDING_CODEX_LOCAL** | No approved DEV-only path in Cloud                                        |
| Overall-admin roster read under RLS (non-member of org)                 | **Pending**             | see PLAN §13                                                              |
| Exact-head CI                                                           | See PR                  | recorded in EVIDENCE.md                                                   |
| Merge into `development`                                                | Not done                | by design                                                                 |

One additive read-only migration (`20261104010000_staff_roster_reader.sql`). Production untouched. `main` untouched.
