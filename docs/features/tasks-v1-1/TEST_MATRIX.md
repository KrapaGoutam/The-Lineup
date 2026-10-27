# Tasks V1.1 — Test Matrix

Layers: **U** Vitest · **D** pgTAP · **E** Playwright (desktop, host-tablet, server-mobile) · **H** hosted DEV. IDs follow the owner brief.

| ID     | Behaviour                                                                                  | Layers  | Phase   |
| ------ | ------------------------------------------------------------------------------------------ | ------- | ------- |
| TS-001 | Root and sign-in without a requested module land on Tasks → Today; dock highlights Tasks   | U, E    | T-1     |
| TS-002 | `?tab=allocation` opens Table Allocation                                                   | U, E    | T-1     |
| TS-003 | `?tab=schedule` opens Schedule                                                             | E       | T-1     |
| TS-004 | Reload on an explicit module keeps it; browser back/forward move between modules           | E       | T-1     |
| TS-005 | A module the role may not open (`barInventory` as staff) falls back to Tasks               | U, E    | T-1     |
| TS-010 | Owner: All Staff lists every person's work with names                                      | U, E    | T-2     |
| TS-011 | Manager: same                                                                              | U, E    | T-2     |
| TS-012 | Assistant Manager: same                                                                    | U, E    | T-2     |
| TS-013 | My Tasks scope equals the viewer's named work                                              | U, E    | T-2     |
| TS-014 | Specific person scope; shared work not attributed                                          | U, E    | T-2     |
| TS-015 | Name rule: individual / multiple / Whole team / Anyone; nothing invented                   | U       | T-2     |
| TS-016 | Staff has no selector and cannot read a coworker's individual task (RLS)                   | U, D, E | T-2     |
| TS-017 | Selector is keyboard operable and usable at 390 px                                         | E       | T-2     |
| TS-040 | Normal-task assigned / reassigned / completed / due-soon / overdue store no notification   | U, D    | T-3     |
| TS-041 | Opening/Closing `checklist_available` and item notifications still stored                  | U, D    | T-3     |
| TS-042 | `task_events` rows are unchanged by the gate (audit preserved)                             | D       | T-3     |
| TS-043 | TS demo engine and SQL agree (shared vectors)                                              | U, D    | T-3     |
| TS-020 | Opening complete at store open → no reminder, no popup                                     | D, E    | T-4/T-5 |
| TS-021 | Incomplete at open → `OPEN` stored once for each manager-level recipient                   | D, E    | T-4/T-5 |
| TS-022 | Incomplete at +15 → `OPEN_PLUS_15`                                                         | D       | T-4     |
| TS-023 | Incomplete at +30 → `OPEN_PLUS_30`                                                         | D       | T-4     |
| TS-024 | Complete at T+8 → no +15, no +30                                                           | D       | T-4     |
| TS-025 | Complete T+5, reopened T+20 → +15 skipped, +30 emitted                                     | D       | T-4     |
| TS-026 | Reload / repeated RPC → no duplicate row                                                   | D, E    | T-4/T-5 |
| TS-027 | Two tabs → one row, one popup per tab, dismissed state shared                              | E       | T-5     |
| TS-028 | Reconnect / retry → idempotent                                                             | D       | T-4     |
| TS-029 | Opening instant uses `locations.time_zone`, not the session or browser zone                | D       | T-4     |
| TS-030 | DST: spring-forward gap, fall-back overlap, +15/+30 stay 15 min apart as instants          | D       | T-4     |
| TS-031 | CTA opens Tasks → Opening and marks the stage read                                         | E       | T-5     |
| TS-032 | Dismiss leaves every task status unchanged                                                 | D, E    | T-5     |
| TS-033 | Staff receive no global reminder and see no hidden task state                              | D, E    | T-4/T-5 |
| TS-034 | Late open: all truly-missed stages stored, only newest unread shown, older in history      | D, E    | T-4/T-5 |
| TS-035 | No stage after +30 (T+45, T+60, T+4 h)                                                     | D       | T-4     |
| TS-036 | `operating_hours` day closed, or no hours row → fallback / nothing, never a hardcoded time | D       | T-4     |
| TS-037 | Cross-location and cross-organization isolation of sweep and recipients                    | D       | T-4     |
| TS-038 | Caller who is not an active member is rejected; client cannot pass recipients              | D       | T-4     |
| TS-050 | Hosted DEV: sweep with a real location and time zone, no leftovers                         | H       | T-6     |

Phase gates: targeted U → focused D (`supabase test db` on the touched files) → focused E → phase regression (full Tasks spec plus anything the change touches) → exact-head CI. T-6 runs the full three-project suite and the hosted DEV suite on a production build.
