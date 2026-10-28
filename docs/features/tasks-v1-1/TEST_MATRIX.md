# Tasks V1.1 — Test Matrix

Layers: **U** Vitest · **D** pgTAP · **E** Playwright (desktop, host-tablet, server-mobile) · **H** hosted DEV. IDs follow the owner brief.

| ID     | Behaviour                                                                                                                                                      | Layers  | Phase   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| TS-001 | Root and sign-in without a requested module land on Tasks → Today; dock highlights Tasks                                                                       | U, E    | T-1     |
| TS-002 | `?tab=allocation` opens Table Allocation                                                                                                                       | U, E    | T-1     |
| TS-003 | `?tab=schedule` opens Schedule                                                                                                                                 | E       | T-1     |
| TS-004 | Reload on an explicit module keeps it; browser back/forward move between modules                                                                               | E       | T-1     |
| TS-005 | A module the role may not open (`bar-inventory` as staff) falls back to Tasks                                                                                  | U, E    | T-1     |
| TS-006 | Missing or invalid `?tab=` (unknown value, empty, wrong case) falls back to Tasks → Today                                                                      | U, E    | T-1     |
| TS-007 | `?tab=bar-inventory` opens Bar Inventory for management and survives reload                                                                                    | U, E    | T-1     |
| TS-008 | `/r/[slug]?tab=<module>` keeps the roster/location route and opens the module                                                                                  | U, E    | T-1     |
| TS-009 | Mobile dock highlights Tasks on a default launch and follows `?tab=` otherwise                                                                                 | E       | T-1     |
| TS-010 | Owner: All Staff lists every person's work with names                                                                                                          | U, E    | T-2     |
| TS-011 | Manager: same                                                                                                                                                  | U, E    | T-2     |
| TS-012 | Assistant Manager: same                                                                                                                                        | U, E    | T-2     |
| TS-013 | My Tasks scope equals the viewer's named work                                                                                                                  | U, E    | T-2     |
| TS-014 | Specific person scope; shared work not attributed                                                                                                              | U, E    | T-2     |
| TS-015 | Name rule: individual / multiple / Whole team / Anyone; nothing invented                                                                                       | U       | T-2     |
| TS-016 | Staff has no selector and cannot read a coworker's individual task (RLS)                                                                                       | U, D, E | T-2     |
| TS-017 | Selector is keyboard operable and usable at 390 px                                                                                                             | E       | T-2     |
| TS-040 | Normal-task assigned / reassigned / completed / due-soon / overdue store no notification                                                                       | U, D    | T-3     |
| TS-041 | Opening/Closing `checklist_available`, assigned and completed-for-you still stored                                                                             | U, D    | T-3     |
| TS-042 | `task_events` rows are unchanged by the gate (audit preserved)                                                                                                 | D       | T-3     |
| TS-043 | TS demo engine and SQL agree (shared vectors)                                                                                                                  | U, D    | T-3     |
| TS-020 | Opening complete at store open → no reminder, no popup                                                                                                         | D, E    | T-4/T-5 |
| TS-021 | Incomplete at open → `OPEN` stored once per eligible recipient (management + authorized staff)                                                                 | D, E    | T-4/T-5 |
| TS-022 | Incomplete at +15 → `OPEN_PLUS_15`                                                                                                                             | D       | T-4     |
| TS-023 | Incomplete at +30 → `OPEN_PLUS_30`                                                                                                                             | D       | T-4     |
| TS-024 | Complete at T+8 → no +15, no +30                                                                                                                               | D       | T-4     |
| TS-025 | Complete T+5, reopened T+20 → +15 skipped, +30 emitted                                                                                                         | D       | T-4     |
| TS-026 | Reload / repeated RPC → no duplicate row                                                                                                                       | D, E    | T-4/T-5 |
| TS-027 | Two tabs → one row, one popup per tab, dismissed state shared                                                                                                  | E       | T-5     |
| TS-028 | Reconnect / retry → idempotent                                                                                                                                 | D       | T-4     |
| TS-029 | Opening instant uses `locations.time_zone`, not the session or browser zone                                                                                    | D       | T-4     |
| TS-030 | DST: spring-forward gap, fall-back overlap, +15/+30 stay 15 min apart as instants                                                                              | D       | T-4     |
| TS-031 | CTA opens Tasks → Opening and marks the stage read                                                                                                             | E       | T-5     |
| TS-032 | Dismiss leaves every task status unchanged                                                                                                                     | D, E    | T-5     |
| TS-033 | Staff privacy, enforced in stored data: no coworker-only item, count or detail in any staff reminder                                                           | D, E    | T-4/T-5 |
| TS-039 | Staff authorized for incomplete Opening work (assignee / `all_team` / `anyone`) get a reminder whose count covers only that scope; management count covers all | D, E    | T-4/T-5 |
| TS-045 | Cancelled Opening items never count; all complete-or-cancelled → no reminder for anyone                                                                        | D       | T-4     |
| TS-046 | Staff with no authorized incomplete Opening item get nothing even when management does                                                                         | D, E    | T-4/T-5 |
| TS-034 | Late open: all truly-missed stages stored, only newest unread shown, older in history                                                                          | D, E    | T-4/T-5 |
| TS-035 | No stage after +30 (T+45, T+60, T+4 h)                                                                                                                         | D       | T-4     |
| TS-036 | `operating_hours` day closed, or no hours row → fallback / nothing, never a hardcoded time                                                                     | D       | T-4     |
| TS-037 | Cross-location and cross-organization isolation of sweep and recipients                                                                                        | D       | T-4     |
| TS-038 | Caller who is not an active member is rejected; client cannot pass recipients                                                                                  | D       | T-4     |
| TS-050 | Hosted DEV: sweep with a real location and time zone, no leftovers                                                                                             | H       | T-6     |

Phase gates: targeted U → focused D (`supabase test db` on the touched files) → focused E → phase regression (full Tasks spec plus anything the change touches) → exact-head CI. T-6 runs the full three-project suite and the hosted DEV suite on a production build.

## T-2 evidence (Management Today, #169)

| ID              | Result                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-010 / TS-011 | U `management-today.test.tsx` (Owner, Manager) and E `management-today.spec.ts` (demo owner 9999, manager 2468) PASS                                                                                     |
| TS-012          | U (Assistant Manager, `asa`) PASS. **No Assistant Manager demo passcode exists, so no Playwright run** (recorded gap)                                                                                    |
| TS-013 / TS-014 | U (`task-rules.test.ts`, `management-today.test.tsx`) and E PASS. My Tasks = existing assigned-or-shared rule; person = named assignees by profile id only                                               |
| TS-015          | U `staffLabel` PASS (individual, multiple, Whole team, Anyone, nothing invented)                                                                                                                         |
| TS-016          | U (staff: no selector, no coworker row; `resolveScope` pins staff to all; engine snapshot test) and E PASS. **D: existing pgTAP 0026 (RLS) is the server proof; not re-run in T-2 (no database change)** |
| TS-017          | E PASS: labelled native `<select>`, focusable, 44 px, inside the viewport, no horizontal overflow                                                                                                        |
| Audit actor     | U + E: a manager completing from a person view is the actor (`Completed by <manager>`), the assignee is unchanged                                                                                        |
| Cross-org       | Not new: no new query; the roster and tasks queries are unchanged and RLS-scoped (pgTAP 0026 / `tasks-v1.db.real.test.ts` own the tenant seam). **Not re-run in T-2.**                                   |

## T-3 evidence (Notification narrowing, #154)

| ID      | Result                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-040  | U `notifications.test.ts` and D `0041` (+ updated `0026`, `0029`) PASS: normal assigned / reassigned / completed / due-soon / overdue store nothing. E `tasks.spec.ts` asserts no inbox item for an ordinary assignment                        |
| TS-041  | U + D PASS: `checklist_available` (Opening and Closing) stored; Opening / Closing assigned / reassigned / completed-for-you pass the gate to the named recipient only. **No caller emits the task-bearing ones today (finding in the report)** |
| TS-042  | D `0041` PASS: create → reassign → complete → reopen → cancel leave `created, reassigned, completed, reopened, cancelled` in `task_events` (actor preserved) with zero notifications; legacy rows survive. U asserts the engine events         |
| TS-043  | U + D PASS: the same 13 (type, source kind) vectors in `notifications.test.ts` and `0041`                                                                                                                                                      |
| Privacy | D PASS: staff read only their own notifications; another organization reads none; cross-org task id and inactive recipient store nothing; dedupe key idempotency holds                                                                         |

## T-4 evidence (Opening reminder engine, #154)

D = pgTAP 0042 (108 assertions, real Supabase PG17), H = hosted DEV `tasks-opening-reminders.db.real.test.ts` (7) and `tasks-v1.db.real.test.ts` (12), U = Vitest. The E (browser) halves of TS-020/021/026/033/034/039/046 belong to T-5 (no UI in T-4).

| ID                | Result                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-020            | D PASS: all items complete before opening -> 0 reminders at OPEN and at every later look                                                                                                                                                                             |
| TS-021            | D + H PASS: OPEN stored once per eligible recipient (3 management + the 3 authorized staff in D; owner, manager, server1 in H). Boundary: 0 at 08:59:59, stored at 09:00:00                                                                                          |
| TS-022 / TS-023   | D PASS: plus_15 not due at 09:14:59, stored at 09:15:00; plus_30 not due at 09:29:59, stored at 09:30:00; stage_at is exactly +15 / +30 minutes                                                                                                                      |
| TS-024            | D PASS: complete at T+8 after OPEN was stored -> no plus_15, no plus_30                                                                                                                                                                                              |
| TS-025            | D PASS: complete T+5, reopened T+20, first look T+31 -> OPEN and plus_30 stored, plus_15 **not** back-filled                                                                                                                                                         |
| TS-026 / TS-028   | D + H PASS: repeating an evaluation, a different member calling, five-member parallel sweep and 7 further parallel calls store nothing more; unique (recipient, dedupe_key); two real backends race -> sum of reported stores = rows                                 |
| TS-029            | D PASS: opening uses the location zone, not the session zone (session set to Pacific/Auckland): NY 09:00 = 13:00Z, Chicago 09:00 = 14:00Z                                                                                                                            |
| TS-030            | D PASS: spring-forward 01:50 EST -> +15/+30 at 07:05Z/07:20Z (03:05/03:20 EDT); 09:00 is 14:00Z on 03-07 and 13:00Z on 03-09; a non-existent (02:30) and an ambiguous (01:50) opening time still give +15/+30 exactly 15/30 minutes apart; fall-back 00:50 EDT exact |
| TS-033            | D + H PASS: staff reminders hold only their own count, no task/instance id, no names; each person reads only their own rows through RLS; org B reads none                                                                                                            |
| TS-034            | D PASS: late first look stores every truly missed stage once (3 x recipients), bounded at one row per stage per recipient per date. Newest-unread display is T-5                                                                                                     |
| TS-035            | D PASS: nothing at 09:31, 09:45, 10:00, 13:00, 23:59:59                                                                                                                                                                                                              |
| TS-036            | D PASS: closed `operating_hours` day -> nothing; `operating_hours` 10:30 beats the 09:00 fallback; no hours row -> `locations.opening_local`                                                                                                                         |
| TS-037            | D + H PASS: sweeping one location stores nothing about another; another organization / a foreign location is rejected (42501)                                                                                                                                        |
| TS-038            | D + H PASS: anon, another org, an inactive member rejected; the RPC argument list is exactly (organization, location); the evaluator, writer and recipient helper are not callable by clients and not reachable over the API                                         |
| TS-039            | D + H PASS: management count = all items, staff count = only theirs (4/4/4/3/3/2); count at the stage instant vs now (2 vs 1) recorded separately                                                                                                                    |
| TS-045            | D PASS: all cancelled -> nothing for anyone; cancelled before plus_15 -> no plus_15/plus_30; cancelled before plus_30 -> no plus_30                                                                                                                                  |
| TS-046            | D PASS: with only Bea's own item open, management and Bea are reminded; Ann and Hal get nothing                                                                                                                                                                      |
| Recipient changes | D PASS: a deactivated member gets nothing; a role change (host -> Assistant Manager) widens the scope to the whole checklist; a reassigned individual item moves with the assignee                                                                                   |
| T-3 regression    | D + U PASS: ordinary assigned/overdue still dropped; `checklist_available` and Opening-task notifications still pass; legacy notifications survive; no audit event written by the engine                                                                             |
| Business date     | D PASS: 04:30Z on 06-16 is 23:30 on 06-15 in Chicago -> evaluates 06-15; rows carry service_date 06-15; at local midnight the date rolls and yesterday is not re-announced                                                                                           |
| TS-050            | Not T-4: T-6 owns the hosted final-gate run (T-4 already ran two hosted suites; see the report)                                                                                                                                                                      |
