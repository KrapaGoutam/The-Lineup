# Subfeature V2-002.004: Staff Assignment Management — Status

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: The Lineup V2.0 (#8) · Feature #250 · Program #248 · Issue #279 · PR #280  
Status: **COMPLETE** (PR #280 merged into `development` at `b08efeee933507dcd4d7e475f2ebab957d47453e`)
Branch: `feature/v2.0-002.004-staff-assignment-management`  
Integration Target: `development`

## Deliverables

| Deliverable                                                             | Status   | Notes                                                                |
| ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Pre-flight baseline (dev `4d78eba…`, main `5e5b774…`)                   | Complete | PR #278 confirmed merged                                             |
| Pure domain module + change-set generator                               | Complete | `domain/staff-assignment.ts`                                         |
| Server actions (roster, location view, employee view, apply)            | Complete | reuse RPC; no service role                                           |
| Location-centric Staff tab (assign / change role / remove / reactivate) | Complete | inside Manage Location                                               |
| Employee-centric multi-location editor (one atomic change set)          | Complete | Staff Assignments dialog                                             |
| Demo isolation                                                          | Complete | in-memory source; asserted by tests                                  |
| Vitest unit/component/action tests                                      | Complete | 188 files / 2,551 passed (7 skipped pre-existing)                    |
| Playwright (mocked demo) desktop + mobile                               | Complete | exact-head desktop CI green; prior mobile/Chromium tablet green      |
| Format / lint / typecheck / `next build --webpack` / local-path check   | Complete | all green                                                            |
| Targeted hosted DEV pgTAP                                               | Complete | 6 transactional suites / 149 assertions passed; fixtures rolled back |
| Hosted DEV verification                                                 | Complete | migration synchronized on `opmujepkemwcdxxorhfd`                     |
| Overall-admin roster read under RLS (non-member of org)                 | Complete | Overall Owner and Manager pass; denied-role cases pass               |
| WebKit/iPad (`host-tablet`)                                             | Complete | 12/12 passed serially                                                |
| Exact-head CI                                                           | Complete | application, browser-smoke, Database, Vercel green on `242ba18e`     |
| Merge into `development`                                                | Complete | merge commit `b08efeee933507dcd4d7e475f2ebab957d47453e`              |

One additive read-only migration (`20261104010000_staff_roster_reader.sql`). Production untouched. `main` unchanged at `5e5b7747693b6e81014eafdf299b87e56c3f033d`. V2-002.005 was not started.
