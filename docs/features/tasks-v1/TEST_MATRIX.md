# Tasks V1 — Test Matrix

Layers: **DB** = pgTAP (`supabase/tests/database/0026_tasks_*.test.sql`, local Supabase) · **U** = Vitest unit/component · **E2E** = Playwright. Result: `PASS` / `FAIL` / `BLOCKED` / `TODO` (never PASS for an unrun case).

| ID       | Scenario                                                                     | Layer   | AC           | Result                                                        |
| -------- | ---------------------------------------------------------------------------- | ------- | ------------ | ------------------------------------------------------------- |
| TASK-001 | Manager creates a normal task                                                | DB, U   | AC-05        | PASS (DB, U, E2E)                                             |
| TASK-002 | Staff cannot create a task                                                   | DB      | AC-05        | PASS (DB, E2E staff has no Assigned/Manage)                   |
| TASK-003 | Assign a single staff member                                                 | DB      | AC-05        | PASS                                                          |
| TASK-004 | Assign multiple people (shared once) and each-person fan-out                 | DB      | AC-13        | PASS                                                          |
| TASK-005 | Staff completes own task (with/without note)                                 | DB, E2E | AC-06        | PASS (DB, U, E2E)                                             |
| TASK-006 | Manager completes on behalf; assignee unchanged                              | DB, E2E | AC-07        | PASS (DB, U, E2E)                                             |
| TASK-007 | Unrelated staff cannot complete                                              | DB      | AC-06        | PASS                                                          |
| TASK-008 | Reassignment replaces assignees, emits event + notification                  | DB      | AC-05        | PASS (DB, E2E reassign)                                       |
| TASK-009 | Block (reason required) / unblock                                            | DB, U   | AC-17        | PASS (DB, U)                                                  |
| TASK-010 | Overdue derived in location time zone, not stored                            | DB, U   | AC-16        | PASS (DB, U)                                                  |
| TASK-011 | Completed filter / My Tasks filters                                          | U, E2E  | AC-03        | PASS (U; filters exercised in component + e2e)                |
| TASK-012 | Reopen a completed task (eligible only)                                      | DB      | AC-06        | PASS                                                          |
| TASK-013 | Cancel (manager only); staff cannot                                          | DB      | AC-05        | PASS (DB, E2E cancel)                                         |
| TASK-014 | Carry forward / handoff of unfinished tasks                                  | DB, U   | AC-22        | PASS (DB, U, E2E handoff)                                     |
| TASK-015 | Staff cannot edit task fields / status they don't own via direct table write | DB      | AC-05        | PASS                                                          |
| TASK-020 | Opening daily generation (idempotent)                                        | DB      | AC-09        | PASS (DB, U, E2E)                                             |
| TASK-021 | Opening shared task completed by any eligible member                         | DB      | AC-11        | PASS (DB, U, E2E)                                             |
| TASK-022 | Opening individual task: assignee or manager only                            | DB      | AC-12        | PASS (DB, U, E2E)                                             |
| TASK-023 | Opening multi-person / all-team items                                        | DB      | AC-13        | PASS (DB, U)                                                  |
| TASK-024 | Manager completes an Opening item; assignee preserved                        | DB, E2E | AC-12        | PASS (DB, U, E2E closing equivalent TASK-033)                 |
| TASK-025 | Next day's Opening starts clean                                              | DB, E2E | AC-09        | PASS (DB, U, E2E)                                             |
| TASK-026 | Previous day remains historical and readable                                 | DB, U   | AC-09        | PASS (DB, U, E2E history)                                     |
| TASK-027 | Template edit after generation does not alter existing day                   | DB      | AC-09        | PASS (DB, U)                                                  |
| TASK-030 | Closing daily generation                                                     | DB      | AC-10        | PASS (DB)                                                     |
| TASK-031 | Closing shared item                                                          | DB      | AC-11        | PASS (DB, U)                                                  |
| TASK-032 | Closing individual item                                                      | DB      | AC-12        | PASS (DB, U)                                                  |
| TASK-033 | Closing manager override                                                     | DB      | AC-12        | PASS (DB, U, E2E)                                             |
| TASK-034 | Closing next-day isolation                                                   | DB, E2E | AC-10        | PASS (DB, U — same engine/tests as TASK-025)                  |
| TASK-035 | Staff cannot create/edit templates                                           | DB      | AC-05        | PASS (DB, E2E)                                                |
| TASK-040 | Recurring daily occurrences                                                  | DB, U   | AC-14        | TODO                                                          |
| TASK-041 | Recurring weekly                                                             | DB, U   | AC-14        | TODO                                                          |
| TASK-042 | Selected weekdays / weekdays / monthly                                       | DB, U   | AC-14        | TODO                                                          |
| TASK-043 | Occurrences keep independent history; generation idempotent                  | DB      | AC-14        | TODO                                                          |
| TASK-044 | End by date / after N occurrences                                            | U       | AC-14        | TODO                                                          |
| TASK-045 | Edit this-occurrence vs this-and-future never alters completed ones          | DB      | AC-14        | TODO                                                          |
| TASK-050 | Assignment notification                                                      | DB      | AC-15        | PASS                                                          |
| TASK-051 | Reassignment notification                                                    | DB      | AC-15        | PASS                                                          |
| TASK-052 | Due-soon / overdue notifications (deduped)                                   | DB      | AC-15        | TODO                                                          |
| TASK-053 | Unread count; mark read                                                      | DB, U   | AC-15        | TODO                                                          |
| TASK-054 | Checklist available notification                                             | DB      | AC-15        | PASS (DB)                                                     |
| TASK-060 | Staff cannot read audit history                                              | DB, E2E | AC-08        | PASS (DB, U, E2E staff view)                                  |
| TASK-061 | Manager can read audit history                                               | DB, E2E | AC-08        | PASS (DB, U, E2E)                                             |
| TASK-062 | Events are append-only (update/delete blocked)                               | DB      | AC-08        | PASS                                                          |
| TASK-070 | Cross-organization / cross-location reference rejected                       | DB      | AC-19        | PASS                                                          |
| TASK-071 | Invalid / inactive / foreign assignee rejected                               | DB      | AC-19        | PASS                                                          |
| TASK-072 | Staff of org B cannot read org A tasks                                       | DB      | AC-19        | PASS                                                          |
| TASK-080 | Mobile Tasks navigation                                                      | E2E     | AC-01, AC-18 | PASS (E2E mobile)                                             |
| TASK-081 | Tablet Tasks                                                                 | E2E     | AC-18        | PASS (E2E tablet)                                             |
| TASK-082 | Table Rotation + Tasks remain primary                                        | U, E2E  | AC-01        | PASS (E2E all viewports)                                      |
| TASK-083 | Mutation failure reverts optimistic state; server truth wins                 | U       | AC-21        | TODO                                                          |
| TASK-084 | Reload / refocus reconciles stale state (no Realtime)                        | E2E     | AC-21        | PARTIAL (E2E re-mount refetch; real-mode focus refetch in T8) |
