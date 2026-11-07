# Tasks entry points

| Boundary                                                              | Binding                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Snapshot / history / date work                                        | verified scope, timezone and actor; location workforce                |
| Create / template save / series create                                | verified organization/location; SQL role and workforce eligibility    |
| Update / assign / status / complete / reopen / cancel / carry-forward | each resource ID matches workspace; SQL exact-resource authorization  |
| Template activation / series update-stop                              | resource workspace and effective management role                      |
| Checklist / recurrence generation                                     | exact location, revoked target filtering, preserved historical copies |
| Reminder prompt / badge                                               | workspace expectation; own notification source location               |
| Opening / due-soon / overdue sweep                                    | tasks_begin; server clock and exact recipient scope                   |
| Notification read state                                               | live own recipient only; module/location recovery exemption           |
| People and actor names                                                | narrow Tasks workforce/history RPC; no general profiles expansion     |

SQL seams: tasks_can_access_location, tasks_profile_can_access_location, tasks_can_view/work, management checks, child policies, tasks_notify and tasks_opening_reminders_run. Preserve tasks_begin module assertion.

Workspace inbox dismissal calls `task_notifications_mark_location_read` with verified organization/location and optional IDs; SQL checks tasks_begin and atomically updates only the live caller's rows at that location. A null list marks all there without a REST row cap. The original `task_notifications_mark_read(bigint[])` and explicit-ID acknowledgment action remain the separate live-own-recipient recovery exemptions.
